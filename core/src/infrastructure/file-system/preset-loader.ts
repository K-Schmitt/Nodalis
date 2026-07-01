import * as fs from 'fs';
import * as path from 'path';
import { PresetSchema, type Preset } from '../../domain/types.js';

/**
 * Reads and validates architecture presets from `<definitions>/presets/*.preset.json`.
 * Presets are the "subset" mechanism — each declares which definition folders and
 * global rules an architecture type (web, game, …) uses.
 */
export class PresetLoader {
  private readonly presetsDir: string;

  constructor(definitionsPath: string) {
    this.presetsDir = path.join(path.resolve(definitionsPath), 'presets');
  }

  list(): Preset[] {
    if (!fs.existsSync(this.presetsDir)) return [];
    return fs.readdirSync(this.presetsDir)
      .filter((f) => f.endsWith('.preset.json'))
      .map((f) => this.read(path.join(this.presetsDir, f)))
      .filter((p): p is Preset => p !== null)
      .sort((a, b) => a.id.localeCompare(b.id));
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
