// The explorer sorted by modified lists the newest first, folders ahead of files; raising the
// mtimes in each folder makes it read in a name order where `x.ts` comes before `x-y.ts`.
const { execFile } = require('node:child_process');
const { readdir, stat, utimes } = require('node:fs/promises');
const { dirname, join } = require('node:path');
const vscode = require('vscode');

exports.activate = (context) => {
  const collator = new Intl.Collator(undefined, { numeric: true });
  const dirty = new Set();
  let timer;
  let running = Promise.resolve();

  // Names are compared piece by piece between dots, so a `.` sorts before any other
  // character: `x.ts` and `x.test.ts` come ahead of `x-y.ts`
  const compare = (a, b) => {
    const left = a.split('.');
    const right = b.split('.');
    for (let i = 0; i < Math.min(left.length, right.length); i++) {
      const order = collator.compare(left[i], right[i]);
      if (order) return order;
    }
    return left.length - right.length;
  };

  // Only folders holding files git keeps, so node_modules and build output are never walked.
  const known = (root) =>
    new Promise((resolve) =>
      execFile(
        'git',
        ['ls-files', '-c', '-o', '-z', '--exclude-standard'],
        { cwd: root, maxBuffer: 1 << 26 },
        (error, out) => {
          const folders = new Set([root]);
          for (const file of error ? [] : out.split('\0').filter(Boolean)) {
            for (
              let dir = dirname(join(root, file));
              !folders.has(dir);
              dir = dirname(dir)
            ) {
              folders.add(dir);
            }
          }
          resolve(folders);
        },
      ),
    );

  const order = async (dir, hidden) => {
    const names = await readdir(dir).catch(() => []);
    const entries = await Promise.all(
      names
        .filter((name) => !hidden.includes(name))
        .map(async (name) => {
          const info = await stat(join(dir, name)).catch(() => undefined);
          return (
            info && {
              path: join(dir, name),
              name,
              folder: info.isDirectory(),
              atime: info.atime,
              mtime: Math.trunc(info.mtimeMs),
            }
          );
        }),
    );
    const unsaved = vscode.workspace.textDocuments
      .filter((document) => document.isDirty)
      .map((document) => document.uri.fsPath);
    for (const folder of [true, false]) {
      const list = entries
        .filter((entry) => entry?.folder === folder)
        .sort((a, b) => compare(a.name, b.name));
      for (let i = list.length - 2; i >= 0; i--) {
        // Raised only, so cargo never takes an edited file as built; an unsaved file is left,
        // as VS Code refuses to save over a file that changed on disk
        if (list[i].mtime > list[i + 1].mtime || unsaved.includes(list[i].path))
          continue;
        list[i].mtime = list[i + 1].mtime + 1;
        // Half a millisecond over, as seconds in a float round some down by a millisecond
        await utimes(
          list[i].path,
          list[i].atime,
          (list[i].mtime + 0.5) / 1000,
        ).catch(() => {});
      }
    }
  };

  const flush = (all) => {
    running = running.then(async () => {
      if (
        vscode.workspace.getConfiguration('explorer').inspect('sortOrder')
          ?.workspaceValue !== 'modified'
      ) {
        return;
      }
      const marked = [...dirty];
      dirty.clear();
      // Only `**/name` excludes are read, which covers the defaults like `**/.git`
      const hidden = Object.entries(
        vscode.workspace.getConfiguration('files').get('exclude') ?? {},
      )
        .filter(
          ([glob, on]) => on === true && /^\*\*\/[^*?{}[\]/]+$/.test(glob),
        )
        .map(([glob]) => glob.slice(3));
      for (const workspace of vscode.workspace.workspaceFolders ?? []) {
        const folders = await known(workspace.uri.fsPath);
        for (const dir of all
          ? folders
          : marked.filter((dir) => folders.has(dir))) {
          await order(dir, hidden);
        }
      }
    });
  };

  const mark = (uri) => {
    // A created or deleted entry moves its folder's mtime too, so the folder above reorders
    dirty.add(dirname(uri.fsPath)).add(dirname(dirname(uri.fsPath)));
    clearTimeout(timer);
    timer = setTimeout(() => flush(false), 300);
  };

  const watcher = vscode.workspace.createFileSystemWatcher('**/*');
  context.subscriptions.push(
    watcher,
    watcher.onDidCreate(mark),
    watcher.onDidChange(mark),
    watcher.onDidDelete(mark),
    vscode.workspace.onDidChangeConfiguration(
      (event) =>
        event.affectsConfiguration('explorer.sortOrder') && flush(true),
    ),
  );
  flush(true);
};
