import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  describeLocalInstancePaths,
  expandHomePrefix,
  resolveHandrailsHomeDir,
  resolveHandrailsInstanceId,
} from "../config/home.js";

const ORIGINAL_ENV = { ...process.env };

describe("home path resolution", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("defaults to ~/.handrails and default instance", () => {
    delete process.env.HANDRAILS_HOME;
    delete process.env.HANDRAILS_INSTANCE_ID;

    const paths = describeLocalInstancePaths();
    expect(paths.homeDir).toBe(path.resolve(os.homedir(), ".handrails"));
    expect(paths.instanceId).toBe("default");
    expect(paths.configPath).toBe(path.resolve(os.homedir(), ".handrails", "instances", "default", "config.json"));
  });

  it("supports HANDRAILS_HOME and explicit instance ids", () => {
    process.env.HANDRAILS_HOME = "~/handrails-home";

    const home = resolveHandrailsHomeDir();
    expect(home).toBe(path.resolve(os.homedir(), "handrails-home"));
    expect(resolveHandrailsInstanceId("dev_1")).toBe("dev_1");
  });

  it("rejects invalid instance ids", () => {
    expect(() => resolveHandrailsInstanceId("bad/id")).toThrow(/Invalid instance id/);
  });

  it("expands ~ prefixes", () => {
    expect(expandHomePrefix("~")).toBe(os.homedir());
    expect(expandHomePrefix("~/x/y")).toBe(path.resolve(os.homedir(), "x/y"));
  });
});
