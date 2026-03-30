/**
 * handrails.yml — Business Manifest Schema
 *
 * Defines the shape of the business repo manifest that drives
 * the two-repo architecture: engine (handrails-ai) + business (your company).
 */

export interface BusinessManifest {
  version: string;

  company: {
    name: string;
    slug: string;
    mission?: string;
  };

  engine: {
    version: string; // semver range, e.g. ">=0.3.0"
  };

  knowledge?: {
    embedding_provider: "openai" | "voyage";
    embedding_model: string;
    chunk_size: number;
    chunk_overlap: number;
    chunk_strategy?: "fixed" | "markdown";
  };

  email?: {
    mode: "managed" | "manual";
    inbound?: string;
    outbound_name?: string;
    outbound_address?: string;
  };

  cloud?: {
    enabled: boolean;
    instance_name?: string;
  };
}

export interface AgentDefinition {
  id: string;
  name: string;
  role: string;
  reports_to?: string;
  adapter: string;
  heartbeat?: {
    schedule: string; // cron expression
    enabled: boolean;
  };
  budget?: {
    monthly_usd: number;
  };
  skills?: string[];
  knowledge_scopes?: string[];
  system_prompt?: string;
}

export interface EmailRouteConfig {
  routes: Array<{
    match?: {
      to?: string;
      from?: string;
      subject?: string;
    };
    route: {
      project: string;
      agent: string;
    };
    default?: {
      project: string;
    };
  }>;
}

export interface EmailConfig {
  mode: "managed" | "manual";
  managed?: {
    inbound_webhook_path: string;
    resend_from_domain: string;
  };
  manual?: {
    imap?: {
      host: string;
      port: number;
      poll_interval_seconds: number;
    };
    smtp?: {
      host: string;
      port: number;
    };
  };
}

/**
 * Default manifest for `handrails init`.
 */
export function createDefaultManifest(companyName: string, slug: string): BusinessManifest {
  return {
    version: "0.3",
    company: {
      name: companyName,
      slug,
    },
    engine: {
      version: ">=0.3.0",
    },
    knowledge: {
      embedding_provider: "openai",
      embedding_model: "text-embedding-3-small",
      chunk_size: 512,
      chunk_overlap: 50,
    },
    email: {
      mode: "managed",
    },
    cloud: {
      enabled: false,
    },
  };
}
