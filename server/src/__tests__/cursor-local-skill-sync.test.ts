import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listCursorSkills,
  syncCursorSkills,
} from "@handrailsai/adapter-cursor-local/server";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function createSkillDir(root: string, name: string) {
  const skillDir = path.join(root, name);
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(path.join(skillDir, "SKILL.md"), `---\nname: ${name}\n---\n`, "utf8");
  return skillDir;
}

describe("cursor local skill sync", () => {
  const handrailsKey = "handrailsai/handrails/handrails";
  const cleanupDirs = new Set<string>();

  afterEach(async () => {
    await Promise.all(Array.from(cleanupDirs).map((dir) => fs.rm(dir, { recursive: true, force: true })));
    cleanupDirs.clear();
  });

  it("reports configured Handrails skills and installs them into the Cursor skills home", async () => {
    const home = await makeTempDir("handrails-cursor-skill-sync-");
    cleanupDirs.add(home);

    const ctx = {
      agentId: "agent-1",
      companyId: "company-1",
      adapterType: "cursor",
      config: {
        env: {
          HOME: home,
        },
        handrailsSkillSync: {
          desiredSkills: [handrailsKey],
        },
      },
    } as const;

    const before = await listCursorSkills(ctx);
    expect(before.mode).toBe("persistent");
    expect(before.desiredSkills).toContain(handrailsKey);
    expect(before.entries.find((entry) => entry.key === handrailsKey)?.required).toBe(true);
    expect(before.entries.find((entry) => entry.key === handrailsKey)?.state).toBe("missing");

    const after = await syncCursorSkills(ctx, [handrailsKey]);
    expect(after.entries.find((entry) => entry.key === handrailsKey)?.state).toBe("installed");
    expect((await fs.lstat(path.join(home, ".cursor", "skills", "handrails"))).isSymbolicLink()).toBe(true);
  });

  it("recognizes company-library runtime skills supplied outside the bundled Handrails directory", async () => {
    const home = await makeTempDir("handrails-cursor-runtime-skills-home-");
    const runtimeSkills = await makeTempDir("handrails-cursor-runtime-skills-src-");
    cleanupDirs.add(home);
    cleanupDirs.add(runtimeSkills);

    const handrailsDir = await createSkillDir(runtimeSkills, "handrails");
    const asciiHeartDir = await createSkillDir(runtimeSkills, "ascii-heart");

    const ctx = {
      agentId: "agent-3",
      companyId: "company-1",
      adapterType: "cursor",
      config: {
        env: {
          HOME: home,
        },
        handrailsRuntimeSkills: [
          {
            key: "handrails",
            runtimeName: "handrails",
            source: handrailsDir,
            required: true,
            requiredReason: "Bundled Handrails skills are always available for local adapters.",
          },
          {
            key: "ascii-heart",
            runtimeName: "ascii-heart",
            source: asciiHeartDir,
          },
        ],
        handrailsSkillSync: {
          desiredSkills: ["ascii-heart"],
        },
      },
    } as const;

    const before = await listCursorSkills(ctx);
    expect(before.warnings).toEqual([]);
    expect(before.desiredSkills).toEqual(["handrails", "ascii-heart"]);
    expect(before.entries.find((entry) => entry.key === "ascii-heart")?.state).toBe("missing");

    const after = await syncCursorSkills(ctx, ["ascii-heart"]);
    expect(after.warnings).toEqual([]);
    expect(after.entries.find((entry) => entry.key === "ascii-heart")?.state).toBe("installed");
    expect((await fs.lstat(path.join(home, ".cursor", "skills", "ascii-heart"))).isSymbolicLink()).toBe(true);
  });

  it("keeps required bundled Handrails skills installed even when the desired set is emptied", async () => {
    const home = await makeTempDir("handrails-cursor-skill-prune-");
    cleanupDirs.add(home);

    const configuredCtx = {
      agentId: "agent-2",
      companyId: "company-1",
      adapterType: "cursor",
      config: {
        env: {
          HOME: home,
        },
        handrailsSkillSync: {
          desiredSkills: [handrailsKey],
        },
      },
    } as const;

    await syncCursorSkills(configuredCtx, [handrailsKey]);

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

    const after = await syncCursorSkills(clearedCtx, []);
    expect(after.desiredSkills).toContain(handrailsKey);
    expect(after.entries.find((entry) => entry.key === handrailsKey)?.state).toBe("installed");
    expect((await fs.lstat(path.join(home, ".cursor", "skills", "handrails"))).isSymbolicLink()).toBe(true);
  });
});
