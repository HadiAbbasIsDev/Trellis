/**
 * Claude Code Stop hook: the write-back safety net of last resort.
 *
 * Rules blocks and tool descriptions ask for writes DURING the session; this
 * hook catches the sessions where that failed anyway. If the agent did real
 * work (>= 6 tool calls) but never wrote to memory, block the stop ONCE with
 * a reason telling it what to record. Claude Code re-invokes the hook with
 * stop_hook_active=true after a block, and we pass through then — that is the
 * once-and-only-once mechanism, and skipping it would loop forever.
 *
 * Fail-safe is absolute: a hook that crashes or blocks spuriously breaks the
 * user's session, which is far worse than a missed memory write. ANY doubt or
 * error => exit 0 with no output.
 */
import fs from 'node:fs';
import path from 'node:path';

const WORK_THRESHOLD = 6; // tool calls; below this the session likely learned nothing durable

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const input = JSON.parse(await readStdin());
  if (input.stop_hook_active) return; // we already blocked once this stop — pass through

  const transcript = fs.readFileSync(input.transcript_path, 'utf8');
  let toolCalls = 0;
  let wroteMemory = false;
  for (const line of transcript.split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // transcript lines we can't parse are not our problem
    }
    const content = entry?.message?.content;
    if (!Array.isArray(content)) continue;
    // Walk nested content too: today's transcripts keep tool_use at the top
    // level, but a nested-format change must degrade to a missed count, not a
    // spurious block of a session that DID write memory.
    const walk = (items, depth) => {
      if (depth > 4 || !Array.isArray(items)) return;
      for (const item of items) {
        if (item?.type === 'tool_use') {
          toolCalls++;
          const name = String(item.name ?? '');
          // MCP tools arrive namespaced (mcp__trellis__memory_write), so match by substring.
          if (name.includes('memory_write') || name.includes('memory_link')) wroteMemory = true;
        }
        if (Array.isArray(item?.content)) walk(item.content, depth + 1);
      }
    };
    walk(content, 0);
  }
  if (toolCalls < WORK_THRESHOLD || wroteMemory) return;

  // Hooks run with cwd = the project directory, where journal.mjs writes.
  const journalPath = path.join(process.cwd(), '.trellis', '.journal', 'current.jsonl');
  const journalNote = fs.existsSync(journalPath)
    ? ` The session journal at ${journalPath} lists every file edit and command from this session if you need to reconstruct what happened.`
    : '';
  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason:
      `This session made ${toolCalls} tool calls but recorded nothing to project memory. ` +
      'Before stopping, save the durable facts with memory_write: decisions made (and why), ' +
      'gotchas hit (what failed + the fix), and preferences the user expressed. ' +
      'If genuinely nothing durable happened, stop again and you will not be re-prompted.' +
      journalNote,
  }));
}

main().then(() => process.exit(0), () => process.exit(0));
