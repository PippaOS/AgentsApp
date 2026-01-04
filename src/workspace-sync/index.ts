import path from 'node:path';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { getCodeRunnerConfig } from '../code-runner';

export type WorkspaceSyncOptions = {
  /** Absolute path to the workspace folder on the host (the repo root). */
  sourcePath: string;
  /** Destination directory under the shared folder (defaults to "{sharedDir}/workspace"). */
  destPath?: string;
  /** Exclude patterns passed to rsync, e.g. "node_modules/" */
  excludes?: string[];
  /** Whether to delete extraneous files in dest. Defaults to true (mirror semantics). */
  deleteExtraneous?: boolean;
  /** rsync executable path (or command name). Defaults to "rsync". */
  rsyncPath?: string;
};

export type WorkspaceSyncResult = {
  ok: boolean;
  sourcePath: string;
  destPath: string;
  durationMs: number;
  command: { exe: string; args: string[] };
  stdout: string;
  stderr: string;
  error?: string;
  exitCode?: number;
};

function normalizeExcludeList(excludes: string[] | undefined): string[] {
  const list = (excludes ?? [])
    .map((x) => (x ?? '').trim())
    .filter(Boolean);
  // Deduplicate while preserving order
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of list) {
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

/**
 * Compute the default destination path for the synced workspace snapshot.
 * Runner sees it at /shared/workspace.
 */
export function getDefaultWorkspaceDestPath(): string {
  const cfg = getCodeRunnerConfig();
  return path.join(cfg.sharedDir, 'workspace');
}

/**
 * Run rsync from sourcePath -> destPath.
 *
 * Notes:
 * - We use "--delete" by default to keep mirror semantics.
 * - We pass a trailing path separator on sourcePath so rsync copies CONTENTS, not the directory itself.
 *   Example: "/repo/" -> "/dest/" yields "/dest/package.json" not "/dest/repo/package.json".
 */
export async function syncWorkspace(opts: WorkspaceSyncOptions): Promise<WorkspaceSyncResult> {
  const startedAt = Date.now();

  const sourcePath = (opts.sourcePath ?? '').trim();
  if (!sourcePath) {
    return {
      ok: false,
      sourcePath: '',
      destPath: opts.destPath ?? '',
      durationMs: 0,
      command: { exe: opts.rsyncPath ?? 'rsync', args: [] },
      stdout: '',
      stderr: '',
      error: 'sourcePath is required',
    };
  }

  const destPath = (opts.destPath ?? getDefaultWorkspaceDestPath()).trim();
  const rsyncExe = (opts.rsyncPath ?? 'rsync').trim() || 'rsync';
  const deleteExtraneous = opts.deleteExtraneous ?? true;
  const excludes = normalizeExcludeList(opts.excludes);

  // Ensure destination exists so rsync can populate it.
  try {
    fs.mkdirSync(destPath, { recursive: true });
  } catch {
    // ignore; rsync will surface a clearer error if this truly fails
  }

  const args: string[] = ['-a'];
  if (deleteExtraneous) args.push('--delete');
  // Prefer widely-supported flags (macOS ships an older rsync).
  // Newer rsync has richer `--info=...` options, but `--stats` and `--progress` work broadly.
  args.push('--stats', '--progress');

  for (const ex of excludes) {
    args.push('--exclude', ex);
  }

  // Ensure trailing separator on source to copy contents.
  const sourceWithTrailing = sourcePath.endsWith(path.sep) ? sourcePath : sourcePath + path.sep;
  const destWithTrailing = destPath.endsWith(path.sep) ? destPath : destPath + path.sep;

  args.push(sourceWithTrailing, destWithTrailing);

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];

  const result: WorkspaceSyncResult = await new Promise((resolve) => {
    let finished = false;
    const finalize = (partial: Partial<WorkspaceSyncResult>) => {
      if (finished) return;
      finished = true;
      const durationMs = Date.now() - startedAt;
      resolve({
        ok: Boolean(partial.ok),
        sourcePath,
        destPath,
        durationMs,
        command: { exe: rsyncExe, args },
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
        error: partial.error,
        exitCode: partial.exitCode,
      });
    };

    let child;
    try {
      child = spawn(rsyncExe, args, { windowsHide: true });
    } catch (e) {
      finalize({
        ok: false,
        exitCode: 127,
        error:
          (e as NodeJS.ErrnoException)?.code === 'ENOENT'
            ? `rsync not found: "${rsyncExe}". Install rsync (or set an explicit rsync path in settings).`
            : (e as Error)?.message ?? 'Failed to start rsync',
      });
      return;
    }

    child.stdout?.on('data', (d: Buffer) => stdoutChunks.push(d));
    child.stderr?.on('data', (d: Buffer) => stderrChunks.push(d));

    child.on('error', (e: NodeJS.ErrnoException) => {
      finalize({
        ok: false,
        exitCode: 127,
        error:
          e?.code === 'ENOENT'
            ? `rsync not found: "${rsyncExe}". Install rsync (or set an explicit rsync path in settings).`
            : e?.message ?? 'rsync error',
      });
    });

    child.on('close', (code) => {
      const exitCode = typeof code === 'number' ? code : 1;
      finalize({
        ok: exitCode === 0,
        exitCode,
        error: exitCode === 0 ? undefined : `rsync exited with code ${exitCode}`,
      });
    });
  });

  return result;
}

