---
name: rearrange
description: "Reorganize a memos instance into clean, theme-grouped posts. Use when the user wants to tidy / consolidate / 整理 their memos in bulk — \"rearrange my memos\", \"memosを整理して\", \"まとめ直して\". Scans only memos that lack the #rearranged tag, groups them by theme, merges duplicates without losing information, and creates consolidated posts tagged #rearranged. Original memos are left for the user to archive. The instance URL/token are configured on the MCP server (MEMOS_BASE_URL / MEMOS_ACCESS_TOKEN), not here."
allowed-tools: Bash, Read, Write, mcp__memos__create_memo, mcp__memos__list_memos, mcp__memos__search_memos, mcp__memos__get_memo, mcp__memos__update_memo, mcp__memos__archive_memo
---

# memos — rearrange Skill

## Overview

Bulk-reorganize a memos instance into a small set of clean, theme-grouped posts.

The contract is built around one marker tag, **`#rearranged`**:

- The skill only ever **reads** memos that do *not* carry `#rearranged` (the "raw" backlog).
- Every consolidated post the skill **creates** is tagged `#rearranged`.
- Therefore the skill is **idempotent**: re-running it never re-processes its own output.

Archiving the superseded originals is **the user's job** — the skill never archives or
deletes anything. It reports a mapping (new post ← which originals) so the user can
archive them in one pass.

Instance and credentials come from the MCP server env (`MEMOS_BASE_URL`,
`MEMOS_ACCESS_TOKEN`); this skill never hardcodes a host or token.

