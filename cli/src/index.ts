import { Command } from 'commander';
import { CliError } from './errors.js';

export async function runCli(argv: string[]): Promise<void> {
  const program = new Command();
  program
    .name('nodalis')
    .description('Nodalis CLI — install, launch, configure MCP')
    .version('1.0.0');

  program.command('init').description('Configure MCP client(s)')
    .option('--client <client>', 'cursor|claude|vscode|all')
    .action(async (opts: { client?: string }) => {
      const { init } = await import('./commands/init.js');
      await init(opts);
    });

  program.command('doctor').description('Diagnostics')
    .action(async () => {
      const { doctor } = await import('./commands/doctor.js');
      await doctor();
    });

  program.command('up').description('Launch core + web')
    .option('--docker', 'delegate to docker compose')
    .option('--no-open', 'do not open the browser')
    .action(async (opts: { docker?: boolean; open?: boolean }) => {
      const { up } = await import('./commands/up.js');
      await up(opts);
    });

  program.command('down').description('Stop launched processes')
    .action(async () => {
      const { down } = await import('./commands/down.js');
      await down();
    });

  program.command('uninstall').description('Remove MCP config (reversible)')
    .action(async () => {
      const { uninstall } = await import('./commands/uninstall.js');
      await uninstall();
    });

  await program.parseAsync(argv);
}

runCli(process.argv).catch((err: unknown) => {
  if (err instanceof CliError) {
    console.error(`✖ ${err.message}`);
    process.exit(err.exitCode);
  }
  console.error('✖ Unexpected error:', err);
  process.exit(1);
});
