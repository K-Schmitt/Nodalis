import { Registry } from '../../domain/registry.js';
import { RuleEngine } from '../../domain/rule-engine.js';
import type { Preset } from '../../domain/types.js';
import { DefinitionLoader } from '../file-system/definition-loader.js';
import { PresetLoader } from '../file-system/preset-loader.js';
import { WorkspaceManager } from '../workspace/workspace-manager.js';

/**
 * Keeps the registry and rule engine in sync with the *active workspace's preset*.
 *
 * This realizes the "subsets" feature: when the active workspace (and thus its
 * architecture type) changes, the set of available node types and the global
 * rules are reloaded to match — cheaply, only when the preset actually changes.
 */
export class PresetRegistry {
  /** `undefined` = never loaded; `null` = loaded for "no workspace". */
  private currentPresetId: string | null | undefined = undefined;
  private activePreset: Preset | null = null;

  constructor(
    private registry: Registry,
    private ruleEngine: RuleEngine,
    private definitionLoader: DefinitionLoader,
    private presetLoader: PresetLoader
  ) {}

  listPresets(): Preset[] {
    return this.presetLoader.list();
  }

  hasPreset(id: string): boolean {
    return this.presetLoader.has(id);
  }

  getActivePreset(): Preset | null {
    return this.activePreset;
  }

  /**
   * Reload the registry/rules to match the *active graph's* effective preset.
   * This is the root workspace preset normally, or a sub-graph's own preset when
   * drilled in (so an ERD sub-graph swaps in ERD types/rules). Cheap no-op when
   * the effective preset is unchanged.
   */
  ensureForActiveWorkspace(workspaces: WorkspaceManager): void {
    const presetId = workspaces.getEffectivePresetId();
    if (presetId === this.currentPresetId) return;
    this.reload(presetId);
  }

  /** Force a reload of the current preset (e.g. after a definition file changed on disk). */
  reloadActive(workspaces: WorkspaceManager): void {
    this.currentPresetId = undefined;
    this.ensureForActiveWorkspace(workspaces);
  }

  private reload(presetId: string | null): void {
    this.registry.clear();
    this.currentPresetId = presetId;

    if (!presetId) {
      this.activePreset = null;
      this.ruleEngine.setPresetRules(undefined);
      this.ruleEngine.setEdgeTypes(undefined);
      return;
    }

    const preset = this.presetLoader.get(presetId);
    if (!preset) {
      // Unknown preset → load everything so the workspace still works.
      console.error(`⚠️  Preset "${presetId}" not found — loading all definitions as fallback`);
      this.definitionLoader.loadIncludeSync(this.registry, ['*']);
      this.activePreset = null;
      this.ruleEngine.setPresetRules(undefined);
      this.ruleEngine.setEdgeTypes(undefined);
      return;
    }

    this.definitionLoader.loadIncludeSync(this.registry, preset.include);
    this.activePreset = preset;
    this.ruleEngine.setPresetRules(preset.rules);
    this.ruleEngine.setEdgeTypes(preset.edgeTypes);
    console.error(`📦 Preset "${preset.id}" active — ${this.registry.size()} types`);
  }
}
