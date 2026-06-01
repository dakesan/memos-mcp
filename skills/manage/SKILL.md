---
name: manage
description: "Manage a self-hosted memos service via MCP. Use when the user wants to capture a quick note (\"memo this\", \"remember this\"), manage TODOs with a #todo tag, look up past notes/decisions, or organize/clean up existing memos (delete, reformat, merge). The memos instance URL and access token are configured on the MCP server (MEMOS_BASE_URL / MEMOS_ACCESS_TOKEN), not in this skill."
allowed-tools: Bash, Read, Write, mcp__memos__create_memo, mcp__memos__list_memos, mcp__memos__search_memos, mcp__memos__get_memo, mcp__memos__update_memo, mcp__memos__archive_memo, mcp__memos__delete_memo, mcp__memos__create_comment, mcp__memos__list_comments
---

# memos — manage Skill

## Overview

memos is a self-hosted memo service, operated entirely through its MCP server.
It is the user's catch-all place to jot everything down, and TODO management lives here too.

The target instance and credentials are supplied to the MCP server via environment
variables (`MEMOS_BASE_URL`, `MEMOS_ACCESS_TOKEN`) — this skill never hardcodes a
host or token. To point at a different instance, change the MCP server config.

MCP server: [`dakesan/memos-mcp`](https://github.com/dakesan/memos-mcp) (fork of `arrow2nd/ruru-memos-mcp`).

## Trigger Conditions

Activate this skill when any of the following applies:

- "memo this" / "memoして" — capture a note
- "remember this" / "覚えておいて" — persist a fact
- TODO operations (add / list / complete a task)
- "what was X again?" style lookups where memos likely holds the answer
- Requests to organize, clean up, reformat, merge, or delete existing memos

## MCP Tools

| Tool | Purpose |
|------|---------|
| `create_memo` | Create a memo (content + optional visibility) |
| `list_memos` | List memos (supports CEL filter) |
| `search_memos` | Keyword/tag search (builds a CEL expression internally) |
| `get_memo` | Fetch a single memo by uid |
| `update_memo` | Overwrite a memo's content (reformat); returns the previous content |
| `archive_memo` | Set a memo's state to ARCHIVED (reversible) or back to NORMAL |
| `delete_memo` | Permanently delete a memo (irreversible) |
| `create_comment` | Add a comment to a memo (name = `memos/<uid>`) |
| `list_comments` | List comments on a memo |

## Tool Details

### create_memo

- `content` (string, required): Markdown supported. Tag with `#tag`.
- `visibility` (enum, optional): `PRIVATE` / `PROTECTED` / `PUBLIC`. Defaults to server setting.

### search_memos

- `query` (string, optional): substring search over content → `content.contains("<query>")`
- `tag` (string, optional): tag filter → `"<tag>" in tags`
- `pageSize` (number, optional): default 10
- query + tag together → AND

### list_memos

- `pageSize` (number, optional): default 10
- `filter` (string, optional): raw CEL expression

CEL examples:

- `content.contains("keyword")` — content keyword
- `"diary" in tags` — exact tag match
- `content.contains("scRNA") && "work" in tags` — AND
- `visibility == "PRIVATE"` — visibility filter

### get_memo / update_memo / archive_memo / delete_memo

These operate on a single memo identified by its **uid** — the `<uid>` part of the
`name` field (`memos/<uid>`) returned by `list_memos` / `search_memos`. Always obtain
the uid from a list/search result first; never guess it.

- `get_memo(id)` — read one memo.
- `update_memo(id, content)` — replace the body. The response includes
  `previousContent`; preserve it (see Organize workflow) before relying on the overwrite.
- `archive_memo(id, state?)` — default sets `ARCHIVED`; pass `NORMAL` to un-archive.
- `delete_memo(id)` — **irreversible** physical delete. Prefer `archive_memo` unless
  deletion is explicitly confirmed.

### create_comment / list_comments

- `name` must be the `memos/<uid>` form taken from a `list_memos` / `search_memos` result.

## Tag System

| Tag | Purpose |
|-----|---------|
| `#todo` | Incomplete task |
| `#idea` | Ideas and inspirations |
| `#memo` | General notes |
| `#meeting` | Meeting-related |
| `#decision` | Decision records |
| Project tags | e.g. `#infra`, `#bizdev`, … |

### Completion Marking

- Task completion is indicated by a ✅ reaction/stamp on the memo.
- Do NOT use a separate `#done` tag — use the check stamp instead.

## TODO Management

### Creating a TODO

```
<task description with context> #todo #<project-tag>
```

Rules:

- Task name must include background context (not abbreviations only).
- Only manage the user's own tasks.

### Adding Details

Use **comments** on the todo memo for progress notes and updates.

### Completing a TODO

Mark with a ✅ stamp/reaction. The memo itself remains as a record.

### Querying TODOs

```
search_memos(tag="todo")
search_memos(tag="todo", query="<project>")
```

## Organize / Cleanup Workflow

For destructive reorganization — deleting boilerplate (e.g. an auto-appended
signature line), reformatting rough notes into readable form, or merging similar
memos — follow this guarded workflow. **Never** mutate memos without an explicit
plan-and-approve step.

### Safety principles

1. **Back up first.** Before any change, fetch all memos with `list_memos`
   (page through with `nextPageToken`) and write the raw result to a local JSON
   backup file. This is the rollback source.
2. **Plan, then get approval.** Present the user a concrete plan: which memos will
   be deleted/archived, which reformatted (show before/after), which merged. Make
   no changes until the user approves.
3. **Archive before delete.** "Removing" a memo means `archive_memo` (reversible)
   by default. Use `delete_memo` only for items the user has explicitly confirmed
   as safe to delete permanently.
4. **Preserve originals on reformat.** `update_memo` returns `previousContent`;
   append every original body to the local backup JSON as you go.

### Steps

1. `list_memos` (page through all) → save raw JSON backup locally.
2. Analyze and build the plan:
   - boilerplate/unwanted lines to strip → candidates
   - rough notes to reformat → before/after pairs
   - similar memos to merge → groups (which becomes the canonical memo)
3. Present the plan; wait for approval.
4. Execute:
   - Merge: `create_memo` for the consolidated memo, then `archive_memo` the
     originals (not delete).
   - Reformat: `update_memo`, logging each `previousContent` to the backup.
   - Remove boilerplate / unwanted memos: `archive_memo` first; `delete_memo`
     only on explicit confirmation.
5. Report a summary and the rollback procedure (backup JSON path + how to restore
   via `update_memo` / `archive_memo NORMAL` / `create_memo`).

## Writing Conventions

- Tags: `#<kebab-case>` or `#<日本語>` both fine.
- Markdown allowed → headings `#`, lists `-`, code fences.
- Don't cram multiple topics into one memo; split and link with a shared tag.
- No need to write timestamps (createTime is automatic).

## Configuration (MCP env)

The MCP server is configured with:

| Variable | Description |
| --- | --- |
| `MEMOS_BASE_URL` | Memos instance root URL (no trailing `/api/v1`) |
| `MEMOS_ACCESS_TOKEN` | Bearer PAT from Memos settings (Settings → Access Tokens) |
| `MEMOS_AUTO_TAG` | (optional) tag automatically appended to every created memo |

To change which instance is used, update these on the MCP server config — not here.

## Troubleshooting

- **`Needs authentication`** → PAT expired or wrong. Regenerate in the Memos UI and
  update `MEMOS_ACCESS_TOKEN`.
- **`Connection refused`** → Memos server down or network/VPN not connected.
- **`invalid name format`** → the uid/name passed to a single-memo tool is not the
  `memos/<uid>` form. Re-fetch via `list_memos`.
- **Memo not found** → CEL filter syntax error. Start from a simple `search_memos`.

## Notes

- Default visibility: PRIVATE.
- Deletion is possible (`delete_memo`) but archiving (`archive_memo`) is preferred
  for reversibility.

## References

- MCP source: <https://github.com/dakesan/memos-mcp>
- Upstream: <https://github.com/arrow2nd/ruru-memos-mcp>
- Memos API docs: <https://www.usememos.com/docs/api>
- CEL spec: <https://github.com/google/cel-spec>
