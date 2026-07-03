export class CliError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = new.target.name;
    this.exitCode = exitCode;
  }
}

export class McpConfigError extends CliError {}
export class PortError extends CliError {}
export class ProcessError extends CliError {}
