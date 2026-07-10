import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Module from 'node:module';

// Regression guard: the *built bundle* must load and register every command.
// A dependency shipping a UMD `main` (e.g. jsonc-parser) can leave an
// unresolved runtime require that throws at module load — before activate()
// runs — which surfaces to users as "command <id> not found". This test loads
// dist/extension.js with a stubbed `vscode` and asserts activation registers
// all commands. Requires the extension to be built first (npm run build).

const require = Module.createRequire(import.meta.url);
const BUNDLE = resolve(__dirname, '../dist/extension.js');

const COMMANDS = [
  'archi-os.open',
  'archi-os.start',
  'archi-os.stop',
  'archi-os.configureMcp',
  'archi-os.createSnapshot',
  'archi-os.refreshVersions',
  'archi-os.restoreVersion',
];

function stubVscode(registered: string[]): Record<string, unknown> {
  const noop = (): void => {};
  const disposable = { dispose: noop };
  class Emitter { event = noop; fire = noop; dispose = noop; }
  return {
    commands: {
      registerCommand: (id: string) => { registered.push(id); return disposable; },
      executeCommand: () => Promise.resolve(),
    },
    window: {
      createStatusBarItem: () => ({ show: noop, dispose: noop, text: '', tooltip: '', command: '' }),
      registerTreeDataProvider: () => disposable,
      onDidChangeActiveColorTheme: () => disposable,
      showInformationMessage: noop, showErrorMessage: noop, showWarningMessage: noop,
      activeColorTheme: { kind: 2 },
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: '/tmp/ws' } }],
      getConfiguration: () => ({ get: (_k: string, d: unknown) => d }),
      onDidSaveTextDocument: () => disposable,
    },
    languages: { createDiagnosticCollection: () => ({ set: noop, dispose: noop }) },
    StatusBarAlignment: { Left: 1 },
    ColorThemeKind: { Light: 1, Dark: 2 },
    EventEmitter: Emitter,
    Uri: { joinPath: (b: { fsPath: string }, ...p: string[]) => ({ fsPath: [b.fsPath, ...p].join('/') }) },
    ViewColumn: { Active: 1 },
  };
}

describe('built bundle activation', () => {
  it.skipIf(!existsSync(BUNDLE))('loads dist/extension.js and registers all commands', () => {
    const registered: string[] = [];
    const vscode = stubVscode(registered);

    // Intercept require('vscode') for the CJS bundle.
    const mod = Module as unknown as { _load: (...a: unknown[]) => unknown };
    const load = mod._load;
    mod._load = function (this: unknown, ...args: unknown[]): unknown {
      return args[0] === 'vscode' ? vscode : load.apply(this, args);
    };
    try {
      delete require.cache[require.resolve(BUNDLE)];
      const ext = require(BUNDLE) as { activate: (ctx: unknown) => void };
      // Must not throw at load or during activate().
      ext.activate({ subscriptions: [], extensionUri: { fsPath: '/tmp/ext' } });
    } finally {
      (Module as unknown as { _load: unknown })._load = load;
    }

    for (const id of COMMANDS) expect(registered).toContain(id);
  });
});
