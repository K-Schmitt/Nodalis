import * as fs from 'fs';
import * as path from 'path';
import { PresetSchema, type Preset } from '../../domain/types.js';

/**
 * Reads and validates architecture presets from `<definitions>/presets/*.preset.json`.
 * Presets are the "subset" mechanism — each declares which definition folders and
 * global rules an architecture type (web, game, …) uses.
 *
 * `definitionsPath` may carry several roots separated by the OS path delimiter
 * (see {@link DefinitionLoader}); presets are merged across roots, and a later
 * root (e.g. the workspace) overrides an earlier one (e.g. bundled) by preset id.
 */
export class PresetLoader {
  private readonly presetsDirs: string[];

  constructor(definitionsPath: string) {
    this.presetsDirs = definitionsPath
      .split(path.delimiter)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((p) => path.join(path.resolve(p), 'presets'));
  }

  list(): Preset[] {
    // Merge presets across roots; later roots override earlier ones by id.
    const byId = new Map<string, Preset>();
    for (const dir of this.presetsDirs) {
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.preset.json'))) {
        const preset = this.read(path.join(dir, f));
        if (preset) byId.set(preset.id, preset);
      }
    }
    return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  get(id: string): Preset | undefined {
    return this.list().find((p) => p.id === id);
  }

  has(id: string): boolean {
    return this.get(id) !== undefined;
  }

  private read(file: string): Preset | null {
    try {
      const parsed = PresetSchema.safeParse(JSON.parse(fs.readFileSync(file, 'utf-8')));
      if (!parsed.success) {
        console.error(`  ✗ Invalid preset ${file}:`, parsed.error.issues);
        return null;
      }
      return parsed.data;
    } catch (err) {
      console.error(`  ✗ Failed to read preset ${file}:`, err instanceof Error ? err.message : err);
      return null;
    }
  }
}
