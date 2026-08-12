/**
 * Claude Code PostToolUse hook (matcher Edit|Write|Bash): append one line per
 * tool call to <project>/.trellis/.journal/current.jsonl.
 *
 * The journal exists so end-of-session write-back (stop-guard, or a future
 * session-summary command) can reconstruct WHAT a session actually touched
 * without re-reading the whole transcript. One compact JSON line per event;
 * the .journal dot-dir is invisible to loadVault, so it never pollutes the
 * graph.
 *
 * Fail-safe: journaling must never break a session — ANY error => exit 0.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROTATE_BYTES = 200 * 1024; // keep current.jsonl cheap to read at Stop time

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const input = JSON.parse(await readStdin());
  const toolInput = input.tool_input ?? {};
  // file_path covers Edit/Write; command covers Bash. Both are capped: real
  // paths are ~4KB max, but a crafted tool_input must not bloat the journal.
  const detail = typeof toolInput.file_path === 'string' && toolInput.file_path
    ? toolInput.file_path.slice(0, 200)
    : String(toolInput.command ?? '').slice(0, 80);

  const dir = path.join(process.cwd(), '.trellis', '.journal');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'current.jsonl');
  try {
    if (fs.statSync(file).size > ROTATE_BYTES) {
      // Unique per-process name: parallel hook invocations can both cross the
      // threshold in the same millisecond, and a timestamp-only name let the
      // second rename silently clobber the first rotated segment (proven —
      // an entire 200KB of session history vanished). pid+random cannot
      // collide; the losing renamer just throws ENOENT and appends on.
      const dated = path.join(
        dir,
        `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}-${Math.random().toString(36).slice(2, 6)}.jsonl`,
      );
      try {
        fs.renameSync(file, dated);
      } catch {
        /* another invocation rotated first — fine */
      }
    }
  } catch {
    /* no current.jsonl yet — nothing to rotate */
  }
  fs.appendFileSync(file, JSON.stringify({
    ts: new Date().toISOString(),
    session_id: String(input.session_id ?? ''),
    tool: String(input.tool_name ?? ''),
    detail,
  }) + '\n');
}

main().then(() => process.exit(0), () => process.exit(0));
