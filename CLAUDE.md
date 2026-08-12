<!-- trellis:begin -->
## Project memory (Trellis)

This project has a persistent memory graph, served through MCP tools:
memory_search / memory_expand / memory_write / memory_link.

- CALL memory_search FIRST when starting any task — retrieving past context
  is far cheaper than re-deriving it from the codebase.
- Record durable facts with memory_write AT THE MOMENT they happen, not at
  session end: decisions (and why), constraints, gotchas (failure + fix),
  and user preferences about how to work.
- Keep titles short and searchable; summaries one sentence.
- When a decision replaces an earlier one, add a supersedes edge so the old
  one stops surfacing.
- Heed near-duplicate warnings from memory_write: update or link the
  existing node instead of re-creating it.
<!-- trellis:end -->
