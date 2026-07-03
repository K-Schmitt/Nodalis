import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser';
import { McpConfigError } from '../errors.js';

export const SERVER_KEY = 'archi-os';

export type McpEntry = {
  command: string;
  args: string[];
  env: Record<string, string>;
  type?: 'stdio';
};

export function buildEntry(
  coreDistPath: string,
  workspaceRoot: string,
  entryShape: 'plain' | 'stdio',
): McpEntry {
  const entry: McpEntry = {
    command: 'node',
    args: [coreDistPath],
    env: { WORKSPACE_ROOT: workspaceRoot },
  };
  if (entryShape === 'stdio') entry.type = 'stdio';
  return entry;
}

const FORMAT = { insertSpaces: true, tabSize: 2 } as const;

function parseOrThrow(text: string): Record<string, unknown> {
  const errors: ParseError[] = [];
  const src = text.trim() === '' ? '{}' : text;
  const value = parse(src, errors, { allowTrailingComma: true }) as Record<string, unknown>;
  if (errors.length > 0) {
    throw new McpConfigError('MCP config file is unreadable — edit it by hand or remove it, then retry.');
  }
  return value ?? {};
}

export function mergeServer(text: string, entry: McpEntry, key: 'mcpServers' | 'servers'): string {
  const src = text.trim() === '' ? '{}' : text;
  const current = parseOrThrow(src);
  const existing = (current[key] as Record<string, unknown> | undefined)?.[SERVER_KEY];
  if (existing && JSON.stringify(existing) === JSON.stringify(entry)) {
    return text; // idempotent: no change
  }
  const edits = modify(src, [key, SERVER_KEY], entry, { formattingOptions: FORMAT });
  return applyEdits(src, edits);
}

export function unmergeServer(text: string, key: 'mcpServers' | 'servers'): string {
  const src = text.trim() === '' ? '{}' : text;
  parseOrThrow(src); // validate parseability
  const edits = modify(src, [key, SERVER_KEY], undefined, { formattingOptions: FORMAT });
  return applyEdits(src, edits);
}
