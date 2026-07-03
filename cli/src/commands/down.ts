import { spawnSync } from 'node:child_process';
import { clientContext } from '../lib/paths.js';
import { clearRunRegistry, readRunRegistry, stopEntry } from '../lib/process.js';

export async function down(): Promise<void> {
  const ws = clientContext().workspaceRoot;
  const reg = readRunRegistry(ws);
  if (!reg) { console.log('Nothing to stop (no run.json).'); return; }

  if (reg.mode === 'docker') {
    spawnSync('docker', ['compose', 'down'], { cwd: ws, stdio: 'inherit', shell: false });
    clearRunRegistry(ws);
    console.log('Stopped docker compose.');
    return;
  }

  if (reg.web) await stopEntry(reg.web);
  if (reg.core) await stopEntry(reg.core);
  clearRunRegistry(ws);
  console.log('Stopped ARCHI-OS.');
}
