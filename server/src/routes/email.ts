/**
 * Email API routes.
 * Webhook for inbound email and endpoint for outbound sends.
 */

import { Router } from "express";
import type { Db } from "@handrailsai/db";
import type { EmailService } from "../services/email.js";

export function emailRoutes(db: Db, emailService: EmailService) {
  const router = Router();

  // Inbound email webhook (Cloudflare Email Workers → Handrails)
  router.post("/webhooks/email/inbound", async (req, res) => {
    const { from, to, subject, text, html } = req.body as {
      from: string;
      to: string;
      subject: string;
      text: string;
      html?: string;
    };

    if (!from || !to || !subject) {
      res.status(400).json({ error: "from, to, and subject are required" });
      return;
    }

    const result = await emailService.processInbound({
      from,
      to,
      subject,
      textBody: text ?? "",
      htmlBody: html,
      receivedAt: new Date(),
    });

    res.json(result);
  });

  // Send outbound email (agent tool action)
  router.post("/companies/:companyId/email/send", async (req, res) => {
    const { to, subject, textBody, htmlBody, replyTo } = req.body as {
      to: string;
      subject: string;
      textBody: string;
      htmlBody?: string;
      replyTo?: string;
    };

    if (!to || !subject || !textBody) {
      res.status(400).json({ error: "to, subject, and textBody are required" });
      return;
    }

    const result = await emailService.sendEmail({
      to,
      subject,
      textBody,
      htmlBody,
      replyTo,
    });

    if (!result.success) {
      res.status(500).json(result);
      return;
    }

    res.json(result);
  });

  return router;
}
