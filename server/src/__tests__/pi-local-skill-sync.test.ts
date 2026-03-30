import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listPiSkills,
  syncPiSkills,
} from "@handrailsai/adapter-pi-local/server";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("pi local skill sync", () => {
  const handrailsKey = "handrailsai/handrails/handrails";
  const cleanupDirs = new Set<string>();

  afterEach(async () => {
    await Promise.all(Array.from(cleanupDirs).map((dir) => fs.rm(dir, { recursive: true, force: true })));
    cleanupDirs.clear();
  });

  it("reports configured Handrails skills and installs them into the Pi skills home", async () => {
    const home = await makeTempDir("handrails-pi-skill-sync-");
    cleanupDirs.add(home);

    const ctx = {
      agentId: "agent-1",
      companyId: "company-1",
      adapterType: "pi_local",
      config: {
        env: {
          HOME: home,
        },
        handrailsSkillSync: {
          desiredSkills: [handrailsKey],
        },
      },
    } as const;

    const before = await listPiSkills(ctx);
    expect(before.mode).toBe("persistent");
    expect(before.desiredSkills).toContain(handrailsKey);
    expect(before.entries.find((entry) => entry.key === handrailsKey)?.required).toBe(true);
    expect(before.entries.find((entry) => entry.key === handrailsKey)?.state).toBe("missing");

    const after = await syncPiSkills(ctx, [handrailsKey]);
    expect(after.entries.find((entry) => entry.key === handrailsKey)?.state).toBe("installed");
    expect((await fs.lstat(path.join(home, ".pi", "agent", "skills", "handrails"))).isSymbolicLink()).toBe(true);
  });

  it("keeps required bundled Handrails skills installed even when the desired set is emptied", async () => {
    const home = await makeTempDir("handrails-pi-skill-prune-");
    cleanupDirs.add(home);

    const configuredCtx = {
      agentId: "agent-2",
      companyId: "company-1",
      adapterType: "pi_local",
      config: {
        env: {
          HOME: home,
        },
        handrailsSkillSync: {
          desiredSkills: [handrailsKey],
        },
      },
    } as const;

    await syncPiSkills(configuredCtx, [handrailsKey]);

    const clearedCtx = {
      ...configuredCtx,
      config: {
        env: {
          HOME: home,
        },
        handrailsSkillSync: {
          desiredSkills: [],
        },
      },
    } as const;

    const after = await syncPiSkills(clearedCtx, []);
    expect(after.desiredSkills).toContain(handrailsKey);
    expect(after.entries.find((entry) => entry.key === handrailsKey)?.state).toBe("installed");
    expect((await fs.lstat(path.join(home, ".pi", "agent", "skills", "handrails"))).isSymbolicLink()).toBe(true);
  });
});
