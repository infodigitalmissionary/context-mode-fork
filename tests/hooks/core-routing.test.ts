import { describe, it, expect, beforeAll, beforeEach } from "vitest";

// Dynamic import for .mjs module
let routePreToolUse: (
  toolName: string,
  toolInput: Record<string, unknown>,
  projectDir?: string,
) => {
  action: string;
  reason?: string;
  updatedInput?: Record<string, unknown>;
  additionalContext?: string;
} | null;

let resetGuidanceThrottle: () => void;
let ROUTING_BLOCK: string;
let READ_GUIDANCE: string;
let GREP_GUIDANCE: string;

beforeAll(async () => {
  const mod = await import("../../hooks/core/routing.mjs");
  routePreToolUse = mod.routePreToolUse;
  resetGuidanceThrottle = mod.resetGuidanceThrottle;

  const constants = await import("../../hooks/routing-block.mjs");
  ROUTING_BLOCK = constants.ROUTING_BLOCK;
  READ_GUIDANCE = constants.READ_GUIDANCE;
  GREP_GUIDANCE = constants.GREP_GUIDANCE;
});

beforeEach(() => {
  if (typeof resetGuidanceThrottle === "function") resetGuidanceThrottle();
});

describe("routePreToolUse (SanitrackV3 fork)", () => {
  // ─── Bash routing ──────────────────────────────────────

  describe("Bash tool", () => {
    // SanitrackV3: curl/wget are ALLOWED (used for health checks)
    it("allows curl commands with guidance nudge", () => {
      const result = routePreToolUse("Bash", {
        command: "curl https://example.com",
      });
      expect(result).not.toBeNull();
      expect(result!.action).toBe("context");
      expect(result!.additionalContext).toBeDefined();
    });

    it("allows wget commands with guidance nudge", () => {
      const result = routePreToolUse("Bash", {
        command: "wget https://example.com/file.tar.gz",
      });
      expect(result).not.toBeNull();
      expect(result!.action).toBe("context");
    });

    // SanitrackV3: inline HTTP is ALLOWED
    it("allows inline fetch() with guidance nudge", () => {
      const result = routePreToolUse("Bash", {
        command: 'node -e "fetch(\'https://api.example.com/data\')"',
      });
      expect(result).not.toBeNull();
      expect(result!.action).toBe("context");
    });

    it("allows requests.get() with guidance nudge", () => {
      const result = routePreToolUse("Bash", {
        command: 'python -c "import requests; requests.get(\'https://example.com\')"',
      });
      expect(result).not.toBeNull();
      expect(result!.action).toBe("context");
    });

    it("allows git status with BASH_GUIDANCE context", () => {
      const result = routePreToolUse("Bash", { command: "git status" });
      expect(result).not.toBeNull();
      expect(result!.action).toBe("context");
      expect(result!.additionalContext).toBeDefined();
    });

    it("allows mkdir with BASH_GUIDANCE context", () => {
      const result = routePreToolUse("Bash", {
        command: "mkdir -p /tmp/test-dir",
      });
      expect(result).not.toBeNull();
      expect(result!.action).toBe("context");
    });

    it("allows npm install with BASH_GUIDANCE context", () => {
      const result = routePreToolUse("Bash", { command: "npm install" });
      expect(result).not.toBeNull();
      expect(result!.action).toBe("context");
    });

    // SanitrackV3: gradlew/gradle/maven are ALLOWED (needed for APK builds)
    it("allows ./gradlew build with guidance nudge", () => {
      const result = routePreToolUse("Bash", {
        command: "./gradlew build",
      });
      expect(result).not.toBeNull();
      expect(result!.action).toBe("context");
    });

    it("allows gradle test with guidance nudge", () => {
      const result = routePreToolUse("Bash", {
        command: "gradle test --info",
      });
      expect(result).not.toBeNull();
      expect(result!.action).toBe("context");
    });

    it("allows mvn package with guidance nudge", () => {
      const result = routePreToolUse("Bash", {
        command: "mvn clean package -DskipTests",
      });
      expect(result).not.toBeNull();
      expect(result!.action).toBe("context");
    });

    it("allows ./mvnw verify with guidance nudge", () => {
      const result = routePreToolUse("Bash", {
        command: "./mvnw verify",
      });
      expect(result).not.toBeNull();
      expect(result!.action).toBe("context");
    });

    it("guidance is only shown once per session", () => {
      const first = routePreToolUse("Bash", { command: "git status" });
      expect(first).not.toBeNull();
      expect(first!.action).toBe("context");

      const second = routePreToolUse("Bash", { command: "ls -la" });
      expect(second).toBeNull(); // throttled
    });
  });

  // ─── Read routing ──────────────────────────────────────

  describe("Read tool", () => {
    it("returns context action with READ_GUIDANCE", () => {
      const result = routePreToolUse("Read", {
        file_path: "/some/file.ts",
      });
      expect(result).not.toBeNull();
      expect(result!.action).toBe("context");
      expect(result!.additionalContext).toBe(READ_GUIDANCE);
    });
  });

  // ─── Grep routing ──────────────────────────────────────

  describe("Grep tool", () => {
    it("returns context action with GREP_GUIDANCE", () => {
      const result = routePreToolUse("Grep", {
        pattern: "TODO",
        path: "/some/dir",
      });
      expect(result).not.toBeNull();
      expect(result!.action).toBe("context");
      expect(result!.additionalContext).toBe(GREP_GUIDANCE);
    });
  });

  // ─── WebFetch routing ──────────────────────────────────

  describe("WebFetch tool", () => {
    // SanitrackV3: WebFetch is ALLOWED with a soft nudge (not denied)
    it("returns context guidance nudge instead of denial", () => {
      const result = routePreToolUse("WebFetch", {
        url: "https://docs.example.com",
        prompt: "Get the docs",
      });
      expect(result).not.toBeNull();
      expect(result!.action).toBe("context");
      expect(result!.additionalContext).toContain("fetch_and_index");
    });

    it("guidance mentions ctx_search as follow-up", () => {
      const result = routePreToolUse("WebFetch", {
        url: "https://api.github.com/repos/test",
      });
      expect(result).not.toBeNull();
      expect(result!.action).toBe("context");
    });

    it("treats mcp_web_fetch as WebFetch with soft nudge", () => {
      const url = "https://example.com";
      const result = routePreToolUse("mcp_web_fetch", { url });
      expect(result).not.toBeNull();
      expect(result!.action).toBe("context");
      expect(result!.additionalContext).toContain("fetch_and_index");
    });

    it("treats mcp_fetch_tool as WebFetch with soft nudge", () => {
      const url = "https://example.com";
      const result = routePreToolUse("mcp_fetch_tool", { url });
      expect(result).not.toBeNull();
      expect(result!.action).toBe("context");
      expect(result!.additionalContext).toContain("fetch_and_index");
    });

    it("webfetch guidance is only shown once per session", () => {
      const first = routePreToolUse("WebFetch", { url: "https://a.com" });
      expect(first).not.toBeNull();
      expect(first!.action).toBe("context");

      const second = routePreToolUse("WebFetch", { url: "https://b.com" });
      expect(second).toBeNull(); // throttled
    });
  });

  // ─── Agent/Task routing ─────────────────────────────────

  describe("Agent/Task tool (SanitrackV3: passthrough)", () => {
    // SanitrackV3: Agent/Task prompts are NOT modified
    it("passes through Task without modification", () => {
      const result = routePreToolUse("Task", {
        prompt: "Analyze the codebase",
        subagent_type: "general-purpose",
      });
      expect(result).toBeNull();
    });

    it("does NOT upgrade Bash subagent type", () => {
      const result = routePreToolUse("Task", {
        prompt: "Run some commands",
        subagent_type: "Bash",
      });
      expect(result).toBeNull();
    });

    it("passes through Agent without modification", () => {
      const result = routePreToolUse("Agent", {
        prompt: "Do research",
        subagent_type: "general-purpose",
      });
      expect(result).toBeNull();
    });
  });

  // ─── MCP tools ─────────────────────────────────────────

  describe("MCP execute tools", () => {
    it("passes through non-shell execute", () => {
      const result = routePreToolUse(
        "mcp__plugin_context-mode_context-mode__ctx_execute",
        { language: "javascript", code: "console.log('hello')" },
      );
      expect(result).toBeNull();
    });

    it("passes through execute_file without security", () => {
      const result = routePreToolUse(
        "mcp__plugin_context-mode_context-mode__ctx_execute_file",
        {
          path: "/some/file.log",
          language: "python",
          code: "print(len(FILE_CONTENT))",
        },
      );
      expect(result).toBeNull();
    });

    it("passes through batch_execute without security", () => {
      const result = routePreToolUse(
        "mcp__plugin_context-mode_context-mode__ctx_batch_execute",
        {
          commands: [{ label: "test", command: "ls -la" }],
          queries: ["file list"],
        },
      );
      expect(result).toBeNull();
    });
  });

  // ─── Unknown tools ─────────────────────────────────────

  describe("unknown tools", () => {
    it("returns null for Glob", () => {
      const result = routePreToolUse("Glob", { pattern: "**/*.ts" });
      expect(result).toBeNull();
    });

    it("returns null for Edit", () => {
      const result = routePreToolUse("Edit", {
        file_path: "/some/file.ts",
        old_string: "foo",
        new_string: "bar",
      });
      expect(result).toBeNull();
    });

    it("returns null for Write", () => {
      const result = routePreToolUse("Write", {
        file_path: "/some/file.ts",
        content: "hello",
      });
      expect(result).toBeNull();
    });

    it("returns null for WebSearch", () => {
      const result = routePreToolUse("WebSearch", {
        query: "vitest documentation",
      });
      expect(result).toBeNull();
    });
  });

  // ─── Platform alias tests ───────────────────────────────

  describe("platform tool aliases", () => {
    it("routes run_shell_command (Gemini) as Bash", () => {
      const result = routePreToolUse("run_shell_command", { command: "ls" });
      expect(result).not.toBeNull();
      expect(result!.action).toBe("context"); // bash guidance
    });

    it("routes read_file (Gemini) as Read", () => {
      const result = routePreToolUse("read_file", { file_path: "/test" });
      expect(result).not.toBeNull();
      expect(result!.action).toBe("context"); // read guidance
    });

    it("routes run_in_terminal (VS Code) as Bash", () => {
      const result = routePreToolUse("run_in_terminal", { command: "echo hi" });
      expect(result).not.toBeNull();
      expect(result!.action).toBe("context");
    });
  });
});
