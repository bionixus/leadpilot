import { decrypt, encrypt } from '@/lib/encryption';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export type OAuthAccount = {
  id: string;
  email_address: string;
  provider: string;
  oauth_access_token_encrypted: string | null;
  oauth_refresh_token_encrypted: string | null;
  oauth_token_expires_at: string | null;
};

/**
 * Get a valid OAuth access token, refreshing and persisting if needed.
 * Shared between IMAP and SMTP flows.
 */
export async function getValidOAuthToken(account: OAuthAccount): Promise<string> {
  const accessEnc = account.oauth_access_token_encrypted;
  const expiresAt = account.oauth_token_expires_at;

  // Check if we have a valid (non-expired) token
  if (accessEnc) {
    const now = new Date();
    const expires = expiresAt ? new Date(expiresAt) : null;
    // Add 60s buffer before expiry
    if (!expires || expires > new Date(now.getTime() + 60_000)) {
      try {
        return decrypt(accessEnc);
      } catch {
        // Decryption failed, fall through to refresh
      }
    }
  }

  // Need to refresh
  return refreshAndPersistToken(account);
}

/**
 * Refresh the OAuth token via the provider's token endpoint,
 * then persist the new access token + expiry back to the DB.
 */
async function refreshAndPersistToken(account: OAuthAccount): Promise<string> {
  const refreshEnc = account.oauth_refresh_token_encrypted;
  if (!refreshEnc) throw new Error('No refresh token available');

  const refreshToken = decrypt(refreshEnc);

  const clientId =
    account.provider === 'gmail'
      ? process.env.GOOGLE_CLIENT_ID
      : process.env.MICROSOFT_CLIENT_ID;
  const clientSecret =
    account.provider === 'gmail'
      ? process.env.GOOGLE_CLIENT_SECRET
      : process.env.MICROSOFT_CLIENT_SECRET;

  if (!clientId || !clientSecret) throw new Error('OAuth not configured');

  const tokenUrl =
    account.provider === 'gmail'
      ? 'https://oauth2.googleapis.com/token'
      : 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Token refresh failed: ${errText}`);
  }

  const tokens = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  const accessToken = tokens.access_token;
  if (!accessToken) throw new Error('No access token in refresh response');

  // Persist refreshed token back to DB
  const expiresAtIso = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;

  const supabase = createSupabaseAdminClient();
  await supabase
    .from('email_accounts')
    .update({
      oauth_access_token_encrypted: encrypt(accessToken),
      oauth_token_expires_at: expiresAtIso,
    } as never)
    .eq('id', account.id);

  return accessToken;
}
