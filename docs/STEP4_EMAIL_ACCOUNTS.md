# Step 4: Email Accounts — Encryption, Page, OAuth & Custom SMTP

Follow these steps in order. You will add an **encryption** lib for credentials, the **Email Accounts** page, **Gmail/Outlook OAuth** connect flow, **custom IMAP/SMTP** form, **connection test**, and **disconnect**.

**Existing API:**

- `GET /api/email-accounts` — list accounts for org (returns full rows; you will stop returning decrypted fields)
- `POST /api/email-accounts` — create (currently raw body; you will encrypt before insert)
- `POST /api/email-accounts/[id]/test` — stub (“implementation pending”)
- `POST /api/email-accounts/[id]/sync` — stub (“implementation pending”)

**Missing:** Encryption of credentials/tokens, OAuth callback for “connect email”, DELETE account, and real test/sync logic.

**Schema reminder:** `provider` in (`gmail` | `outlook` | `custom`). OAuth: `oauth_access_token_encrypted`, `oauth_refresh_token_encrypted`, `oauth_token_expires_at`. Custom: `imap_host`, `imap_port`, `smtp_host`, `smtp_port`, `credentials_encrypted` (JSON `{ username, password }`).

---

## Part A: Encryption

### Step 4.1 — Encryption key and env

- **Env:** `ENCRYPTION_KEY` — 32-byte key, base64 (e.g. `openssl rand -base64 32`). Already in `env.example`.
- Ensure `.env.local` has `ENCRYPTION_KEY` set. Use the same key in dev and prod for a given deployment (rotating keys would require re-encrypting all stored credentials).

---

### Step 4.2 — Create encryption lib

- **File:** `src/lib/encryption/index.ts` (or `encrypt.ts` + `decrypt.ts` in the same folder).
- **API:**
  - `encrypt(plaintext: string): string` — encrypt with `ENCRYPTION_KEY`, return a string you can store (e.g. base64 of iv + ciphertext, or “algorithm:iv:ciphertext”).
  - `decrypt(ciphertext: string): string` — reverse of encrypt; throw if key missing or decryption fails.
- **Implementation:** Use Node `crypto`: e.g. `createCipheriv` / `createDecipheriv` with **AES-256-GCM** (or AES-256-CBC + HMAC). Key: decode base64 `ENCRYPTION_KEY` to Buffer; use a random IV per encrypt and prepend it to the ciphertext so decrypt can read it back.
- **Security:** Never log decrypted values. Only call decrypt on the server (API routes or server actions). Do not expose encryption helpers to the client.

---

### Step 4.3 — Use encryption in API (write path)

When **creating or updating** an email account:

- **OAuth:** Before storing, encrypt `access_token` and `refresh_token` and save to `oauth_access_token_encrypted` and `oauth_refresh_token_encrypted`. Store `expires_at` (or equivalent) in `oauth_token_expires_at`.
- **Custom:** Before storing, build `{ username, password }`, encrypt the JSON string, save to `credentials_encrypted`. Never store plain password in any other field.

So: in `POST /api/email-accounts` (and any future PATCH for email accounts), if the body contains tokens or credentials, encrypt them and then insert/update. Do not persist plain tokens or passwords.

---

### Step 4.4 — Never return decrypted secrets

- **GET /api/email-accounts:** Return only fields that are safe to show in the UI: `id`, `org_id`, `email_address`, `display_name`, `provider`, `connection_status`, `last_error`, `last_synced_at`, `daily_send_limit`, `emails_sent_today`, `warmup_enabled`, `is_active`, `created_at`, etc. Do **not** include `oauth_access_token_encrypted`, `oauth_refresh_token_encrypted`, or `credentials_encrypted` in the response (or return them as `null` / omit).
- If you add a “single account” GET (e.g. for settings), same rule: no decrypted or raw encrypted secrets to the client.

---

## Part B: Email Accounts Page

### Step 4.5 — Page and list

- **File:** `app/(dashboard)/email-accounts/page.tsx`
- **Behavior:**
  - Server component. Set `metadata = { title: 'Email Accounts | LeadPilot' }`.
  - Fetch list: `GET /api/email-accounts` (or server-side Supabase with select that omits encrypted columns).
  - Show: “Connect account” (or “Add account”) and a list of connected accounts (card or table): email, provider, status, last synced, actions (Test, Sync, Disconnect).

---

### Step 4.6 — “Connect account” choice

