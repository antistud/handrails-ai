import { Command } from "commander";
import { onboard } from "./commands/onboard.js";
import { doctor } from "./commands/doctor.js";
import { envCommand } from "./commands/env.js";
import { configure } from "./commands/configure.js";
import { addAllowedHostname } from "./commands/allowed-hostname.js";
import { heartbeatRun } from "./commands/heartbeat-run.js";
import { runCommand } from "./commands/run.js";
import { bootstrapCeoInvite } from "./commands/auth-bootstrap-ceo.js";
import { dbBackupCommand } from "./commands/db-backup.js";
import { registerContextCommands } from "./commands/client/context.js";
import { registerCompanyCommands } from "./commands/client/company.js";
import { registerIssueCommands } from "./commands/client/issue.js";
import { registerAgentCommands } from "./commands/client/agent.js";
import { registerApprovalCommands } from "./commands/client/approval.js";
import { registerActivityCommands } from "./commands/client/activity.js";
import { registerDashboardCommands } from "./commands/client/dashboard.js";
import { applyDataDirOverride, type DataDirOptionLike } from "./config/data-dir.js";
import { loadHandrailsEnvFile } from "./config/env.js";
import { registerWorktreeCommands } from "./commands/worktree.js";
import { registerPluginCommands } from "./commands/client/plugin.js";
import { registerClientAuthCommands } from "./commands/client/auth.js";
import { initCommand } from "./commands/init.js";

const program = new Command();
const DATA_DIR_OPTION_HELP =
  "Handrails data directory root (isolates state from ~/.handrails)";

program
  .name("handrailsai")
  .description("Handrails CLI — setup, diagnose, and configure your instance")
  .version("0.2.7");

program.hook("preAction", (_thisCommand, actionCommand) => {
  const options = actionCommand.optsWithGlobals() as DataDirOptionLike;
  const optionNames = new Set(actionCommand.options.map((option) => option.attributeName()));
  applyDataDirOverride(options, {
    hasConfigOption: optionNames.has("config"),
    hasContextOption: optionNames.has("context"),
  });
  loadHandrailsEnvFile(options.config);
});

program
  .command("onboard")
  .description("Interactive first-run setup wizard")
  .option("-c, --config <path>", "Path to config file")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("-y, --yes", "Accept defaults (quickstart + start immediately)", false)
  .option("--run", "Start Handrails immediately after saving config", false)
  .action(onboard);

program
  .command("doctor")
  .description("Run diagnostic checks on your Handrails setup")
  .option("-c, --config <path>", "Path to config file")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("--repair", "Attempt to repair issues automatically")
  .alias("--fix")
  .option("-y, --yes", "Skip repair confirmation prompts")
  .action(async (opts) => {
    await doctor(opts);
  });

program
  .command("env")
  .description("Print environment variables for deployment")
  .option("-c, --config <path>", "Path to config file")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .action(envCommand);

program
  .command("configure")
  .description("Update configuration sections")
  .option("-c, --config <path>", "Path to config file")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("-s, --section <section>", "Section to configure (llm, database, logging, server, storage, secrets)")
  .action(configure);

program
  .command("db:backup")
  .description("Create a one-off database backup using current config")
  .option("-c, --config <path>", "Path to config file")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("--dir <path>", "Backup output directory (overrides config)")
  .option("--retention-days <days>", "Retention window used for pruning", (value) => Number(value))
  .option("--filename-prefix <prefix>", "Backup filename prefix", "handrails")
  .option("--json", "Print backup metadata as JSON")
  .action(async (opts) => {
    await dbBackupCommand(opts);
  });

program
  .command("allowed-hostname")
  .description("Allow a hostname for authenticated/private mode access")
  .argument("<host>", "Hostname to allow (for example dotta-macbook-pro)")
  .option("-c, --config <path>", "Path to config file")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .action(addAllowedHostname);

program
  .command("init")
  .description("Scaffold a new business repo")
  .argument("<company-name>", "Company name (used to generate slug)")
  .option("--dir <path>", "Target directory (default: ./<slug>)")
  .action(initCommand);

program
  .command("run")
  .alias("up")
  .description("Bootstrap local setup (onboard + doctor) and run Handrails")
  .option("-c, --config <path>", "Path to config file")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("-i, --instance <id>", "Local instance id (default: default)")
  .option("-b, --business <path>", "Path to business repo directory")
  .option("--repair", "Attempt automatic repairs during doctor", true)
  .option("--no-repair", "Disable automatic repairs during doctor")
  .action(runCommand);

