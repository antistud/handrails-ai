/**
 * `handrails init <company-name>` — scaffold a new business repo.
 *
 * Creates the standard directory structure, a default handrails.yml manifest,
 * a CEO agent definition, starter knowledge docs, and a .env.example.
 */

import fs from "node:fs";
import path from "node:path";

interface InitOptions {
  dir?: string;
}

export async function initCommand(companyName: string, opts: InitOptions) {
  const slug = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const targetDir = opts.dir ? path.resolve(opts.dir) : path.resolve(process.cwd(), slug);

  if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
    console.error(`Directory ${targetDir} already exists and is not empty.`);
    process.exit(1);
  }

  console.log(`\n  Creating business repo: ${slug}\n`);

  // Create directory structure
  const dirs = [
    "",
    "agents",
    "goals",
    "skills",
    "knowledge",
    "knowledge/sops",
    "knowledge/docs",
    "email",
    "projects",
  ];

  for (const dir of dirs) {
    fs.mkdirSync(path.join(targetDir, dir), { recursive: true });
  }

  // handrails.yml
  const manifest = `version: "0.3"

company:
  name: "${companyName}"
  slug: ${slug}
  mission: >
    Describe your company's mission here.

engine:
  version: ">=0.3.0"

knowledge:
  embedding_provider: openai
  embedding_model: text-embedding-3-small
  chunk_size: 512
  chunk_overlap: 50

email:
  mode: managed

cloud:
  enabled: false
`;
  fs.writeFileSync(path.join(targetDir, "handrails.yml"), manifest);

  // CEO agent
  const ceoAgent = `id: ceo
name: CEO
role: Chief Executive Officer
adapter: claude-code

heartbeat:
  schedule: "*/30 * * * *"
  enabled: true

budget:
  monthly_usd: 100

skills: []

knowledge_scopes:
  - sops
  - docs

system_prompt: >
  You are the CEO of ${companyName}. You oversee all operations,
  delegate tasks to other agents, and ensure the company mission
  is being fulfilled.
`;
  fs.writeFileSync(path.join(targetDir, "agents/ceo.yml"), ceoAgent);

  // Mission goal
  const mission = `# ${companyName} — Mission

Describe your company's mission, values, and goals here.

This file is automatically ingested into the knowledge layer and
available to all agents.
`;
  fs.writeFileSync(path.join(targetDir, "goals/mission.md"), mission);

  // Starter knowledge doc
  const starterDoc = `# Getting Started

Welcome to ${companyName}. This is a starter knowledge document.

Replace this with your company's SOPs, documentation, and
institutional knowledge. All markdown files in the \`knowledge/\`
directory are automatically indexed and searchable by agents.
`;
  fs.writeFileSync(path.join(targetDir, "knowledge/docs/getting-started.md"), starterDoc);

  // Email config
  const emailConfig = `mode: managed

managed:
  inbound_webhook_path: /webhooks/email/inbound
  resend_from_domain: ${slug}.example.com
`;
  fs.writeFileSync(path.join(targetDir, "email/config.yml"), emailConfig);

  // Email routes
  const emailRoutes = `routes:
  - default:
      project: inbox
`;
  fs.writeFileSync(path.join(targetDir, "email/routes.yml"), emailRoutes);

  // .env.example
  const envExample = `# API Keys (required)
OPENAI_API_KEY=sk-...

# Email (if using manual mode)
# IMAP_USER=
# IMAP_PASSWORD=
# SMTP_USER=
# SMTP_PASSWORD=

# Handrails Cloud (optional)
# HANDRAILS_CLOUD_TOKEN=
`;
  fs.writeFileSync(path.join(targetDir, ".env.example"), envExample);

  // .gitignore
  const gitignore = `.env
*.embeddings
*.log
node_modules/
.handrails-local/
`;
  fs.writeFileSync(path.join(targetDir, ".gitignore"), gitignore);

  // README
  const readme = `# ${companyName}

A Handrails business repo. Run with:

\`\`\`bash
cd ${slug}
cp .env.example .env
# Edit .env with your API keys
handrails up
\`\`\`

## Structure

- \`handrails.yml\` — Business manifest
- \`agents/\` — Agent definitions
- \`goals/\` — Company mission and goals
- \`skills/\` — Agent skills
- \`knowledge/\` — Documents for the knowledge layer
- \`email/\` — Email configuration and routing
- \`projects/\` — Project definitions
`;
  fs.writeFileSync(path.join(targetDir, "README.md"), readme);

  console.log(`  ✔ Created ${slug}/handrails.yml`);
  console.log(`  ✔ Created ${slug}/agents/ceo.yml`);
  console.log(`  ✔ Created ${slug}/goals/mission.md`);
  console.log(`  ✔ Created ${slug}/knowledge/docs/getting-started.md`);
  console.log(`  ✔ Created ${slug}/email/config.yml`);
  console.log(`  ✔ Created ${slug}/email/routes.yml`);
  console.log(`  ✔ Created ${slug}/.env.example`);
  console.log(`  ✔ Created ${slug}/.gitignore`);
  console.log(`  ✔ Created ${slug}/README.md`);
  console.log(`\n  Next steps:\n`);
  console.log(`    cd ${slug}`);
  console.log(`    git init && git add -A && git commit -m "Initial business repo"`);
  console.log(`    cp .env.example .env`);
  console.log(`    # Edit .env with your API keys`);
  console.log(`    handrails up\n`);
}
