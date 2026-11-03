# Explorer Prefix Sort

A VS Code extension that sorts the explorer so a file comes before the files whose
names start with its name:

```
pure-table-space-search.ts
pure-table-space-search-crawl.ts
pure-table-space-search-result.ts
```

VS Code's own sort puts `pure-table-space-search-crawl.ts` first. It compares whole
names, extension included, and `-` sorts before `.`. No setting changes that.

## Setup

Set the explorer to sort by modified in the workspace's `.vscode/settings.json`:

```json
{
  "explorer.sortOrder": "modified"
}
```

The extension does nothing in a workspace without that setting. The workspace must
be a git repository.

## How it works

Extensions can't change how the explorer sorts. Sorted by modified, the explorer
lists the newest first, with folders ahead of files. The extension raises the
modified times in each folder so that newest-first matches the order it wants.

- Files are compared by name without the extension, so `x` comes before `x-y`.
  Numbers compare as numbers: `v2` before `v10`.
- Folders are compared by their full name.
- It runs when VS Code starts and after each file is saved, created or deleted.
- It only walks folders holding files git tracks or would track, so `node_modules`
  and build output are never walked.
- Entries hidden by `files.exclude` patterns of the form `**/name` are skipped.

## Side effects

- Real modified dates are lost.
- Modified times are only raised, never lowered, so a tool that compares them, such
  as cargo or make, never takes an edited file as already built. Some end up a few
  milliseconds in the future.
- Saving a file raises the times of the files listed before it in the same folder,
  so a dev server watching files, such as Vite, sees those files change too.
- A file with unsaved changes is left alone until it is saved, as VS Code refuses
  to save over a file that changed on disk.

## Install

It is not on the marketplace yet. Build and install it locally, with Node and pnpm:

```bash
git clone https://github.com/ropotvs/vscode-explorer-prefix-sort
cd vscode-explorer-prefix-sort
node install.mjs
```

`install.mjs` packs the extension with `vsce` and installs it with VS Code's `code`
command, taken from `/Applications/Visual Studio Code.app` or else from `PATH`.

## License

[MIT](LICENSE)
