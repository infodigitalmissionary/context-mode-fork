# Context-Mode Fork for SanitrackV3

## What This Is

A customized fork of [mksglu/context-mode](https://github.com/mksglu/context-mode) (v1.0.22) that removes hard blocks incompatible with the SanitrackV3 workflow while keeping the valuable sandbox tools and session tracking.

**Upstream repo**: https://github.com/mksglu/context-mode
**Our fork**: https://github.com/infodigitalmissionary/context-mode-fork
**Branch**: `sanitrack-custom`

## What Was Changed (4 files, all in hooks + configs)

### Removed Hard Blocks
- **curl/wget** — we use these for service health checks (localhost:3333, 3000, 9090)
- **gradlew/gradle/maven** — required for EAS/Android APK builds
- **Inline HTTP** (fetch, requests.get) — appears in test scripts and seed data
- **WebFetch** — we use WebFetch/WebSearch for docs, Context7, library research

All replaced with **one-time soft guidance nudges** suggesting sandbox alternatives.

### Removed Prompt Injection
- **Agent/Task** prompts are no longer intercepted or modified
- Our God's Eye swarm orchestration uses carefully crafted agent prompts that can't be appended to

### Removed Constraints
- 500-word output limit removed
- "Write artifacts to files, never inline" mandate removed
- "Bash is ONLY for git/mkdir/rm/mv" restriction removed

### Disabled Self-Heal
- The upstream auto-update mechanism that rewrites `installed_plugins.json` and `settings.json` is disabled to prevent overwriting our customizations

### What's Preserved
- FTS5/SQLite session tracking (PostToolUse, PreCompact, SessionStart)
- Security policy evaluation (deny/allow patterns)
- All MCP sandbox tools (ctx_execute, ctx_batch_execute, ctx_fetch_and_index, ctx_search, ctx_index)
- Guidance throttle system (one-time per session nudges)
- All platform adapters (Claude Code, Gemini, Cursor, VS Code Copilot)

## How It's Installed

Context-mode runs as hooks + MCP server alongside our existing setup.

**Global settings** (`~/.claude/settings.json`):
- `PreToolUse` hooks added for: Bash, WebFetch, Read, Grep, Agent|Task
- `PostToolUse` hook added (session event capture)
- `PreCompact` hook added (snapshot before compression)
- `SessionStart` hook added (context injection + session restore)
- Our existing `UserPromptSubmit` screenshot resize hook is untouched

**Project settings** (`.claude/settings.json`):
- Completely untouched — screenshot resize hooks remain as-is

**Plugin registration** (`~/.claude/plugins/installed_plugins.json`):
- Points to this fork directory for the MCP server

## Available Sandbox Tools

| Tool | Use Case |
|------|----------|
| `ctx_batch_execute(commands, queries)` | Run multiple commands + search results in one call |
| `ctx_search(queries)` | Query previously indexed content |
| `ctx_execute(language, code)` | Run code in sandbox — only stdout enters context |
| `ctx_execute_file(path, language, code)` | Read + process a file in sandbox |
| `ctx_fetch_and_index(url, source)` | Fetch URL, chunk, index for later search |
| `ctx_index(content, source)` | Store content in FTS5 knowledge base |

## Monitoring

- `ctx stats` — shows data processed, tokens saved, per-tool breakdown
- `ctx doctor` — installation health check (runtimes, hooks, FTS5, server)

## Why We Did This

God's Eye swarm orchestration causes context bloat at the top-level agent. Worker results bubble up through Sub-Orchestrators to Lead to God's Eye, filling context with raw output (diffs, build logs, test results). By routing large outputs through sandbox tools, God's Eye stays lean and can continue orchestrating.

## Rollback (30 seconds)

```bash
# Revert settings to pre-install state
cp ~/.claude/settings.json.pre-context-mode ~/.claude/settings.json

# Remove plugin registration
rm ~/.claude/plugins/installed_plugins.json

# Git rollback tag (SanitrackV3 repo)
# git checkout PreContextMode
```

The fork directory has no effect unless hooks are registered in settings.json.

## Tests

All 112 tests pass on the `sanitrack-custom` branch:
```bash
cd context-mode-fork && npx vitest run
```

## Installed: 2026-03-16
