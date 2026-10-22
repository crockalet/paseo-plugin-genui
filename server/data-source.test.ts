import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { agentAttempts } from "./data-source";

describe("agentAttempts", () => {
  const home = "/home/ubuntu";
  const storage = "/tmp/opencode/genui-storage/a1";
  const cwd = "/home/ubuntu/repos/app";
  const attempt = (requested: string) => agentAttempts(requested, storage, cwd, home);

  it("allows files under ~/dev/scratch, by absolute path and by ~", () => {
    const abs = attempt("/home/ubuntu/dev/scratch/avas-apps/hp/v4-sheet.png");
    expect(abs).toEqual([{ root: "/home/ubuntu/dev/scratch", target: "/home/ubuntu/dev/scratch/avas-apps/hp/v4-sheet.png" }]);
    expect(attempt("~/dev/scratch/x.png")).toEqual([{ root: "/home/ubuntu/dev/scratch", target: "/home/ubuntu/dev/scratch/x.png" }]);
  });

  it("follows the daemon user's home on the Mac too", () => {
    const mac = agentAttempts("/Users/me/dev/scratch/a.png", storage, null, "/Users/me");
    expect(mac).toHaveLength(1);
  });

  it("refuses escapes and other home paths", () => {
    expect(attempt("/home/ubuntu/dev/scratch/../../.ssh/id_rsa")).toEqual([]);
    expect(attempt("~/dev/scratch/../.ssh/id_rsa")).toEqual([]);
    expect(attempt("~/.ssh/id_rsa")).toEqual([]);
    expect(attempt("/home/ubuntu/dev/other/a.png")).toEqual([]);
    expect(attempt("/home/ubuntu/dev/scratch")).toEqual([]);
  });

  it("still serves workspace, storage and tmp", () => {
    expect(attempt("/home/ubuntu/repos/app/a.png")).toEqual([{ root: cwd, target: "/home/ubuntu/repos/app/a.png" }]);
    expect(attempt("$BB_THREAD_STORAGE/a.json")).toEqual([{ root: storage, target: `${storage}/a.json` }]);
    expect(attempt("/tmp/x.png").length).toBeGreaterThan(0);
  });
});

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("scratch root symlinks", () => {
  it("rejects a symlink in scratch that points outside it", async () => {
    const { loadAgentFile } = await import("./data-source");
    const home = mkdtempSync(join(tmpdir(), "genui-home-"));
    dirs.push(home);
    mkdirSync(join(home, "dev", "scratch"), { recursive: true });
    writeFileSync(join(home, "secret.txt"), "secret");
    symlinkSync(join(home, "secret.txt"), join(home, "dev", "scratch", "link.txt"));
    writeFileSync(join(home, "dev", "scratch", "ok.txt"), "fine");
    const prev = process.env.HOME;
    process.env.HOME = home;
    try {
      const paseo = { agents: { ref: () => ({ current: () => ({ cwd: "/nonexistent" }), refresh: async () => null }) } } as never;
      const ok = await loadAgentFile(paseo, "t1", join(home, "dev", "scratch", "ok.txt"), { raw: true });
      expect(ok).toEqual({ ok: true, value: "fine" });
      const bad = await loadAgentFile(paseo, "t1", join(home, "dev", "scratch", "link.txt"), { raw: true });
      expect(bad.ok).toBe(false);
    } finally {
      process.env.HOME = prev;
    }
  });
});
