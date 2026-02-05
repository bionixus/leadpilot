-- RPC function to increment emails_sent_today atomically
CREATE OR REPLACE FUNCTION increment_emails_sent_today(account_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE email_accounts
  SET emails_sent_today = emails_sent_today + 1,
      updated_at = NOW()
  WHERE id = account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function to increment warmup_day for all warmup-enabled accounts
CREATE OR REPLACE FUNCTION increment_warmup_day()
RETURNS void AS $$
BEGIN
  UPDATE email_accounts
  SET warmup_day = warmup_day + 1,
      updated_at = NOW()
  WHERE warmup_enabled = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION increment_emails_sent_today(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_warmup_day() TO service_role;
