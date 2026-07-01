import { Definition } from './types.js';
import { DefinitionNotFoundError } from '../errors/definition-not-found-error.js';

/**
 * Registry - In-Memory Store for Definitions
 * Single Source of Truth for type validation
 */
export class Registry {
  private definitions: Map<string, Definition> = new Map();

  /**
   * Load a definition into the registry
   */
  register(definition: Definition): void {
    this.definitions.set(definition.typeId, definition);
  }

  /**
   * Retrieve a definition by typeId
   * @throws DefinitionNotFoundError if not found
   */
  get(typeId: string): Definition {
    const definition = this.definitions.get(typeId);
    if (!definition) {
      throw new DefinitionNotFoundError(typeId);
    }
    return definition;
  }

  /**
   * Retrieve a definition by typeId without throwing (returns undefined if not found)
   */
  tryGet(typeId: string): Definition | undefined {
    return this.definitions.get(typeId);
  }

  /**
   * Check if a definition exists
   */
  has(typeId: string): boolean {
    return this.definitions.has(typeId);
  }

  /**
   * Get all registered definitions
   */
  getAll(): Definition[] {
    return Array.from(this.definitions.values());
  }

  /**
   * Get all typeIds
   */
  getAllTypeIds(): string[] {
    return Array.from(this.definitions.keys());
  }

  /**
   * Clear all definitions (useful for testing)
   */
  clear(): void {
    this.definitions.clear();
  }

  /**
   * Get the count of registered definitions
   */
  size(): number {
    return this.definitions.size;
  }

  /**
   * Generate XML context for AI prompting
   * Dynamically builds the system prompt based on loaded definitions
   *
   * @returns XML string describing available types and their constraints
   */
  toPromptContext(): string {
    const types = this.getAll();

    if (types.length === 0) {
      return '<available_types>\n  <none>No types loaded</none>\n</available_types>';
    }

    const typeElements = types.map(def => {
      const constraints = def.constraints || {};
      const maxInputs = constraints.maxInputs !== undefined
        ? constraints.maxInputs.toString()
        : 'unlimited';
      const maxOutputs = constraints.maxOutputs !== undefined
        ? constraints.maxOutputs.toString()
        : 'unlimited';

      const allowedSources = constraints.allowedSources && constraints.allowedSources.length > 0
        ? `\n      <allowed_sources>\n${constraints.allowedSources.map(s => `        <source>${s}</source>`).join('\n')}\n      </allowed_sources>`
        : '';

      const allowedTargets = constraints.allowedTargets && constraints.allowedTargets.length > 0
        ? `\n      <allowed_targets>\n${constraints.allowedTargets.map(t => `        <target>${t}</target>`).join('\n')}\n      </allowed_targets>`
        : '';

      const requiredFields = constraints.requiredFields && constraints.requiredFields.length > 0
        ? `\n      <required_fields>${constraints.requiredFields.join(', ')}</required_fields>`
        : '';

      return `  <type id="${def.typeId}">
    <label>${def.label}</label>
    <category>${def.category}</category>
    ${def.description ? `<description>${def.description}</description>` : ''}
    <constraints>
      <max_inputs>${maxInputs}</max_inputs>
      <max_outputs>${maxOutputs}</max_outputs>${allowedSources}${allowedTargets}${requiredFields}
    </constraints>
    <style>
      <shape>${def.style.shape}</shape>
      <color>${def.style.color}</color>
      ${def.style.icon ? `<icon>${def.style.icon}</icon>` : ''}
    </style>
  </type>`;
    }).join('\n');

    return `<available_types>
${typeElements}
</available_types>

<rules>
1. You can only use the types listed above.
2. When proposing connections, ensure the source type is allowed by the target's "allowed_sources" list and the target is in the source's "allowed_targets" list.
3. Respect edge limits (max_inputs, max_outputs). "unlimited" means no limit.
4. Use the "propose_changes" tool to submit your proposals. Never modify the graph directly.
5. If a proposal is rejected, read the error details carefully and suggest a fix.
6. Ensure all required fields are provided when creating nodes.
</rules>`;
  }
}