- **UI:** Buttons or cards: “Connect Gmail”, “Connect Outlook”, “Add custom IMAP/SMTP”.
- **Gmail / Outlook:** Click starts the OAuth “connect” flow (Step 4.8).
- **Custom:** Click opens the custom form (Step 4.10).

---

## Part C: OAuth Connect (Gmail & Outlook)

### Step 4.7 — OAuth URLs and Supabase (optional) vs direct

You have two options:

**A) Use Supabase Auth with provider**  
- If you already use Supabase for Google/Microsoft sign-in, you can start a second OAuth flow “for email” with a different redirect (e.g. `/api/auth/callback/email-google`) and scope (Gmail API / Microsoft Graph mail scopes). After redirect, read the session/tokens from Supabase and create an `email_accounts` row. This depends on Supabase exposing refresh/access tokens for the provider.

**B) Direct OAuth (recommended for full control)**  
- Implement the OAuth 2.0 flow yourself: redirect to Google/Microsoft with scopes for mail (e.g. Gmail: `https://www.googleapis.com/auth/gmail.send`, `gmail.readonly`; Microsoft: Mail.Read, Mail.Send, etc.). Use `state` to remember “connecting email” and optionally `org_id` / `user_id`. Redirect URI: e.g. `https://yourapp.com/api/auth/callback/email-google` and `.../email-microsoft`. On callback, exchange `code` for tokens, encrypt them, then insert into `email_accounts` with `provider: 'gmail'` or `'outlook'`, `email_address` from the token response or a follow-up profile call.

For the step-by-step we assume **B**: your own callback routes and token exchange.

---

### Step 4.8 — “Connect Gmail” / “Connect Outlook” (start OAuth)

- **Gmail:** Build auth URL (Google OAuth 2.0): `client_id`, `redirect_uri` = `{NEXT_PUBLIC_APP_URL}/api/auth/callback/email-google`, `response_type=code`, `scope` = Gmail scopes (e.g. `https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly`), `access_type=offline`, `prompt=consent`, `state` = optional (e.g. base64 of `{ type: 'email_connect', provider: 'gmail' }`). Redirect the user to this URL.
- **Outlook:** Same idea with Microsoft: `client_id`, `redirect_uri` = `.../api/auth/callback/email-microsoft`, `response_type=code`, `scope` = Mail.Read, Mail.Send, etc., `state` optional.
- **Where:** Either an API route (e.g. `GET /api/auth/connect/google`) that builds the URL and returns `NextResponse.redirect(url)`, or a server action. The “Connect Gmail” button then links to `/api/auth/connect/google` (or similar).

---

### Step 4.9 — OAuth callback: create email account

- **Files:**  
  - `app/api/auth/callback/email-google/route.ts`  
  - `app/api/auth/callback/email-microsoft/route.ts`
- **Behavior (same idea for both):**
  1. Read `code` and `state` from the query string. If no `code`, redirect to email-accounts page with error.
  2. Exchange `code` for tokens (POST to Google/Microsoft token endpoint with `client_id`, `client_secret`, `code`, `redirect_uri`, `grant_type=authorization_code`).
  3. Get access_token and refresh_token. Optionally get email from userinfo (Google) or Microsoft Graph “me” (email).
  4. Get current user and `org_id` (from `users` by session). Ensure user is logged in.
  5. Encrypt access_token and refresh_token (Step 4.2). Compute `oauth_token_expires_at` from `expires_in` if provided.
  6. Insert into `email_accounts`: `org_id`, `user_id` (optional), `email_address`, `provider` = `gmail` or `outlook`, `oauth_access_token_encrypted`, `oauth_refresh_token_encrypted`, `oauth_token_expires_at`, `connection_status` = `'connected'` (or run a quick test and set `'connected'` / `'error'`).
  7. Redirect to `/email-accounts` with success (e.g. `?connected=1`) or error in query.

**Duplicate:** Schema has `UNIQUE(org_id, email_address)`. If the user reconnects the same email, use upsert or update the existing row (refresh tokens) instead of failing.

---

## Part D: Custom IMAP/SMTP

### Step 4.10 — Custom account form (client)

- **Fields:**
  - Email address (the “from” address)
  - Display name (optional)
  - IMAP: host, port (default 993), secure (default true)
  - SMTP: host, port (default 587), secure (default true)
  - Username (often same as email)
  - Password (never show after save; only for initial connect)
- **Submit:** POST to an API that accepts these and creates an account with `provider: 'custom'`, encrypts `{ username, password }` into `credentials_encrypted`, and stores host/port/secure. Either extend `POST /api/email-accounts` to accept this shape or add a dedicated route (e.g. `POST /api/email-accounts/custom`). Same encryption and “no secrets in GET” rules apply.

