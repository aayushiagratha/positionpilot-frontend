import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getServerConfig } from "../config.server";

// Proxies calls to the n8n backend server-side so the webhook URLs and the
// x-api-key never ship to the browser. The client only ever talks to this
// server function; it never sees the real n8n webhook address or key.

const STAGE_KEYS = ["stage1", "approve", "stage2"] as const;

export const callPositionPilotWebhook = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      stage: z.enum(STAGE_KEYS),
      payload: z.unknown(),
      timeoutMs: z.number().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const config = getServerConfig();
    const urlByStage: Record<(typeof STAGE_KEYS)[number], string | undefined> = {
      stage1: config.stage1Url,
      approve: config.approveUrl,
      stage2: config.stage2Url,
    };
    const url = urlByStage[data.stage];
    if (!url) {
      throw new Error(`Missing backend URL for stage "${data.stage}" (check server env vars)`);
    }
    if (!config.webhookApiKey) {
      throw new Error("Missing POSITIONPILOT_WEBHOOK_API_KEY server env var");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), data.timeoutMs ?? 300_000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.webhookApiKey,
        },
        body: JSON.stringify(data.payload),
        signal: controller.signal,
      });
      const text = await res.text();
      return {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        text,
      };
    } finally {
      clearTimeout(timer);
    }
  });
