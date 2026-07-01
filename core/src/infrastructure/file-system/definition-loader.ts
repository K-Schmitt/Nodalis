import * as fs from 'fs';
import path from 'path';
import { DefinitionSchema } from '../../domain/types.js';
import { SchemaValidationError } from '../../errors/schema-validation-error.js';
import { Registry } from '../../domain/registry.js';
import chokidar from 'chokidar';

/** Folders that never contain node definitions. */
const NON_DEFINITION_DIRS = new Set(['presets']);

/**
 * Definition Loader - Reads *.def.json files from disk (infrastructure layer).
 *
 * Loading is preset-scoped: {@link loadIncludeSync} loads only the folders listed
 * by the active preset (or everything when `"*"` is included). Synchronous so the
 * registry can be re-derived cheaply whenever the active workspace/preset changes.
 */
export class DefinitionLoader {
  private definitionsPath: string;
  private watcher?: chokidar.FSWatcher;

  constructor(definitionsPath: string = './definitions') {
    this.definitionsPath = path.resolve(definitionsPath);
  }

  /**
   * Load every `*.def.json` under the given include folders into the registry.
   * Pass `["*"]` to load the entire definitions tree.
   */
  loadIncludeSync(registry: Registry, includeDirs: string[]): void {
    const roots = includeDirs.includes('*')
      ? [this.definitionsPath]
      : includeDirs.map((dir) => path.join(this.definitionsPath, dir));

    let loaded = 0;
    let failed = 0;
    for (const root of roots) {
      if (!fs.existsSync(root)) {
        console.error(`  ⚠️  Include folder not found: ${root}`);
        continue;
      }
      for (const file of this.collectDefFilesSync(root)) {
        try {
          this.loadFileSync(file, registry);
          loaded++;
        } catch (err) {
          console.error(`  ✗ Skipped ${file}:`, err instanceof Error ? err.message : err);
          failed++;
        }
      }
    }

    console.error(`✅ Loaded ${loaded} definition(s)${failed ? `, ${failed} skipped` : ''} from [${includeDirs.join(', ')}]`);
  }

  /** Recursively collect all *.def.json files under a directory. */
  private collectDefFilesSync(dirPath: string): string[] {
    const results: string[] = [];
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (NON_DEFINITION_DIRS.has(entry.name)) continue;
        results.push(...this.collectDefFilesSync(path.join(dirPath, entry.name)));
      } else if (entry.isFile() && entry.name.endsWith('.def.json')) {
        results.push(path.join(dirPath, entry.name));
      }
    }
    return results;
  }

  /** Load and validate a single definition file. */
  private loadFileSync(filePath: string, registry: Registry): void {
    const json = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const result = DefinitionSchema.safeParse(json);
    if (!result.success) {
      throw new SchemaValidationError(`Invalid definition schema in ${filePath}`, result.error);
    }
    registry.register(result.data);
  }

  /**
   * Watch definition files for changes (dev mode). Fires `onChange` for any
   * add/change/unlink — the caller decides how to reload (preset-aware).
   */
  watchChanges(onChange: () => void): void {
    console.error(`👀 Watching for changes in ${this.definitionsPath} (recursive)`);

    this.watcher = chokidar.watch(`${this.definitionsPath}/**/*.{def,preset}.json`, {
      persistent: true,
      ignoreInitial: true,
    });

    const handle = (event: string) => (filePath: string) => {
      console.error(`🔄 Definition ${event}: ${filePath}`);
      onChange();
    };

    this.watcher
      .on('add', handle('added'))
      .on('change', handle('changed'))
      .on('unlink', handle('removed'));
  }

  async stopWatching(): Promise<void> {
    if (this.watcher) await this.watcher.close();
  }
}
