/**
 * Pure routing logic for PreToolUse hooks.
 * Returns NORMALIZED decision objects (NOT platform-specific format).
 *
 * Decision types:
 * - { action: "deny", reason: string }
 * - { action: "ask" }
 * - { action: "modify", updatedInput: object }
 * - { action: "context", additionalContext: string }
 * - null (passthrough)
 */

import { ROUTING_BLOCK, READ_GUIDANCE, GREP_GUIDANCE, BASH_GUIDANCE } from "../routing-block.mjs";
import { existsSync, mkdirSync, rmSync, openSync, closeSync, constants as fsConstants } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

// Guidance throttle: show each advisory type at most once per session.
// Hybrid approach:
//   - In-memory Set for same-process (OpenCode ts-plugin, vitest)
//   - File-based markers with O_EXCL for cross-process atomicity
//     (Claude Code, Gemini, Cursor, VS Code Copilot)
// Session scoped via process.ppid (= host PID, constant for session lifetime).
const _guidanceShown = new Set();
const _guidanceId = process.env.VITEST_WORKER_ID
  ? `${process.ppid}-w${process.env.VITEST_WORKER_ID}`
  : String(process.ppid);
const _guidanceDir = resolve(tmpdir(), `context-mode-guidance-${_guidanceId}`);

function guidanceOnce(type, content) {
  // Fast path: in-memory (same process)
  if (_guidanceShown.has(type)) return null;

  // Ensure marker directory exists
  try { mkdirSync(_guidanceDir, { recursive: true }); } catch {}

  // Atomic create-or-fail: O_CREAT | O_EXCL | O_WRONLY
  // First process to create the file wins; others get EEXIST.
  const marker = resolve(_guidanceDir, type);
  try {
    const fd = openSync(marker, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY);
    closeSync(fd);
  } catch {
    // EEXIST = another process already created it, or we did in-memory
    _guidanceShown.add(type);
    return null;
  }

  _guidanceShown.add(type);
  return { action: "context", additionalContext: content };
}

export function resetGuidanceThrottle() {
  _guidanceShown.clear();
  try { rmSync(_guidanceDir, { recursive: true, force: true }); } catch {}
}

/**
 * Strip heredoc content from a shell command.
 * Handles: <<EOF, <<"EOF", <<'EOF', <<-EOF (indented), with optional spaces.
 */
