import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getServerConfig } from "../config.server";

// Calls OpenRouter directly (not through the n8n pipeline) so rewriting a
// single field stays fast and doesn't share the multi-minute timeout
// budget — or the tunnel — that the full strategy generation calls use.

const SYSTEM_PROMPT =
  "You are a precise editor, not a copywriter. Rewrite the given text to improve clarity, flow, and " +
  "phrasing only. Every specific fact, number, name, and claim in the original must survive with the " +
  "same meaning — do not add, remove, soften, or generalize any of them. A specific claim must not " +
  "become a generic one. Keep roughly the same length. Return ONLY the rewritten text: no preamble, " +
  "no quotation marks, no explanation.";

export const rewriteField = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      fieldLabel: z.string(),
      currentText: z.string().min(1),
      companyName: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const config = getServerConfig();
    if (!config.openrouterApiKey) {
      throw new Error("Missing OPENROUTER_API_KEY server env var");
    }

    const userPrompt =
      `Field: ${data.fieldLabel}` +
      (data.companyName ? ` (company: ${data.companyName})` : "") +
      `\n\nText to rewrite:\n${data.currentText}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.openrouterApiKey}`,
        },
        body: JSON.stringify({
          model: "deepseek/deepseek-v4-flash",
          temperature: 0.3,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`OpenRouter rewrite failed (${res.status}): ${text.slice(0, 300)}`);
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const rewritten = json.choices?.[0]?.message?.content?.trim();
      if (!rewritten) {
        throw new Error("OpenRouter returned no content");
      }
      return { rewritten };
    } finally {
      clearTimeout(timer);
    }
  });
