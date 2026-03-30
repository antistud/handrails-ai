import fs from "node:fs";
import { handrailsConfigSchema, type HandrailsConfig } from "@handrailsai/shared";
import { resolveHandrailsConfigPath } from "./paths.js";

export function readConfigFile(): HandrailsConfig | null {
  const configPath = resolveHandrailsConfigPath();

  if (!fs.existsSync(configPath)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return handrailsConfigSchema.parse(raw);
  } catch {
    return null;
  }
}
