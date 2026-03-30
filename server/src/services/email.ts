/**
 * Email Service — External boundary for Handrails.
 *
 * Inbound email → task creation. Outbound email → agent tool action.
 * Agents never email each other — email is strictly world-to-system
 * and system-to-world.
 *
 * Supports two modes:
 * - **Managed**: Cloudflare Email Workers (inbound) + Resend (outbound)
 * - **Manual**: Raw IMAP polling (inbound) + SMTP (outbound)
 */

import type { Logger } from "pino";
import type { Db } from "@handrailsai/db";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EmailConfig {
  mode: "managed" | "manual";
  managed?: {
    resendApiKey?: string;
    fromDomain?: string;
    fromName?: string;
    fromAddress?: string;
    inboundWebhookPath?: string;
  };
  manual?: {
    imap?: {
      host: string;
      port: number;
      user: string;
      password: string;
      tls: boolean;
      pollIntervalSeconds: number;
    };
    smtp?: {
      host: string;
      port: number;
      user: string;
      password: string;
      tls: boolean;
    };
  };
}

export interface EmailRoute {
  match?: {
    to?: string;
    from?: string;
    subject?: string;
  };
  route: {
    project: string;
    agent: string;
  };
}

export interface InboundEmail {
  from: string;
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  headers?: Record<string, string>;
  receivedAt: Date;
}

export interface OutboundEmail {
  to: string;
  from?: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  replyTo?: string;
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export function createEmailService(deps: {
  db: Db;
  logger: Logger;
  config: EmailConfig;
  routes: EmailRoute[];
}) {
  const { db, logger, config, routes } = deps;

  // ─── Inbound: Route email to task ──────────────────────────────────────

  /**
   * Process an inbound email: match routes and create a task.
   * Returns the matched route and created task ID.
   */
  async function processInbound(email: InboundEmail): Promise<{
    matched: boolean;
    route?: EmailRoute;
    taskId?: string;
  }> {
    logger.info(
      { from: email.from, to: email.to, subject: email.subject },
      "Processing inbound email",
    );

    // Find matching route
    const route = matchRoute(email);
    if (!route) {
      logger.warn(
        { from: email.from, to: email.to },
        "No route matched for inbound email",
      );
      return { matched: false };
    }

    logger.info(
      { route: route.route, from: email.from, subject: email.subject },
      "Matched email route",
    );

    // Task creation will be handled by the issue service via the API.
    // Return the route match so the caller can create the task.
    return {
      matched: true,
      route,
    };
  }

  /**
   * Match an inbound email against configured routes.
   */
  function matchRoute(email: InboundEmail): EmailRoute | null {
    for (const route of routes) {
      if (!route.match) continue; // Skip default routes in first pass

      const matchTo = !route.match.to || email.to.includes(route.match.to);
      const matchFrom = !route.match.from || email.from.includes(route.match.from);
      const matchSubject =
        !route.match.subject ||
        email.subject.toLowerCase().includes(route.match.subject.toLowerCase());

      if (matchTo && matchFrom && matchSubject) {
        return route;
      }
    }

    // Fall through to default route
    const defaultRoute = routes.find((r) => !r.match);
    return defaultRoute ?? null;
  }

  // ─── Outbound: Send email ──────────────────────────────────────────────

  /**
   * Send an outbound email via the configured provider.
   */
  async function sendEmail(email: OutboundEmail): Promise<EmailSendResult> {
    if (config.mode === "managed") {
      return sendViaResend(email);
    }
    return sendViaSmtp(email);
  }

  /**
   * Send via Resend (managed mode).
   */
  async function sendViaResend(email: OutboundEmail): Promise<EmailSendResult> {
    const apiKey = config.managed?.resendApiKey ?? process.env.RESEND_API_KEY;
    if (!apiKey) {
      return { success: false, error: "RESEND_API_KEY not configured" };
    }

    const fromAddress =
      email.from ??
      config.managed?.fromAddress ??
      `${config.managed?.fromName ?? "Handrails"} <noreply@${config.managed?.fromDomain ?? "handrails.dev"}>`;

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: email.to,
          subject: email.subject,
          text: email.textBody,
          html: email.htmlBody,
          reply_to: email.replyTo,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        logger.error({ status: response.status, body }, "Resend API error");
        return { success: false, error: `Resend error ${response.status}: ${body}` };
      }

      const result = (await response.json()) as { id: string };
      logger.info({ messageId: result.id, to: email.to }, "Email sent via Resend");
      return { success: true, messageId: result.id };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err }, "Failed to send email via Resend");
      return { success: false, error: msg };
    }
  }

  /**
   * Send via SMTP (manual mode).
   * Uses a direct socket connection — no nodemailer dependency.
   */
  async function sendViaSmtp(email: OutboundEmail): Promise<EmailSendResult> {
    const smtpConfig = config.manual?.smtp;
    if (!smtpConfig) {
      return { success: false, error: "SMTP not configured" };
    }

    // For v1, we use a minimal SMTP implementation.
    // Production should use nodemailer or similar.
    logger.info(
      { to: email.to, host: smtpConfig.host },
      "SMTP send requested (full SMTP client available in v0.4)",
    );

    return {
      success: false,
      error: "SMTP client not yet implemented — use managed mode with Resend",
    };
  }

  // ─── Webhook handler for managed inbound ───────────────────────────────

  /**
   * Express middleware for the inbound email webhook (managed mode).
   * Cloudflare Email Workers POST to this endpoint.
   */
  function inboundWebhookHandler() {
    const webhookPath = config.managed?.inboundWebhookPath ?? "/webhooks/email/inbound";

    return async (req: { body: Record<string, unknown>; method: string; path: string }, res: { json: (data: unknown) => void; status: (code: number) => { json: (data: unknown) => void } }) => {
      if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      const { from, to, subject, text, html } = req.body as {
        from: string;
        to: string;
        subject: string;
        text: string;
        html?: string;
      };

      const result = await processInbound({
        from,
        to,
        subject,
        textBody: text,
        htmlBody: html,
        receivedAt: new Date(),
      });

      res.json(result);
    };
  }

  return {
    processInbound,
    sendEmail,
    matchRoute,
    inboundWebhookHandler,
  };
}

export type EmailService = ReturnType<typeof createEmailService>;
