# Step 1: Auth & Settings — What to Do, Step by Step

Follow these steps in order. Each step builds on the previous one.

---

## Part A: Supabase setup (do this first)

### Step 1.1 — Enable Auth in Supabase

1. Open your project in the [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to **Authentication** → **Providers**.
3. **Email**: Enable “Email” and turn on “Confirm email” if you want (for production you’ll need a custom SMTP or use Supabase’s limits).
4. For **Google** (optional): Enable it, paste `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from your Google Cloud OAuth credentials. Add redirect URL:
   - Dev: `http://localhost:3000/api/auth/callback`
   - Prod: `https://yourdomain.com/api/auth/callback`
5. For **Microsoft** (optional): Same idea under “Microsoft” — use `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET`, same redirect URL pattern.
6. Go to **Authentication** → **URL Configuration**:
   - **Site URL**: `http://localhost:3000` (dev) or your production URL.
   - **Redirect URLs**: Add `http://localhost:3000/api/auth/callback` and your production callback URL.

---

### Step 1.2 — Create the auth callback route

When a user signs in (email or OAuth), Supabase redirects to your app. You must:

1. Exchange the code for a session (Supabase does this when you use the callback URL with the code).
2. Ensure a row exists in `public.users` and that the user has an `org_id` (create org + user if first time).

**What to build:**

- **File:** `app/api/auth/callback/route.ts`
- **Behavior:**
  - Read the request URL (Next.js passes it). Supabase redirects to something like `/api/auth/callback?code=...` (or with hash for PKCE).
  - Use the Supabase client to exchange the code for a session (e.g. `supabase.auth.exchangeCodeForSession(code)` if using code flow). For cookie-based SSR you use the same `createServerClient` pattern as in your middleware and call `getUser()` after the redirect; the Supabase client will handle the code exchange when you have the callback URL and cookies set up.
  - After you have the authenticated user (auth.uid()):
    - Select from `users` where `auth_id = user.id`.
    - If no row: create an **organization** (name e.g. “My Organization”, slug from name), then create a **user** row with that `org_id`, `auth_id`, `email`, `full_name` (from auth metadata if available), role `owner`.
    - Redirect to `/` (dashboard).

**Important:** Use the **server** Supabase client (same as in `createServerSupabaseClient`) so cookies are set. Next.js 14 App Router callback example pattern: in the route, get `searchParams.get('code')`, then use `createServerClient` with cookie read/write and call `exchangeCodeForSession(code)`. Then run the “ensure user + org” logic and `redirect('/')`.

If you use **implicit** or **PKCE** flow and Supabase redirects with hash fragments, the client might need to handle the callback (e.g. a small client component on a page that reads the hash and calls `supabase.auth.getSession()` / `setSession`). Prefer the **server callback** with **code** flow so everything stays in one place.

---

### Step 1.3 — Login page: form + OAuth buttons

**File:** `app/(auth)/login/page.tsx`

1. **Redirect if already logged in**  
   In a server component or in the page, call `createServerSupabaseClient()` and `getUser()`. If `user` exists, `redirect('/')`.

2. **Email + password form**  
   - Inputs: email, password.  
   - Submit: call `supabase.auth.signInWithPassword({ email, password })`. Use a client component (e.g. “LoginForm”) so you can call Supabase from the browser, or use a Server Action that creates a Supabase client and calls `signInWithPassword` and then redirects.  
   - On success: redirect to `/` (or let the callback handle it if you use magic link / code flow).  
   - Show errors (e.g. “Invalid login”) from Supabase.

3. **Sign up link**  
   - Add a link to “Sign up” that goes to `/signup` (or show a sign-up form on the same page). Sign up = `supabase.auth.signUp({ email, password })`. After sign-up, same “ensure user + org” logic is needed — either in the same callback or in a small middleware/check on first load after sign-up.

4. **OAuth buttons (optional)**  
   - “Continue with Google” / “Continue with Microsoft”: call `supabase.auth.signInWithOAuth({ provider: 'google' })` (or `microsoft`). Supabase will redirect to the provider; after login, provider redirects to your **Redirect URL** (e.g. `.../api/auth/callback?...`). Your callback from Step 1.2 then runs and creates user + org if needed.

Use a **client component** for the form and OAuth buttons (they need `onClick` / `onSubmit` and browser-side Supabase). Keep the page itself as server component that does the “if logged in → redirect” check.

---

### Step 1.4 — Signup page (or combined with login)

**Option A — Separate signup page**

- **File:** `app/(auth)/signup/page.tsx`
- Same as login: redirect if already logged in.
- Form: email, password (and maybe “Full name”). Submit = `supabase.auth.signUp({ email, password, options: { data: { full_name: '...' } } })`.
- After sign-up, Supabase may require email confirmation. Until then you might show “Check your email”. When the user clicks the confirmation link, they’re sent to your app — then your **callback** (Step 1.2) must run so that when they land (e.g. with a session), you create org + user if not present.

**Option B — One page with “Sign in” / “Sign up” tabs**

- Single page with two forms; same logic as above for each.

**Important:** Wherever the user first gets a valid session (email confirm link, OAuth redirect, or immediate after sign-up if you don’t require confirm), your **callback** or a **middleware/layout check** must ensure `users` row and `org_id` exist. Centralizing this in the callback is simplest.

---

### Step 1.5 — Ensure “user + org” in one place

You need exactly one place that runs after any successful auth and creates org + user if missing.

- **Recommended:** In `app/api/auth/callback/route.ts` after you have the session:
  1. Get `user` from `supabase.auth.getUser()` (or from the session you just set).
  2. Query `users` where `auth_id = user.id`.
  3. If no row:
     - Insert into `organizations`: `name = 'My Organization'` (or from user metadata), `slug = slugify(name)` (e.g. `my-organization`), other fields default.
     - Insert into `users`: `org_id = newOrg.id`, `auth_id = user.id`, `email = user.email`, `full_name = user.user_metadata?.full_name ?? null`, `role = 'owner'`.
  4. Redirect to `/`.

- For **email/password sign-in** (no redirect to callback): run the same “ensure user + org” logic either:
  - In a Server Action after `signInWithPassword` (create server Supabase client, get user, upsert org + user), or
  - By redirecting to a dedicated “onboarding” or “callback” URL that runs this logic and then redirects to `/`.

So: **Step 1.2** is the main place for OAuth; add the same “ensure user + org” for email sign-in (either in callback or in the flow that runs right after sign-in).

---

## Part B: Settings page

### Step 1.6 — Settings route and layout

- **File:** `app/(dashboard)/settings/page.tsx`
- This page is under the dashboard layout (sidebar, auth required). So the user is already logged in and has `org_id` from the layout’s `users` query.

---

### Step 1.7 — Load current org and business context

In `app/(dashboard)/settings/page.tsx` (server component):

1. Get `createServerSupabaseClient()` and current user.
2. Get `userRow` from `users` where `auth_id = user.id` (select `org_id`).
3. Get organization: `organizations` where `id = userRow.org_id` (select `name`, `slug`, `business_context`, `settings`).
4. Pass `organization` (and maybe `user`) as props to the client component that will render the form and handle submit.

---

### Step 1.8 — Settings form (client component)

Create a client component, e.g. `SettingsForm` or `OrganizationForm`:

1. **Organization name**
   - Input bound to `name`. On submit, PATCH the organization (e.g. `name`, optionally `slug` if you allow editing).

2. **Business context** (for AI sequences)
   - Fields matching your schema and `data/business-context-bionixus.json`:
     - Company name, industry, target audience, value proposition, tone (dropdown: professional / casual / formal), key pain points (list or comma-separated), case studies (list or text), CTA, sender name, sender title.
   - Store as JSON in `organizations.business_context`. On submit, PATCH `organizations` with the new `business_context` object.

3. **Submit**
   - Call an API route (e.g. `PATCH /api/organizations/current` or `PATCH /api/organizations/[id]`) or use a Server Action that uses the server Supabase client to update the org. Only allow updating the org for the current user’s `org_id` (RLS will enforce this if you use the anon key and the user is in that org).

---

### Step 1.9 — API or Server Action to update organization

**Option A — API route**

- **File:** e.g. `app/api/organizations/current/route.ts` (or `app/api/organizations/[id]/route.ts`).
- GET: return current user’s org (name, slug, business_context, settings).
- PATCH: body `{ name?, slug?, business_context?, settings? }`. Resolve current user’s `org_id`, then `supabase.from('organizations').update(...).eq('id', org_id).select().single()`. Return updated org.

**Option B — Server Action**

- In a file like `app/(dashboard)/settings/actions.ts`, define an action that takes the form fields, gets the server Supabase client and current user, gets `org_id`, updates `organizations`, and revalidates or redirects.

Use either Option A or B so the Settings form can save.

---

## Part C: Small fixes and checks

### Step 1.10 — Redirect after sign-out

- **File:** `app/api/auth/signout/route.ts`
- After `supabase.auth.signOut()`, redirect to `/login` using a **relative** redirect so it works in dev and prod:
  - e.g. `NextResponse.redirect(new URL('/login', request.url))` if you have access to `request`, or keep using `NEXT_PUBLIC_APP_URL` but ensure `.env.local` has `NEXT_PUBLIC_APP_URL=http://localhost:3000` in dev.

---

### Step 1.11 — Handle “logged in but no user row”

If someone has a Supabase auth session but no row in `users` (e.g. old user, or bug), the dashboard layout will load and `userData` will be null. You can:

- In the dashboard layout, if `user` exists but `userData` is null, redirect to a small “onboarding” page that runs the “create org + user” logic (same as callback), then redirect to `/`.

This avoids showing a broken sidebar with “User” and no org.

---

## Checklist (summary)

- [ ] **1.1** Supabase: Email (and optionally Google/Microsoft) enabled; redirect URLs set.
- [ ] **1.2** `app/api/auth/callback/route.ts`: exchange code for session; ensure user + org; redirect to `/`.
- [ ] **1.3** Login page: redirect if logged in; email/password form; optional OAuth buttons.
- [ ] **1.4** Signup page or sign-up form; after first session, ensure user + org (callback or post-sign-in).
- [ ] **1.5** Single place that creates org + user when missing (callback + same logic for email sign-in if needed).
- [ ] **1.6** `app/(dashboard)/settings/page.tsx` created.
- [ ] **1.7** Settings page loads current org and business context (server).
- [ ] **1.8** Settings form: org name + business context fields; client component; submit updates org.
- [ ] **1.9** PATCH org API or Server Action for settings save.
- [ ] **1.10** Sign-out redirect works in dev (relative or correct `NEXT_PUBLIC_APP_URL`).
- [ ] **1.11** If user has session but no `users` row, redirect to onboarding or run ensure-user-or-org then `/`.

After this, you have working login/signup, OAuth (if configured), and a Settings page where each org can set its name and business context for AI sequences.
