# memos-mcp

A Model Context Protocol (MCP) server that lets Claude (or any MCP client)
read and write notes against a self-hosted [Memos](https://www.usememos.com/)
instance.

This repository is a **fork** of
[`arrow2nd/ruru-memos-mcp`](https://github.com/arrow2nd/ruru-memos-mcp).
See [Fork differences](#fork-differences) below for what changed.

## Environment variables

| Name | Description |
|------|-------------|
| `MEMOS_BASE_URL` | URL of the Memos instance (e.g. `https://memos.example.com`). |
| `MEMOS_ACCESS_TOKEN` | Bearer token for the Memos API. |
| `MEMOS_AUTO_TAG` | Optional. If set to a non-empty value, this string is appended to memo/comment content on creation (preceded by two newlines). Useful for tagging MCP-generated notes. Defaults to empty (no auto-tag). Set to `#by_Ruru` to reproduce the upstream behaviour. |

## Tools

### Memo

| Tool | Description |
|------|-------------|
| `create_memo` | Create a new memo. |
| `list_memos` | List memos (supports CEL filter expressions). |
| `search_memos` | Search memos by keyword/tag. |
| `get_memo` | Fetch a single memo by its uid (`memos/<uid>`). |
| `update_memo` | Overwrite a memo's content (e.g. reformat). Returns the previous content so it can be preserved. |
| `archive_memo` | Set a memo's state to `ARCHIVED` (reversible) or back to `NORMAL`. Preferred over delete. |
| `delete_memo` | Permanently delete a memo. **Irreversible** — prefer `archive_memo`. |

### Comment

| Tool | Description |
|------|-------------|
| `create_comment` | Add a comment to a memo. The target memo `name` should be obtained via `list_memos` first. |
| `list_comments` | List comments on a memo. The target memo `name` should be obtained via `list_memos` first. |

## Install as a Claude Code plugin

This repo is also a Claude Code plugin marketplace: installing the plugin gives
you the MCP server plus the `manage` and `rearrange` skills in one step. The
prebuilt, dependency-bundled `dist/index.js` is committed, so no build is needed
on install.

```bash
# Add this repo as a marketplace, then install the plugin
/plugin marketplace add dakesan/memos-mcp
/plugin install memos@memos
```

On install you are prompted for your Memos instance URL and access token
(`memos_base_url`, `memos_access_token`, optional `memos_auto_tag`). The token
is stored via the plugin's `sensitive` user-config field, not in plain text.

### Updating

The plugin pins a `version` in `plugin.json`, so you only receive updates when
that version is bumped. To pull a newer release:

```bash
/plugin marketplace update memos   # refresh the marketplace catalog
/plugin update memos@memos         # update the installed plugin
```

Updating a plugin requires a restart to apply (during local development you can
instead `/reload-plugins` to hot-reload skills without restarting). Verify what
is installed with `claude plugin list` (look at the `Version` line).

### Skills

Plugin skills are namespaced under the plugin name and are **model-invoked**
(Claude triggers them by context); you can also call them explicitly.

| Skill | Invoke | Use it for |
|-------|--------|-----------|
| `manage` | `/memos:manage` | Capture a quick note, manage `#todo` tasks, look something up, or clean up / reformat a single memo. |
| `rearrange` | `/memos:rearrange` | Bulk-reorganize the whole instance into clean, theme-grouped posts. Scans only memos lacking the `#rearranged` tag, merges duplicates without losing information, and tags each consolidated post `#rearranged`. Archiving the superseded originals is left to you. |

After installing or updating, run `/reload-plugins` and confirm the skills appear
in `/help`. Both skills read the Memos instance URL and token from the MCP server
config (`MEMOS_BASE_URL` / `MEMOS_ACCESS_TOKEN`) — they never hardcode credentials.

## Setup (manual / development)

```bash
npm install
```

## Development

```bash
# stdio mode
npm run dev

# HTTP mode
npm run dev -- --http
```

## Build

```bash
npm run build
```

## MCP client configuration

```json
{
  "mcpServers": {
    "memos": {
      "command": "npx",
      "args": ["ruru-memos-mcp"],
      "env": {
        "MEMOS_BASE_URL": "https://memos.example.com",
        "MEMOS_ACCESS_TOKEN": "your-token",
        "MEMOS_AUTO_TAG": ""
      }
    }
  }
}
```

`MEMOS_AUTO_TAG` is shown above as an empty string so the field is easy to
discover and fill in later; an empty value disables the auto-tag entirely.
Set it (for example to `#mcp` or `#by_Ruru`) to have that string appended
to every memo and comment created by this server.

If you build this fork from source instead of using the published upstream
package, point `command` at your local `node` + the built `dist/index.js`.

## Fork differences

Compared with `arrow2nd/ruru-memos-mcp` at the time of forking, this fork
carries a single behavioural change, intended as a first step toward an
upstream-friendly opt-in configuration:

- The auto-appended `#by_Ruru` signature tag in `create_memo` and
  `create_comment` is no longer hard-coded. Instead, it is controlled by
  the `MEMOS_AUTO_TAG` environment variable.
    - Default (env unset or empty): no tag is appended. MCP-generated
      memos are indistinguishable from hand-written ones.
    - `MEMOS_AUTO_TAG=#by_Ruru`: reproduces the upstream behaviour
      exactly.
    - `MEMOS_AUTO_TAG=#mcp` (or any other string): appends that string
      to every created memo and comment, preceded by two newlines.

  The initial removal of the hard-coded tag was made in commit
  [`b1e4ebd`](https://github.com/dakesan/memos-mcp/commit/b1e4ebd);
  the env-driven configurability replaces that hard removal with an
  opt-in surface that should be straightforward to propose upstream.

Everything else — the MCP protocol wiring, tool schemas, CEL filter
support, search, YAML/Markdown output formatting — comes from upstream
and tracks it.

## License

MIT — see [LICENSE](LICENSE). Both the upstream copyright
(`Copyright (c) 2026 arrow2nd`) and this fork's copyright line are kept
in the LICENSE file, crediting the original author.

## Acknowledgements

This project would not exist without arrow2nd's original
[ruru-memos-mcp](https://github.com/arrow2nd/ruru-memos-mcp), which
provided the entire MCP server design: protocol wiring, tool schemas,
CEL filter handling, search, and output formatting. This fork only adds
a small behavioural tweak (see [Fork differences](#fork-differences));
the heavy lifting was done upstream. Many thanks to **arrow2nd** for
publishing the project under a permissive license and making it
straightforward to build on.

- Upstream: [arrow2nd/ruru-memos-mcp](https://github.com/arrow2nd/ruru-memos-mcp)
- [Memos](https://github.com/usememos/memos) — the note-taking service this
  MCP server talks to (MIT licensed).
