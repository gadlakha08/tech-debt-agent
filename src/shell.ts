import { execa } from "execa";

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Runs a command without a shell and never throws on a non-zero exit; callers decide what failure means. */
export async function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number; env?: Record<string, string>; input?: string } = {},
): Promise<RunResult> {
  const res = await execa(cmd, args, {
    cwd: opts.cwd,
    timeout: opts.timeoutMs,
    env: opts.env,
    input: opts.input,
    reject: false,
    stripFinalNewline: true,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (res.failed && res.exitCode === undefined) {
    // spawn failure (binary missing) or timeout
    return { stdout: String(res.stdout ?? ""), stderr: res.shortMessage ?? "command failed", exitCode: 127 };
  }
  return { stdout: String(res.stdout), stderr: String(res.stderr), exitCode: res.exitCode ?? 1 };
}

export async function runOrThrow(cmd: string, args: string[], opts: Parameters<typeof run>[2] = {}): Promise<string> {
  const res = await run(cmd, args, opts);
  if (res.exitCode !== 0) throw new Error(`${cmd} ${args.join(" ")} failed (${res.exitCode}): ${res.stderr.slice(0, 500)}`);
  return res.stdout;
}

export async function commandExists(cmd: string): Promise<boolean> {
  const res = await run("which", [cmd]);
  return res.exitCode === 0;
}
