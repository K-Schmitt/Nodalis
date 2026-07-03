import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Registry } from '../../src/domain/registry.js';
import { DefinitionLoader } from '../../src/infrastructure/file-system/definition-loader.js';
import { PresetLoader } from '../../src/infrastructure/file-system/preset-loader.js';

const definitionsPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../definitions');

describe('Presets + subset loading (real definitions)', () => {
  let registry: Registry;
  let definitionLoader: DefinitionLoader;
  let presetLoader: PresetLoader;

  beforeEach(() => {
    registry = new Registry();
    definitionLoader = new DefinitionLoader(definitionsPath);
    presetLoader = new PresetLoader(definitionsPath);
  });

  it('discovers the web, game and full presets', () => {
    const ids = presetLoader.list().map((p) => p.id);
    expect(ids).toContain('web');
    expect(ids).toContain('game');
    expect(ids).toContain('full');
  });

  it('web preset loads web/database/general types but NOT game or cloud', () => {
    definitionLoader.loadIncludeSync(registry, presetLoader.get('web')!.include);
    expect(registry.has('tech:frontend:react')).toBe(true);
    expect(registry.has('tech:database:postgres')).toBe(true);
    expect(registry.has('tech:general:user')).toBe(true);
    expect(registry.has('game:core:game-loop')).toBe(false);
    expect(registry.has('tech:compute:lambda')).toBe(false);
  });

  it('game preset loads only game + general types', () => {
    definitionLoader.loadIncludeSync(registry, presetLoader.get('game')!.include);
    expect(registry.has('game:core:game-loop')).toBe(true);
    expect(registry.has('game:world:entity')).toBe(true);
    expect(registry.has('tech:general:external-system')).toBe(true);
    expect(registry.has('tech:frontend:react')).toBe(false);
  });

  it('full preset (include "*") loads every domain', () => {
    definitionLoader.loadIncludeSync(registry, presetLoader.get('full')!.include);
    expect(registry.has('tech:frontend:react')).toBe(true);
    expect(registry.has('tech:compute:lambda')).toBe(true);
    expect(registry.has('game:core:game-loop')).toBe(true);
  });

  it('web preset carries a forbidden frontend→database rule', () => {
    const rules = presetLoader.get('web')!.rules;
    expect(rules?.forbiddenConnections).toContainEqual(expect.objectContaining({ from: 'frontend', to: 'database' }));
  });
});
