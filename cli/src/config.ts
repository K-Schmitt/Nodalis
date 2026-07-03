import { z } from 'zod';
import { McpConfigError } from './errors.js';

export const ClientIdSchema = z.enum(['cursor', 'claude', 'vscode']);
export type ClientId = z.infer<typeof ClientIdSchema>;

export const CliConfigSchema = z.object({
  ports: z.object({
    core: z.number().int().min(1).max(65535),
    web: z.number().int().min(1).max(65535),
  }),
  clients: z.array(ClientIdSchema),
});

export type CliConfig = z.infer<typeof CliConfigSchema>;

export const DEFAULT_CONFIG: CliConfig = {
  ports: { core: 3000, web: 4173 },
  clients: [],
};

export function parseCliConfig(raw: unknown): CliConfig {
  const result = CliConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new McpConfigError(`Invalid .archi/cli.json: ${result.error.issues[0]?.message ?? 'unknown'}`);
  }
  return result.data;
}