---

### Step 4.11 — Validate and test on create (optional)

- After inserting a custom account, optionally call the same “test” logic (Step 4.12) and set `connection_status` and `last_error` based on the result. If test fails, you can still insert but with `connection_status: 'error'` and `last_error: message`.

---

## Part E: Test Connection & Sync

### Step 4.12 — Implement connection test

- **File:** `app/api/email-accounts/[id]/test/route.ts`
- **Behavior:**
  1. Load the email account by `id` (and ensure it belongs to the org via RLS or explicit check).
  2. If **OAuth:** Decrypt tokens; if refresh_token and expired access_token, refresh the token (call Google/Microsoft token endpoint with `grant_type=refresh_token`), then test (e.g. send a test message or list inbox). Optionally update stored tokens if refreshed.
  3. If **custom:** Decrypt `credentials_encrypted`, then use nodemailer (SMTP) or IMAP to connect and optionally send a test email or list one folder. Use the account’s `smtp_host`, `smtp_port`, etc.
  4. Return `{ ok: true }` or `{ ok: false, error: '...' }`. Optionally update `connection_status` and `last_error` on the account.

---

### Step 4.13 — Sync (stub or Trigger)

- **File:** `app/api/email-accounts/[id]/sync/route.ts`
- For now you can keep “Sync triggered (implementation pending)” or trigger a Trigger.dev job that will later do IMAP sync (Step 6). Optionally set `last_synced_at` when the job is queued. Full IMAP sync implementation belongs in the Inbox step.

---

## Part F: Disconnect (Delete)

### Step 4.14 — DELETE email account

- **File:** `app/api/email-accounts/[id]/route.ts`
- **Behavior:** Add **DELETE** handler. Get account by `id`; ensure it belongs to the current user’s org (RLS will enforce if you use the same Supabase client). Delete the row. Return 204 or `{ success: true }`.
- **UI:** On the Email Accounts page, “Disconnect” (or “Remove”) button that calls `DELETE /api/email-accounts/[id]` with confirmation, then refresh the list.

---

## Part G: PATCH account (optional)

### Step 4.15 — Update account (display name, limits, active)

- **File:** Same `app/api/email-accounts/[id]/route.ts`. Add **PATCH**.
- **Allowed fields:** e.g. `display_name`, `daily_send_limit`, `warmup_enabled`, `is_active`. Do **not** allow updating encrypted fields via PATCH with plain text; if you need to refresh OAuth tokens, do it in the test or a dedicated “reconnect” flow.
- **UI:** Optional “Edit” on the card to change display name or daily limit.

---

## Checklist (summary)

- [ ] **4.1** `ENCRYPTION_KEY` set in env; 32-byte base64.
- [ ] **4.2** `src/lib/encryption` — `encrypt(plaintext)` and `decrypt(ciphertext)`; AES-256-GCM or equivalent; server-only.
- [ ] **4.3** On create/update email account, encrypt OAuth tokens and custom credentials before saving.
- [ ] **4.4** GET email accounts: do not return encrypted columns (or return null).
- [ ] **4.5** `app/(dashboard)/email-accounts/page.tsx` — list accounts, “Connect account”.
- [ ] **4.6** UI: Connect Gmail / Connect Outlook / Custom IMAP-SMTP.
- [ ] **4.7** Decide: Supabase provider vs direct OAuth; implement direct (recommended).
- [ ] **4.8** Start OAuth: `/api/auth/connect/google` and `/api/auth/connect/microsoft` (or similar) redirect to provider with mail scopes.
- [ ] **4.9** Callbacks: exchange code → tokens → encrypt → insert (or update) `email_accounts` → redirect to `/email-accounts`.
- [ ] **4.10** Custom form: IMAP/SMTP + username/password; POST creates account with encrypted credentials.
- [ ] **4.11** (Optional) After custom insert, run test and set connection_status.
- [ ] **4.12** Implement test: decrypt, then SMTP/IMAP or OAuth send; return ok/error; optionally update connection_status.
- [ ] **4.13** Sync: keep stub or enqueue Trigger job; optional last_synced_at.
- [ ] **4.14** DELETE `/api/email-accounts/[id]`; “Disconnect” button with confirm.
- [ ] **4.15** (Optional) PATCH for display_name, limits, is_active.

After this, users can connect Gmail, Outlook, or custom SMTP; credentials are encrypted; and they can test, sync (stub), and disconnect.
