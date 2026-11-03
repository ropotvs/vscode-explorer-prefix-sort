// Packs the extension and installs it into VS Code, whose `code` command is often not on PATH.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const vsix = join(
  mkdtempSync(join(tmpdir(), 'explorer-prefix-sort-')),
  'explorer-prefix-sort.vsix',
);
execFileSync(
  'pnpm',
  [
    'dlx',
    '@vscode/vsce@4.1.0',
    'package',
    '--no-dependencies',
    '--skip-license',
    '--out',
    vsix,
  ],
  { cwd: import.meta.dirname, stdio: 'inherit' },
);
const app =
  '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code';
execFileSync(
  existsSync(app) ? app : 'code',
  ['--install-extension', vsix, '--force'],
  {
    stdio: 'inherit',
  },
);
