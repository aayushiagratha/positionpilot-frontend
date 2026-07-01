import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getServerConfig } from "../config.server";

// Persists waitlist signups to Supabase, so they're actually visible
// somewhere — the old version only ever wrote to the visitor's own
// browser localStorage.

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

    return { alreadyJoined: false };
  });
