import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ProcessError } from '../errors.js';
import { isPortFree } from './ports.js';

export type ProcEntry = { pid: number; port: number; startedAt: number; cmd: string };
export type RunRegistry = { mode: 'native' | 'docker'; startedAt: number; core?: ProcEntry; web?: ProcEntry };

const runDir = (ws: string): string => join(ws, '.archi', 'cli');
export const runPath = (ws: string): string => join(runDir(ws), 'run.json');
export const logPath = (ws: string, name: string): string => join(runDir(ws), 'logs', `${name}.log`);

export function readRunRegistry(ws: string): RunRegistry | null {
  const p = runPath(ws);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')) as RunRegistry; } catch { return null; }
}

export function writeRunRegistry(ws: string, reg: RunRegistry): void {
  const p = runPath(ws);
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(reg, null, 2), 'utf8');
  renameSync(tmp, p);
}

export function clearRunRegistry(ws: string): void {
  const p = runPath(ws);
  if (existsSync(p)) rmSync(p);
}

export function spawnManaged(args: {
  workspaceRoot: string; name: 'core' | 'web'; command: string; commandArgs: string[];
  env?: Record<string, string>; mode: 'detached' | 'attached'; port: number;
}): ProcEntry {
  const lp = logPath(args.workspaceRoot, args.name);
  mkdirSync(dirname(lp), { recursive: true });
  const out = openSync(lp, 'a');
  const child = spawn(args.command, args.commandArgs, {
    cwd: args.workspaceRoot,
    env: { ...process.env, ...args.env },
    detached: args.mode === 'detached',
    stdio: ['ignore', out, out],
    shell: false,
  });
  if (!child.pid) throw new ProcessError(`Failed to spawn ${args.name}.`);
  if (args.mode === 'detached') child.unref();
  return {
    pid: child.pid,
    port: args.port,
    startedAt: Date.now(),
    cmd: `${args.command} ${args.commandArgs.join(' ')}`,
  };
}

export function isEntryAlive(entry: ProcEntry): boolean {
  try { process.kill(entry.pid, 0); return true; } catch { return false; }
}

export async function stopEntry(entry: ProcEntry): Promise<void> {
  if (!isEntryAlive(entry)) return; // pid gone → already stopped
  // Signature check: our server should still hold its recorded port. If the
  // port is now free, this PID was recycled to an unrelated process — never
  // kill it (anti-PID-reuse).
  if (await isPortFree(entry.port)) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(entry.pid), '/T', '/F']);
    return;
  }
  try { process.kill(entry.pid, 'SIGTERM'); } catch { return; }
  setTimeout(() => { try { process.kill(entry.pid, 'SIGKILL'); } catch { /* gone */ } }, 3000).unref();
}

export function tailLog(ws: string, name: string, lines = 20): string {
  const lp = logPath(ws, name);
  if (!existsSync(lp)) return '';
  return readFileSync(lp, 'utf8').split('\n').slice(-lines).join('\n');
}