function stripHeredocs(cmd) {
  return cmd.replace(/<<-?\s*["']?(\w+)["']?[\s\S]*?\n\s*\1/g, "");
}

/**
 * Strip ALL quoted content from a shell command so regex only matches command tokens.
 * Removes heredocs, single-quoted strings, and double-quoted strings.
 * This prevents false positives like: gh issue edit --body "text with curl in it"
 */
function stripQuotedContent(cmd) {
  return stripHeredocs(cmd)
    .replace(/'[^']*'/g, "''")                    // single-quoted strings
    .replace(/"[^"]*"/g, '""');                   // double-quoted strings
}

// Try to import security module — may not exist
let security = null;

export async function initSecurity(buildDir) {
  try {
    const { pathToFileURL } = await import("node:url");
    const secPath = (await import("node:path")).resolve(buildDir, "security.js");
    security = await import(pathToFileURL(secPath).href);
  } catch { /* not available */ }
}

/**
 * Normalize platform-specific tool names to canonical (Claude Code) names.
 *
 * Evidence:
 * - Gemini CLI: https://github.com/google-gemini/gemini-cli (run_shell_command, read_file, grep_search, web_fetch, activate_skill)
 * - OpenCode:   https://github.com/opencode-ai/opencode (bash, view, grep, fetch, agent)
 * - Codex CLI:  https://github.com/openai/codex (shell, read_file, grep_files, container.exec)
 * - VS Code Copilot: run_in_terminal (command field), read_file, run_vs_code_task
 */
const TOOL_ALIASES = {
  // Gemini CLI
  "run_shell_command": "Bash",
  "read_file": "Read",
  "read_many_files": "Read",
  "grep_search": "Grep",
  "search_file_content": "Grep",
  "web_fetch": "WebFetch",
  "activate_skill": "Agent",
  // OpenCode
  "bash": "Bash",
  "view": "Read",
  "grep": "Grep",
  "fetch": "WebFetch",
  "agent": "Agent",
  // Codex CLI
  "shell": "Bash",
  "shell_command": "Bash",
  "exec_command": "Bash",
  "container.exec": "Bash",
  "local_shell": "Bash",
  "grep_files": "Grep",
  // Cursor
  "mcp_web_fetch": "WebFetch",
  "mcp_fetch_tool": "WebFetch",
  "Shell": "Bash",
  // VS Code Copilot
  "run_in_terminal": "Bash",
};

/**
 * Route a PreToolUse event. Returns normalized decision object or null for passthrough.
 */
export function routePreToolUse(toolName, toolInput, projectDir) {
  // Normalize platform-specific tool name to canonical
  const canonical = TOOL_ALIASES[toolName] ?? toolName;

  // ─── Bash: Stage 1 security check, then Stage 2 routing ───
  if (canonical === "Bash") {
    const command = toolInput.command ?? "";

    // Stage 1: Security check against user's deny/allow patterns.
    // Only act when an explicit pattern matched. When no pattern matches,
    // evaluateCommand returns { decision: "ask" } with no matchedPattern —
    // in that case fall through so other hooks and the platform's native engine can decide.
    if (security) {
      const policies = security.readBashPolicies(projectDir);
      if (policies.length > 0) {
        const result = security.evaluateCommand(command, policies);
        if (result.decision === "deny") {
          return { action: "deny", reason: `Blocked by security policy: matches deny pattern ${result.matchedPattern}` };
        }
        if (result.decision === "ask" && result.matchedPattern) {
          return { action: "ask" };
        }
        // "allow" or no match → fall through to Stage 2
      }
    }

    // Stage 2: Context-mode routing (SanitrackV3 customization)
    //
    // REMOVED hard blocks on curl/wget, inline HTTP, and gradlew/gradle/maven.
    // Rationale:
    //   - curl is used for service health checks (localhost:3333, localhost:3000, localhost:9090)
    //   - wget is occasionally used for asset downloads
    //   - gradlew is required for EAS/Android APK builds (non-negotiable in our workflow)
    //   - Inline HTTP (fetch, requests.get) appears in test scripts and seed data
    //
    // Instead of blocking, we provide a one-time guidance nudge suggesting sandbox
    // alternatives for commands that produce large output. The developer retains
    // full control over which tool to use.

    // allow all Bash commands, but inject routing nudge (once per session)
    return guidanceOnce("bash", BASH_GUIDANCE);
  }

  // ─── Read: nudge toward execute_file (once per session) ───
  if (canonical === "Read") {
    return guidanceOnce("read", READ_GUIDANCE);
  }

  // ─── Grep: nudge toward execute (once per session) ───
  if (canonical === "Grep") {
    return guidanceOnce("grep", GREP_GUIDANCE);
  }

  // ─── WebFetch: soft nudge instead of hard deny (SanitrackV3 customization) ───
  // REMOVED hard denial. WebFetch/WebSearch are used for documentation lookups,
  // library research, and Context7 queries. Blocking them breaks our workflow.
  // Instead, provide a one-time nudge suggesting ctx_fetch_and_index as an alternative.
  if (canonical === "WebFetch") {
    return guidanceOnce("webfetch", '<context_guidance>\n  <tip>\n    Consider using mcp__plugin_context-mode_context-mode__ctx_fetch_and_index(url, source) to fetch and index this URL. The indexed content can then be searched with ctx_search(queries) without re-fetching. This keeps raw HTML out of your context window.\n  </tip>\n</context_guidance>');
  }

  // ─── Agent/Task: lightweight context-mode awareness (SanitrackV3 customization) ───
  // REMOVED forced prompt injection and subagent_type override.
  // Rationale:
  //   - Our swarm orchestration (God's Eye) uses carefully crafted agent prompts
  //   - Injecting a large ROUTING_BLOCK at the end corrupts orchestrator instructions
  //   - Overriding subagent_type from "Bash" to "general-purpose" breaks agent dispatch
  //   - Subagents inherit context-mode MCP tools automatically via the MCP server
  //
  // Instead, pass through without modification. Agents that want sandbox tools
  // can use them directly — the MCP server is available to all agents.
  if (canonical === "Agent" || canonical === "Task") {
    return null; // passthrough — do not modify agent prompts
  }

  // ─── MCP execute: security check for shell commands ───
  // Match both __execute and __ctx_execute (prefixed tool names)
  // Cursor can also surface the tool as MCP:ctx_execute_file.
  if (
    (toolName.includes("context-mode") && /__(ctx_)?execute$/.test(toolName)) ||
    /^MCP:(ctx_)?execute$/.test(toolName)
  ) {
    if (security && toolInput.language === "shell") {
      const code = toolInput.code ?? "";
      const policies = security.readBashPolicies(projectDir);
      if (policies.length > 0) {
        const result = security.evaluateCommand(code, policies);
        if (result.decision === "deny") {
          return { action: "deny", reason: `Blocked by security policy: shell code matches deny pattern ${result.matchedPattern}` };
        }
        if (result.decision === "ask" && result.matchedPattern) {
          return { action: "ask" };
        }
      }
    }
    return null;
  }

  // ─── MCP execute_file: check file path + code against deny patterns ───
  // Cursor can also surface the tool as MCP:ctx_execute_file.
  if (
    (toolName.includes("context-mode") && /__(ctx_)?execute_file$/.test(toolName)) ||
    /^MCP:(ctx_)?execute_file$/.test(toolName)
  ) {
    if (security) {
      // Check file path against Read deny patterns
      const filePath = toolInput.path ?? "";
      const denyGlobs = security.readToolDenyPatterns("Read", projectDir);
      const evalResult = security.evaluateFilePath(filePath, denyGlobs);
      if (evalResult.denied) {
        return { action: "deny", reason: `Blocked by security policy: file path matches Read deny pattern ${evalResult.matchedPattern}` };
      }

      // Check code parameter against Bash deny patterns (same as execute)
      const lang = toolInput.language ?? "";
      const code = toolInput.code ?? "";
      if (lang === "shell") {
        const policies = security.readBashPolicies(projectDir);
        if (policies.length > 0) {
          const result = security.evaluateCommand(code, policies);
          if (result.decision === "deny") {
            return { action: "deny", reason: `Blocked by security policy: shell code matches deny pattern ${result.matchedPattern}` };
          }
          if (result.decision === "ask" && result.matchedPattern) {
            return { action: "ask" };
          }
        }
      }
    }
    return null;
  }

  // ─── MCP batch_execute: check each command individually ───
  if (toolName.includes("context-mode") && /__(ctx_)?batch_execute$/.test(toolName)) {
    if (security) {
      const commands = toolInput.commands ?? [];
      const policies = security.readBashPolicies(projectDir);
      if (policies.length > 0) {
        for (const entry of commands) {
          const cmd = entry.command ?? "";
          const result = security.evaluateCommand(cmd, policies);
          if (result.decision === "deny") {
            return { action: "deny", reason: `Blocked by security policy: batch command "${entry.label ?? cmd}" matches deny pattern ${result.matchedPattern}` };
          }
          if (result.decision === "ask" && result.matchedPattern) {
            return { action: "ask" };
          }
        }
      }
    }
    return null;
  }

  // Unknown tool — pass through
  return null;
}
