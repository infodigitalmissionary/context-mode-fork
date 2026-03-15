/**
 * Shared routing block for context-mode hooks.
 * Single source of truth — imported by pretooluse.mjs and sessionstart.mjs.
 */

export const ROUTING_BLOCK = `
<context_window_protection>
  <priority_instructions>
    context-mode MCP tools are available to reduce context window usage.
    Use them when commands produce large output (>50 lines) or when fetching web pages.
    All standard tools (Bash, Read, Grep, WebFetch, Agent) remain fully available.
  </priority_instructions>

  <tool_selection_hierarchy>
    1. GATHER: ctx_batch_execute(commands, queries) — runs multiple commands, auto-indexes, returns search results. Ideal for large-output research.
    2. FOLLOW-UP: ctx_search(queries: ["q1", "q2", ...]) — query previously indexed content.
    3. PROCESSING: ctx_execute(language, code) | ctx_execute_file(path, language, code) — sandbox execution, only stdout enters context.
    4. WEB: ctx_fetch_and_index(url, source) then ctx_search(queries) — fetch and index web pages without raw HTML in context.
    5. INDEX: ctx_index(content, source) — store content in FTS5 knowledge base for later search.
  </tool_selection_hierarchy>

  <guidelines>
    - Prefer sandbox tools for commands producing large output (build logs, test suites, large grep results).
    - Read is always correct for files you intend to Edit.
    - Bash, curl, wget, gradlew, and all other CLI tools are fully permitted.
    - WebFetch is permitted but ctx_fetch_and_index is more context-efficient for large pages.
  </guidelines>

  <ctx_commands>
    When the user says "ctx stats", "ctx-stats", "/ctx-stats", or asks about context savings:
    → Call the stats MCP tool and display the full output verbatim.

    When the user says "ctx doctor", "ctx-doctor", "/ctx-doctor", or asks to diagnose context-mode:
    → Call the doctor MCP tool, execute the returned shell command, display results as a checklist.

    When the user says "ctx upgrade", "ctx-upgrade", "/ctx-upgrade", or asks to update context-mode:
    → Call the upgrade MCP tool, execute the returned shell command, display results as a checklist.
  </ctx_commands>
</context_window_protection>`;

export const READ_GUIDANCE = '<context_guidance>\n  <tip>\n    If you are reading this file to Edit it, Read is the correct tool — Edit needs file content in context.\n    If you are reading to analyze or explore, use mcp__plugin_context-mode_context-mode__ctx_execute_file(path, language, code) instead — only your printed summary will enter the context.\n  </tip>\n</context_guidance>';

export const GREP_GUIDANCE = '<context_guidance>\n  <tip>\n    This operation may flood your context window. To stay efficient:\n    - Use mcp__plugin_context-mode_context-mode__ctx_execute(language: "shell", code: "...") to run searches in the sandbox.\n    - Only your final printed summary will enter the context.\n  </tip>\n</context_guidance>';

export const BASH_GUIDANCE = '<context_guidance>\n  <tip>\n    This Bash command may produce large output. To stay efficient:\n    - Use mcp__plugin_context-mode_context-mode__ctx_batch_execute(commands, queries) for multiple commands\n    - Use mcp__plugin_context-mode_context-mode__ctx_execute(language: "shell", code: "...") to run in sandbox\n    - Only your final printed summary will enter the context.\n    - Bash is best for: git, mkdir, rm, mv, navigation, and short-output commands only.\n  </tip>\n</context_guidance>';
