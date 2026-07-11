import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DefinitionLoader } from '../../src/infrastructure/file-system/definition-loader.js';
import { PresetLoader } from '../../src/infrastructure/file-system/preset-loader.js';
import { Registry } from '../../src/domain/registry.js';

function def(typeId: string, label: string): string {
  return JSON.stringify({ typeId, label, category: typeId.split(':')[1], style: { shape: 'rectangle', color: '#333333' } });
}
function writeDef(root: string, cat: string, file: string, typeId: string, label: string): void {
  fs.mkdirSync(path.join(root, cat), { recursive: true });
  fs.writeFileSync(path.join(root, cat, file), def(typeId, label), 'utf-8');
}

describe('multi-root definition/preset loading (DEFINITIONS_PATH list)', () => {
  let bundled: string;
  let workspace: string;

  beforeEach(() => {
    bundled = fs.mkdtempSync(path.join(os.tmpdir(), 'nod-bundled-'));
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'nod-ws-'));
  });
  afterEach(() => {
    fs.rmSync(bundled, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('merges roots, workspace overrides bundled by typeId and adds new types', () => {
    writeDef(bundled, 'ai', 'base.def.json', 'tech:ai:base', 'Bundled Base');
    writeDef(bundled, 'general', 'keep.def.json', 'tech:general:keep', 'Bundled Keep');
    // Workspace overrides one typeId and introduces a new one.
    writeDef(workspace, 'ai', 'base.def.json', 'tech:ai:base', 'Workspace Override');
    writeDef(workspace, 'ai', 'extra.def.json', 'tech:ai:extra', 'Workspace Extra');

    const registry = new Registry();
    const loader = new DefinitionLoader(`${bundled}${path.delimiter}${workspace}`);
    loader.loadIncludeSync(registry, ['ai', 'general']);

    expect(registry.get('tech:ai:base').label).toBe('Workspace Override'); // later root wins
    expect(registry.has('tech:ai:extra')).toBe(true);                       // workspace-only added
    expect(registry.has('tech:general:keep')).toBe(true);                   // bundled-only kept
  });

  it('presets merge across roots with workspace overriding by id', () => {
    const preset = (id: string, label: string) =>
      JSON.stringify({ id, label, include: ['general'] });
    fs.mkdirSync(path.join(bundled, 'presets'), { recursive: true });
    fs.writeFileSync(path.join(bundled, 'presets', 'web.preset.json'), preset('web', 'Bundled Web'), 'utf-8');
    fs.mkdirSync(path.join(workspace, 'presets'), { recursive: true });
    fs.writeFileSync(path.join(workspace, 'presets', 'web.preset.json'), preset('web', 'Workspace Web'), 'utf-8');
    fs.writeFileSync(path.join(workspace, 'presets', 'custom.preset.json'), preset('custom', 'Workspace Custom'), 'utf-8');

    const loader = new PresetLoader(`${bundled}${path.delimiter}${workspace}`);
    const ids = loader.list().map((p) => p.id);
    expect(ids).toContain('web');
    expect(ids).toContain('custom');
    expect(loader.get('web')?.label).toBe('Workspace Web'); // later root wins
  });
});
