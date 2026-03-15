/**
 * Hook Integration Tests — Cursor hooks
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, existsSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir, homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOKS_DIR = join(__dirname, "..", "..", "hooks", "cursor");

interface HookResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runHook(hookFile: string, input: Record<string, unknown>, env?: Record<string, string>): HookResult {
  const result = spawnSync("node", [join(HOOKS_DIR, hookFile)], {
    input: JSON.stringify(input),
    encoding: "utf-8",
    timeout: 10000,
    env: { ...process.env, ...env },
  });

  return {
    exitCode: result.status ?? 1,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
  };
}

describe("Cursor hooks", () => {
  let tempDir: string;
  let dbPath: string;
  let eventsPath: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cursor-hook-test-"));
    const hash = createHash("sha256").update(tempDir).digest("hex").slice(0, 16);
    const sessionsDir = join(homedir(), ".cursor", "context-mode", "sessions");
    dbPath = join(sessionsDir, `${hash}.db`);
    eventsPath = join(sessionsDir, `${hash}-events.md`);
  });

  afterAll(() => {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* best effort */ }
    try { if (existsSync(dbPath)) unlinkSync(dbPath); } catch { /* best effort */ }
    try { if (existsSync(eventsPath)) unlinkSync(eventsPath); } catch { /* best effort */ }
  });

  // Clean file-based guidance throttle markers between tests.
  // Subprocess hooks use process.ppid (= this test's pid) for marker dir.
  beforeEach(() => {
    const wid = process.env.VITEST_WORKER_ID;
    const suffix = wid ? `${process.pid}-w${wid}` : String(process.pid);
    const guidanceDir = resolve(tmpdir(), `context-mode-guidance-${suffix}`);
    try { rmSync(guidanceDir, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  const cursorEnv = () => ({ CURSOR_CWD: tempDir });

  describe("pretooluse.mjs", () => {
    test("returns minimal native JSON for passthrough tools", () => {
      const result = runHook("pretooluse.mjs", {
        conversation_id: "f3f38f32-bf63-414c-89de-32a969a57c56",
        generation_id: "8611d24a-cb1f-41bd-86dd-9a30223f31bc",
        model: "default",
        tool_name: "Write",
        tool_input: {
          file_path: `${tempDir}/ignored-docs/faq-schema-mapping.md`,
          content: "# FAQ Page -> Schema.org Mapping",
        },
        tool_use_id: "tool_e183fd3b-0480-406c-a332-0251dbcccce",
        hook_event_name: "preToolUse",
        cursor_version: "2.7.0-pre.31.patch.0",
        workspace_roots: [tempDir],
        user_email: "test@example.com",
        transcript_path: `${tempDir}/transcripts/f3f38f32-bf63-414c-89de-32a969a57c56.jsonl`,
      }, {});

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("{\"agent_message\":\"\"}");
    });

    // SanitrackV3 fork: curl is allowed (returns guidance nudge, not modify)
    test("allows curl shell commands with guidance", () => {
      const result = runHook("pretooluse.mjs", {
        tool_name: "Shell",
        tool_input: { command: "curl https://example.com" },
        conversation_id: "cursor-hook-pre-1",
        cwd: tempDir,
      }, cursorEnv());

      expect(result.exitCode).toBe(0);
      const payload = JSON.parse(result.stdout) as Record<string, unknown>;
      // Should get agent_message with guidance, not updated_input
      expect(payload.agent_message).toBeTruthy();
    });

    // SanitrackV3 fork: WebFetch returns soft nudge, not deny
    test("allows WebFetch with guidance nudge", () => {
      const result = runHook("pretooluse.mjs", {
        tool_name: "WebFetch",
        tool_input: { url: "https://example.com" },
        conversation_id: "cursor-hook-pre-2",
        cwd: tempDir,
      }, cursorEnv());

      expect(result.exitCode).toBe(0);
      const payload = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(String(payload.agent_message)).toContain("fetch_and_index");
    });

    test("allows mcp_web_fetch with guidance nudge", () => {
      const result = runHook("pretooluse.mjs", {
        tool_name: "mcp_web_fetch",
        tool_input: { url: "https://example.com" },
        conversation_id: "cursor-hook-pre-3",
        cwd: tempDir,
      }, cursorEnv());

      expect(result.exitCode).toBe(0);
      const payload = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(String(payload.agent_message)).toContain("fetch_and_index");
    });

    test("allows mcp_fetch_tool with guidance nudge", () => {
      const result = runHook("pretooluse.mjs", {
        tool_name: "mcp_fetch_tool",
        tool_input: { url: "https://example.com" },
        conversation_id: "cursor-hook-pre-4",
        cwd: tempDir,
      }, cursorEnv());

      expect(result.exitCode).toBe(0);
      const payload = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(String(payload.agent_message)).toContain("fetch_and_index");
    });
  });

  describe("posttooluse.mjs", () => {
    test("captures events and returns minimal native JSON", () => {
      const result = runHook("posttooluse.mjs", {
        tool_name: "Shell",
        tool_input: { command: "git status --short" },
        tool_output: " M src/app.ts",
        conversation_id: "cursor-hook-post-1",
        cwd: tempDir,
      }, cursorEnv());

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("{\"additional_context\":\"\"}");
    });

    test("accepts live Cursor payloads that only provide workspace_roots", () => {
      const result = runHook("posttooluse.mjs", {
        conversation_id: "d66efc75-eed7-4d8f-b96c-c344d8540836",
        generation_id: "4f031517-3cde-42fd-8d87-52a0ef9337a1",
        model: "default",
        tool_name: "Grep",
        tool_input: {
          pattern: "schema_",
          file_path: "/Volumes/2TB_EXT/HelloWorld/repos/wavemetrics/config/sync",
          glob: "metatag*.yml",
        },
        tool_output: "{\"pattern\":\"schema_\",\"success\":true}",
        duration: 49.848,
        tool_use_id: "tool_eb274a67-992a-4601-8853-9c1defd0225",
        hook_event_name: "postToolUse",
        cursor_version: "2.7.0-pre.31.patch.0",
        workspace_roots: [tempDir],
        user_email: "test@example.com",
        transcript_path: `${tempDir}/transcripts/d66efc75-eed7-4d8f-b96c-c344d8540836.jsonl`,
      }, {});

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("{\"additional_context\":\"\"}");
    });
  });

  describe("sessionstart.mjs", () => {
    test("returns native additional_context JSON", () => {
      const result = runHook("sessionstart.mjs", {
        source: "startup",
        conversation_id: "cursor-hook-start-1",
        cwd: tempDir,
      }, cursorEnv());

      expect(result.exitCode).toBe(0);
      const payload = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(String(payload.additional_context)).toContain("context-mode");
    });

    test("accepts live Cursor payloads that only provide workspace_roots", () => {
      const result = runHook("sessionstart.mjs", {
        conversation_id: "77f526f3-01b0-4813-87dd-30dccda99dd1",
        generation_id: "",
        model: "default",
        session_id: "77f526f3-01b0-4813-87dd-30dccda99dd1",
        is_background_agent: false,
        composer_mode: "agent",
        hook_event_name: "sessionStart",
        cursor_version: "2.7.0-pre.31.patch.0",
        workspace_roots: [tempDir],
        user_email: "test@example.com",
        transcript_path: null,
      }, {});

      expect(result.exitCode).toBe(0);
      const payload = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(String(payload.additional_context)).toContain("context-mode");
    });
  });

  describe("end-to-end flow", () => {
    test("captures tool events and restores on compact", () => {
      const sessionId = "cursor-hook-e2e";
      const env = cursorEnv();

      runHook("posttooluse.mjs", {
        tool_name: "Read",
        tool_input: { file_path: "/src/app.ts" },
        tool_output: "export default {}",
        conversation_id: sessionId,
        cwd: tempDir,
      }, env);

      const startResult = runHook("sessionstart.mjs", {
        source: "compact",
        conversation_id: sessionId,
        cwd: tempDir,
      }, env);

      expect(startResult.exitCode).toBe(0);
      const payload = JSON.parse(startResult.stdout) as Record<string, unknown>;
      // Session start should include context-mode routing info
      expect(String(payload.additional_context)).toContain("context-mode");
    });
  });
});