program
  .command("validate")
  .description("Validate business repo config without starting")
  .option("-b, --business <path>", "Path to business repo directory")
  .action(async (opts) => {
    const businessPath = opts.business ?? process.cwd();
    const fs = await import("node:fs");
    const manifestPath = `${businessPath}/handrails.yml`;
    if (!fs.existsSync(manifestPath)) {
      console.error("❌ handrails.yml not found at", manifestPath);
      process.exit(1);
    }
    console.log("✔ handrails.yml found");
    const agentsDir = `${businessPath}/agents`;
    if (fs.existsSync(agentsDir)) {
      const agents = fs.readdirSync(agentsDir).filter((f: string) => f.endsWith(".yml"));
      console.log(`✔ ${agents.length} agent definition(s) found`);
    }
    const knowledgeDir = `${businessPath}/knowledge`;
    if (fs.existsSync(knowledgeDir)) {
      console.log("✔ knowledge/ directory found");
    }
    console.log("\nBusiness repo is valid.");
  });

program
  .command("export")
  .description("Export runtime state (task history, costs, emails) for portability")
  .option("-c, --config <path>", "Path to config file")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("-o, --output <path>", "Output file path", "handrails-export.json")
  .action(async (opts) => {
    console.log(`Exporting runtime state to ${opts.output}...`);
    console.log("(Export functionality will be available in v0.4)");
  });

program
  .command("restore")
  .description("Restore runtime state from an export file")
  .argument("<file>", "Path to export file (handrails-export.json or .tar.gz)")
  .option("-c, --config <path>", "Path to config file")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .action(async (file) => {
    console.log(`Restoring runtime state from ${file}...`);
    console.log("(Restore functionality will be available in v0.4)");
  });

const knowledge = program.command("knowledge").description("Knowledge layer utilities");

knowledge
  .command("index")
  .description("Re-embed knowledge docs from the business repo")
  .option("-b, --business <path>", "Path to business repo directory")
  .option("--force", "Re-embed all documents, ignoring content hashes", false)
  .action(async (opts) => {
    console.log("Knowledge indexing requires a running Handrails instance.");
    console.log("Use: handrails up --business <path>");
    if (opts.force) {
      console.log("(--force will be passed to the sync service)");
    }
  });

const heartbeat = program.command("heartbeat").description("Heartbeat utilities");

heartbeat
  .command("run")
  .description("Run one agent heartbeat and stream live logs")
  .requiredOption("-a, --agent-id <agentId>", "Agent ID to invoke")
  .option("-c, --config <path>", "Path to config file")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("--context <path>", "Path to CLI context file")
  .option("--profile <name>", "CLI context profile name")
  .option("--api-base <url>", "Base URL for the Handrails server API")
  .option("--api-key <token>", "Bearer token for agent-authenticated calls")
  .option(
    "--source <source>",
    "Invocation source (timer | assignment | on_demand | automation)",
    "on_demand",
  )
  .option("--trigger <trigger>", "Trigger detail (manual | ping | callback | system)", "manual")
  .option("--timeout-ms <ms>", "Max time to wait before giving up", "0")
  .option("--json", "Output raw JSON where applicable")
  .option("--debug", "Show raw adapter stdout/stderr JSON chunks")
  .action(heartbeatRun);

registerContextCommands(program);
registerCompanyCommands(program);
registerIssueCommands(program);
registerAgentCommands(program);
registerApprovalCommands(program);
registerActivityCommands(program);
registerDashboardCommands(program);
registerWorktreeCommands(program);
registerPluginCommands(program);

const auth = program.command("auth").description("Authentication and bootstrap utilities");

auth
  .command("bootstrap-ceo")
  .description("Create a one-time bootstrap invite URL for first instance admin")
  .option("-c, --config <path>", "Path to config file")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("--force", "Create new invite even if admin already exists", false)
  .option("--expires-hours <hours>", "Invite expiration window in hours", (value) => Number(value))
  .option("--base-url <url>", "Public base URL used to print invite link")
  .action(bootstrapCeoInvite);

registerClientAuthCommands(auth);

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