MCP server: [`dakesan/memos-mcp`](https://github.com/dakesan/memos-mcp).

## Trigger Conditions

- "rearrange / reorganize / consolidate my memos"
- "memosを整理して / まとめ直して / 再編成して"
- Any bulk tidy-up request over the whole memos backlog (not a single-memo edit —
  that is the `manage` skill's job).

## Core Principles

1. **Target = untagged only.** Process exactly the memos that lack `#rearranged`
   and are in state `NORMAL`. Never touch already-rearranged or archived memos.
2. **No information loss.** Every distinct fact, number, link, file path, and decision
   in the source memos must survive into a consolidated post. When in doubt, keep it.
3. **Deduplicate, don't drop.** Remove *redundant repetition* (the same fact stated
   twice, boilerplate signature lines, empty TODO stubs) — but a fact that appears
   only once is never "a duplicate".
4. **Create-only.** The skill creates consolidated posts. It does **not** archive or
   delete originals — the user does that after reviewing the mapping.
5. **Plan, then approve.** Always present the grouping + full draft bodies and wait
   for explicit approval before creating anything.
6. **Back up first.** Dump the raw target set to a local JSON file before any write.

## Workflow

### 1. Fetch the target backlog

List every memo that is NOT yet rearranged, paging through all results:

```
list_memos(filter='!tags.exists(t, t == "rearranged")', pageSize=200)
```

> ⚠️ CEL gotcha: do **NOT** use `!("rearranged" in tags)`. In this memos version the
> `in tags` form silently **drops every memo whose tag list is empty** — so untagged
> memos (often the bulk of the backlog) never get processed. `tags.exists(t, t == "…")`
> evaluates correctly on empty tag lists. Verified: `!("rearranged" in tags)` returned
> 11/20, `!tags.exists(...)` returned the full 20.

(`list_memos` returns `NORMAL` memos; archived ones are excluded, so already-archived
originals from a previous run will not reappear.)

Write the raw result to a local JSON backup (e.g. `~/memos/rearrange_backup_<runtag>.json`).
This is the rollback source. Do not invent the date in the filename — ask the user or
use a fixed label.

### 2. Pull comments (information-loss guard)

Comments are part of a memo's content and must not be lost.

> ⚠️ Known bug: the MCP `list_comments` tool currently validates `memos/<number>` and
> rejects the UID names this memos version uses, so it cannot fetch comments. Until the
> MCP server is fixed, retrieve comments via the REST API:
>
> ```bash
> curl -s "$MEMOS_BASE_URL/api/v1/memos/<uid>/comments" \
>   -H "Authorization: Bearer $MEMOS_ACCESS_TOKEN"
> ```
>
> Fold any comment bodies into the consolidated post (e.g. under a "コメント / 経緯"
> sub-section of the relevant item).

### 3. Group by theme & draft

- Cluster the memos by topic (e.g. lab automation, recruiting, knowledge notes,
  delegated TODOs, management reflections, one big analysis summary, …).
- Merge each cluster into one Markdown post, following the **Post format rules** below.
- Build a **mapping table**: new post → list of source uids it supersedes.

### Post format rules (strict)

1. **Tags: trailing line only.** Every tag lives on a single line at the very bottom of
   the post — never inline. No tags in the H1/H2 headings, no tags appended to list
   items. Collect all relevant tags (the source memos' topical tags + `#rearranged`)
   into that one final line, deduplicated. `#rearranged` is mandatory on every post.
   If a per-item category was conveyed by an inline tag in the source (e.g. a `#htge`
   on one task), fold that meaning into the item's text in plain words — do not leave
   the `#` inline.
2. **Dates: explicit in the text.** Never rely on `createTime` for the reader.
   - Merged clusters: put each source item under an H2 whose heading carries that
     item's original date, e.g. `## … (2026-04-27)`.
   - Singletons / items without a per-section date: add an explicit `記録日: YYYY-MM-DD`
     line near the top.
3. **Readability: prefer bullet points.** Reformat dense prose paragraphs into clear
   bullet lists (one idea per bullet). This is the default for note-style content
   (e.g. a knowledge note, a decision memo). Keep numbers, paths, links, and proper
   nouns verbatim.
4. **No information loss.** Large, already-structured singletons (a detailed analysis
   summary, a comparison table): keep the body essentially verbatim — reformat only,
   never summarize away numbers/paths.

### 4. Present & approve

Show the user:
- the grouping table (post → source uids → date),
- the full body of each consolidated post,
- the supersede mapping.

Make no writes until the user approves.

### 5. Create the consolidated posts

For each approved post:

```
create_memo(content=<consolidated markdown incl. #rearranged>, visibility="PRIVATE")
```

By default the new post's `createTime` is **now** — this is the normal mode and what
most users want.

### 6. Report

Output a summary and the supersede mapping (original uid → new memo name) so the user
can archive the originals. Example line:

```
archive these originals (superseded): memos/<uid1>, memos/<uid2>, ...
```

Remind the user: the skill left the originals untouched; archiving is theirs to run
(e.g. via the `manage` skill's `archive_memo`).

## Optional: preserve original dates

If the user wants the consolidated post dated to match the source material (instead of
"now"), the MCP `create_memo` cannot set a date — but the memos REST API can, **after**
creation:

```bash
# NOTE: the updateMask MUST be snake_case `create_time`.
# camelCase `createTime` in the mask is silently IGNORED (no error, no change).
curl -s -X PATCH \
  "$MEMOS_BASE_URL/api/v1/memos/<uid>?updateMask=create_time" \
  -H "Authorization: Bearer $MEMOS_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"createTime":"2026-05-01T21:42:38Z"}'
```

For a merged cluster, use the **latest** source memo's `createTime` so it sorts at the
top of that cluster's timeframe. There is no `displayTime` field in this API version;
`create_time` is the only settable timestamp.

## Idempotency & the re-run loop

```
run skill → review → user archives the superseded originals → next run sees only
the genuinely new (untagged) memos.
```

If the user does NOT archive the originals between runs, those originals are still
untagged and will be merged again into a fresh `#rearranged` post — duplicating work.
So: always tell the user to archive the superseded originals before the next run.

## Conventions

- Default visibility: `PRIVATE`.
- Tags: `#<kebab-case>` or `#<日本語>` both fine — but **trailing line only** (see Post
  format rules). This differs from the `manage` skill, where inline tags are allowed.
- Dates: stated **explicitly in the text** here (unlike `manage`, which relies on the
  automatic `createTime`), because consolidated posts span multiple source dates.
- Markdown allowed (headings, lists, tables, code fences); prefer bullet lists over prose.
- Prefer `archive_memo` over `delete_memo` everywhere (reversible) — though this skill
  delegates archiving to the user.

## Troubleshooting

- **`invalid name format` on a single-memo tool** → pass the `memos/<uid>` form from a
  `list_memos` result; never guess the uid.
- **`list_comments` rejects the name** → known bug (expects numeric id); use the REST
  API as shown in step 2.
- **`Needs authentication` / `Connection refused`** → PAT expired or server/VPN down.

## References

- Sibling skill: `manage` (single-memo capture, TODO, single-memo cleanup).
- MCP source: <https://github.com/dakesan/memos-mcp>
- Memos API docs: <https://www.usememos.com/docs/api>
- CEL spec: <https://github.com/google/cel-spec>
