import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { z } from "zod";

import { getServerConfig } from "../config.server";

// Persists waitlist signups to Supabase, so they're actually visible
// somewhere — the old version only ever wrote to the visitor's own
// browser localStorage.

async function notifyWaitlistSignup(email: string) {
  const config = getServerConfig();
  if (!config.resendApiKey || !config.waitlistNotifyEmail) return;

  const resend = new Resend(config.resendApiKey);
  const { error } = await resend.emails.send({
    from: "PositionPilot Waitlist <waitlist@aayushiagratha.com>",
    to: config.waitlistNotifyEmail,
    subject: "New PositionPilot waitlist signup",
    text: `${email} just joined the waitlist.`,
  });

  // Notification failure shouldn't fail the signup — the row is already
  // saved in Supabase, so just log it for follow-up.
  if (error) {
    console.error("Failed to send waitlist notification email:", error);
  }
}

async function confirmWaitlistSignup(email: string) {
  const config = getServerConfig();
  if (!config.resendApiKey) return;

  const resend = new Resend(config.resendApiKey);
  const { error } = await resend.emails.send({
    from: "PositionPilot <waitlist@aayushiagratha.com>",
    to: email,
    subject: "You're on the PositionPilot waitlist",
    text: "Thanks for joining the PositionPilot waitlist. We'll email you as soon as you're invited in.",
  });

  // Same as above — the signup already succeeded, so log and move on.
  if (error) {
    console.error("Failed to send waitlist confirmation email:", error);
  }
}

export const joinWaitlist = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: z.string().email() }))
  .handler(async ({ data }) => {
    const config = getServerConfig();
    if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
      throw new Error("Waitlist storage isn't configured (missing Supabase server env vars)");
    }

    const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);
    const { error } = await supabase.from("waitlist").insert({ email: data.email });

    if (error) {
      if (error.code === "23505") {
        // unique_violation — already on the list, treat as success
        return { alreadyJoined: true };
      }
      throw new Error(`Failed to save waitlist signup: ${error.message}`);
    }

    await Promise.all([notifyWaitlistSignup(data.email), confirmWaitlistSignup(data.email)]);

    return { alreadyJoined: false };
  });
