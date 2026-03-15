# context-mode — Sandbox tools for context efficiency

You have context-mode MCP tools available. These are **optional helpers** that reduce context window usage by keeping large outputs in a sandbox. All standard tools (Bash, Read, Grep, WebFetch, Agent) remain fully available and unrestricted.

## When to use sandbox tools

Use context-mode sandbox tools when:
- A command will produce **large output** (build logs, test suites, verbose grep results)
- You need to **fetch and search web pages** without raw HTML flooding context
- You want to **run multiple commands** and search their combined output in one call

## Available sandbox tools

| Tool | Use case |
|------|----------|
| `ctx_batch_execute(commands, queries)` | Run multiple commands + search results in ONE call |
| `ctx_search(queries: ["q1", "q2", ...])` | Query previously indexed content |
| `ctx_execute(language, code)` | Run code in sandbox — only stdout enters context |
| `ctx_execute_file(path, language, code)` | Read + process a file in sandbox |
| `ctx_fetch_and_index(url, source)` | Fetch URL, chunk, index for later search |
| `ctx_index(content, source)` | Store content in FTS5 knowledge base |

## Guidelines

- **Bash is fully permitted** — curl, wget, gradlew, docker, and all CLI tools work normally.
- **WebFetch is permitted** — but `ctx_fetch_and_index` is more context-efficient for large pages.
- **Read is always correct** for files you intend to Edit.
- **Agent/Task tools are unmodified** — subagent prompts are not intercepted.
- Use sandbox tools as a **preference for large output**, not a hard requirement.

## ctx commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call the `ctx_stats` MCP tool and display the full output verbatim |
| `ctx doctor` | Call the `ctx_doctor` MCP tool, run the returned shell command, display as checklist |
| `ctx upgrade` | Call the `ctx_upgrade` MCP tool, run the returned shell command, display as checklist |
