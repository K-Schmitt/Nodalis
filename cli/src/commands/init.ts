import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { multiselect, isCancel, cancel, intro, outro, log } from '@clack/prompts';
import { CliConfigSchema, ClientIdSchema, DEFAULT_CONFIG, parseCliConfig, type ClientId, type CliConfig } from '../config.js';
import { McpConfigError } from '../errors.js';
import { buildEntry, mergeServer } from '../lib/mcp-config.js';
import { clientContext, detectInstalledClients, resolveClient } from '../lib/paths.js';

export function readTextIfExists(file: string): string | null {
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

export function atomicWrite(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, file);
}

function backupIfAbsent(file: string): void {
  const bak = `${file}.bak`;
  if (existsSync(file) && !existsSync(bak)) copyFileSync(file, bak);
}

function configPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.archi', 'cli.json');
}

export function readCliConfig(workspaceRoot: string): CliConfig {
  const text = readTextIfExists(configPath(workspaceRoot));
  if (!text) return { ...DEFAULT_CONFIG };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new McpConfigError('.archi/cli.json is unreadable (invalid JSON) — fix or delete it, then retry.');
  }
  return parseCliConfig(raw);
}

function writeCliConfig(workspaceRoot: string, cfg: CliConfig): void {
  atomicWrite(configPath(workspaceRoot), JSON.stringify(CliConfigSchema.parse(cfg), null, 2) + '\n');
}

async function chooseClients(opts: { client?: string }, detected: ClientId[]): Promise<ClientId[]> {
  if (opts.client === 'all') return ['cursor', 'claude', 'vscode'];
  if (opts.client) {
    const parsed = ClientIdSchema.safeParse(opts.client);
    if (!parsed.success) throw new McpConfigError(`Unknown --client "${opts.client}" (cursor|claude|vscode|all)`);
    return [parsed.data];
  }
  if (detected.length === 0) throw new McpConfigError('No MCP client detected. Pass --client cursor|claude|vscode|all.');
  const picked = await multiselect({
    message: 'Configure MCP for which client(s)?',
    options: detected.map((id) => ({ value: id, label: id })),
    required: true,
  });
  if (isCancel(picked)) { cancel('Aborted.'); process.exit(0); }
  return picked as ClientId[];
}

export async function init(opts: { client?: string }): Promise<void> {
  intro('archi-os init');
  const ctx = clientContext();
  const workspaceRoot = ctx.workspaceRoot;
  const coreDist = resolve(workspaceRoot, 'core', 'dist', 'index.js');
  if (!existsSync(coreDist)) {
    log.warn(`core not built at ${coreDist} — run "npm run build:core" before starting the MCP client.`);
  }

  const detected = detectInstalledClients(ctx);
  const chosen = await chooseClients(opts, detected);

  for (const id of chosen) {
    const d = resolveClient(id, ctx);
    const before = readTextIfExists(d.file) ?? '';
    // VSCode resolves ${workspaceFolder}/${userHome} at load time — use portable
    // variables there; Cursor/Claude configs have no workspace context, so bake
    // absolute paths for them.
    const useVar = d.id === 'vscode';
    const entry = buildEntry({
      distPath: useVar ? '${workspaceFolder}/core/dist/index.js' : coreDist,
      workspaceRoot: useVar ? '${workspaceFolder}' : workspaceRoot,
      browseRoot: useVar ? '${userHome}' : ctx.home,
      entryShape: d.entry,
    });
    const after = mergeServer(before, entry, d.key);
    if (after === before && before !== '') { log.info(`${id}: already configured (no change).`); continue; }
    backupIfAbsent(d.file);
    atomicWrite(d.file, after.endsWith('\n') ? after : after + '\n');
    log.success(`${id}: wrote ${d.file}`);
  }

  const cfg = readCliConfig(workspaceRoot);
  const clients = Array.from(new Set([...cfg.clients, ...chosen]));
  writeCliConfig(workspaceRoot, { ...cfg, clients });
  outro('MCP configured. Restart your MCP client to load archi-os.');
}
