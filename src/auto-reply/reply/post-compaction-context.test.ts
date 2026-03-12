import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import { readPostCompactionContext } from "./post-compaction-context.js";

describe("readPostCompactionContext", () => {
  const tmpDir = path.join("/tmp", "test-post-compaction-" + Date.now());

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when no AGENTS.md exists", async () => {
    const result = await readPostCompactionContext(tmpDir);
    expect(result).toBeNull();
  });

  it("returns a concise prompt when AGENTS.md exists", async () => {
    fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), "# My Agent\n\nSome content.\n");
    const result = await readPostCompactionContext(tmpDir);
    expect(result).not.toBeNull();
    expect(result).toContain("[Post-compaction context refresh]");
    expect(result).toContain("Session was compacted");
    expect(result).toContain("Re-read your startup files");
    expect(result).toContain("AGENTS.md");
  });

  it("includes the current time line", async () => {
    fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), "## Session Startup\n\nDo startup.\n");
    const nowMs = Date.UTC(2026, 2, 3, 14, 0, 0);
    const result = await readPostCompactionContext(tmpDir, undefined, nowMs);
    expect(result).not.toBeNull();
    expect(result).toContain("Current time:");
  });

  it("does NOT dump AGENTS.md section content", async () => {
    const content = `## Session Startup

Read WORKFLOW_AUTO.md
Do something.

## Red Lines

Never break things.
`;
    fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), content);
    const result = await readPostCompactionContext(tmpDir);
    expect(result).not.toBeNull();
    // Concise mode: should NOT dump the section body
    expect(result).not.toContain("WORKFLOW_AUTO.md");
    expect(result).not.toContain("Never break things");
  });

  it.runIf(process.platform !== "win32")(
    "returns null when AGENTS.md is a symlink escaping workspace",
    async () => {
      // Create outside file in a sibling dir so the symlink truly escapes
      const siblingDir = path.join(path.dirname(tmpDir), "outside-" + Date.now());
      fs.mkdirSync(siblingDir, { recursive: true });
      const outside = path.join(siblingDir, "secret.txt");
      fs.writeFileSync(outside, "secret");
      fs.symlinkSync(outside, path.join(tmpDir, "AGENTS.md"));

      try {
        const result = await readPostCompactionContext(tmpDir);
        expect(result).toBeNull();
      } finally {
        fs.rmSync(siblingDir, { recursive: true, force: true });
      }
    },
  );

  // -------------------------------------------------------------------------
  // postCompactionSections config
  // -------------------------------------------------------------------------
  describe("agents.defaults.compaction.postCompactionSections", () => {
    it("returns a concise prompt when config is not set (default behaviour)", async () => {
      const content = `## Session Startup\n\nDo startup.\n\n## Red Lines\n\nDo not break.\n`;
      fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), content);
      const result = await readPostCompactionContext(tmpDir);
      expect(result).not.toBeNull();
      expect(result).toContain("[Post-compaction context refresh]");
    });

    it("returns null when postCompactionSections is explicitly set to [] (opt-out)", async () => {
      const content = `## Session Startup\n\nDo startup.\n\n## Red Lines\n\nDo not break.\n`;
      fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), content);
      const cfg = {
        agents: {
          defaults: {
            compaction: { postCompactionSections: [] },
          },
        },
      } as OpenClawConfig;
      const result = await readPostCompactionContext(tmpDir, cfg);
      // Empty array = opt-out: no post-compaction context injection
      expect(result).toBeNull();
    });

    it("returns a concise prompt even when custom sections are configured", async () => {
      const content = `## Boot Sequence\n\nDo custom boot things.\n`;
      fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), content);
      const cfg = {
        agents: {
          defaults: {
            compaction: { postCompactionSections: ["Boot Sequence"] },
          },
        },
      } as OpenClawConfig;
      const result = await readPostCompactionContext(tmpDir, cfg);
      expect(result).not.toBeNull();
      expect(result).toContain("[Post-compaction context refresh]");
      expect(result).toContain("Re-read your startup files");
    });

    it("returns a concise prompt when configured sections are not found in AGENTS.md", async () => {
      const content = `## Session Startup\n\nDo startup.\n`;
      fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), content);
      const cfg = {
        agents: {
          defaults: {
            compaction: { postCompactionSections: ["Nonexistent Section"] },
          },
        },
      } as OpenClawConfig;
      const result = await readPostCompactionContext(tmpDir, cfg);
      // AGENTS.md exists → prompt is still returned (agent is told to re-read)
      expect(result).not.toBeNull();
      expect(result).toContain("[Post-compaction context refresh]");
    });
  });
});
