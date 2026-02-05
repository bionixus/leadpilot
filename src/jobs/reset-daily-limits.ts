import { schedules } from "@trigger.dev/sdk/v3";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Daily reset job - runs at midnight UTC.
 *
 * Resets emails_sent_today to 0 for all email accounts.
 * Also increments warmup_day for accounts with warmup_enabled.
 */
export const resetDailyLimitsTask = schedules.task({
  id: "reset-daily-limits",
  cron: "0 0 * * *", // Midnight UTC daily
  run: async () => {
    const supabase = createSupabaseAdminClient();

    // Reset emails_sent_today for all accounts
    const { error: resetError } = await supabase
      .from("email_accounts")
      .update({ emails_sent_today: 0 } as never)
      .gt("emails_sent_today", 0);

    if (resetError) {
      console.error("Failed to reset emails_sent_today:", resetError);
    }

    // Increment warmup_day for accounts with warmup enabled
    // Using raw SQL since Supabase JS doesn't support increment easily
    const { error: warmupError } = await supabase.rpc("increment_warmup_day");

    if (warmupError) {
      console.error("Failed to increment warmup_day:", warmupError);
    }

    return {
      message: "Daily limits reset completed",
      resetError: resetError?.message,
      warmupError: warmupError?.message,
    };
  },
});
