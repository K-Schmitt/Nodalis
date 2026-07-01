import { ArchiOSError } from './base-error.js';

/**
 * Thrown when a workspace references an architecture preset that does not exist
 * in the definitions registry.
 */
export class PresetNotFoundError extends ArchiOSError {
  readonly code = 'ERR_PRESET_NOT_FOUND';

  constructor(presetId: string, availableIds: string[] = []) {
    super(`Preset "${presetId}" not found.`, { presetId, availableIds });
  }
}
