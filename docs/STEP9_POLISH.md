# Step 9: Polish — Analytics Dashboard, Billing & Final Touches

This final step covers **analytics** (charts and dashboards), **billing** (Stripe subscriptions), and general **polish** (onboarding, error handling, performance, documentation). These are lower priority but complete the product.

---

## Part A: Analytics Dashboard

### Step 9.1 — Dashboard overview page

- **File:** `app/(dashboard)/analytics/page.tsx` or enhance the home page `/` (currently campaigns list).
- **Option A — Dedicated analytics page:** Add `/analytics` to sidebar; show org-wide stats and charts.
- **Option B — Dashboard home:** Replace or augment `/` with an overview: key metrics at top, recent campaigns below, and a link to full analytics.

---

### Step 9.2 — Key metrics to display

| Metric | Source | Description |
|--------|--------|-------------|
| **Total leads** | `COUNT(leads)` for org | All-time leads |
| **Active campaigns** | `COUNT(campaigns) WHERE status = 'active'` | Currently running |
| **Emails sent** | `SUM(campaigns.stats->>'emails_sent')` or `COUNT(emails) WHERE status = 'sent'` | Total sent |
| **Reply rate** | `replies / emails_sent * 100` | Overall reply rate |
| **Positive replies** | `COUNT(leads) WHERE status = 'interested'` | Leads marked interested |
| **Sequences generated** | `COUNT(sequences)` | AI sequences created |

---

### Step 9.3 — Charts with Recharts

- **Dependency:** `recharts` is already in `package.json`.
- **Charts to add:**
  1. **Emails over time:** Line or bar chart of emails sent per day/week (query `emails` grouped by `DATE(sent_at)`).
  2. **Replies over time:** Line chart of inbound replies per day.
  3. **Lead status breakdown:** Pie or bar chart of leads by status (new, contacted, replied, interested, etc.).
  4. **Campaign performance:** Bar chart comparing campaigns by reply rate or emails sent.
- **Implementation:**
  - Server component fetches aggregated data (or create an API route e.g. `GET /api/analytics` that returns pre-aggregated stats).
  - Pass data to a client component that renders `<LineChart>`, `<BarChart>`, `<PieChart>` from Recharts.

---

### Step 9.4 — Campaign-level analytics

- On **campaign detail** (`/campaigns/[id]`), show stats specific to that campaign:
  - Leads count, emails sent, opened, replied, positive replies (from `campaigns.stats` JSON or computed).
  - Funnel: Leads → Contacted → Replied → Interested → Converted.
  - Optional: timeline chart of sends and replies for this campaign.

---

### Step 9.5 — Exportable reports (optional)

- Add "Export CSV" on analytics or leads page: query data and return as CSV download.
- Use `papaparse` (already in deps) to generate CSV on the server or client.

---

## Part B: Billing with Stripe

### Step 9.6 — Stripe setup

1. **Create Stripe account** at [stripe.com](https://stripe.com).
2. **Add env vars:**
   - `STRIPE_SECRET_KEY` — from Stripe dashboard (API keys).
   - `STRIPE_WEBHOOK_SECRET` — from webhook settings.
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — for client-side Stripe.js.
3. **Install SDK:** `pnpm add stripe` (server) and optionally `@stripe/stripe-js` (client).

---

### Step 9.7 — Subscription tiers

Define tiers in Stripe (Products → Add product):

| Tier | Price | Limits (example) |
|------|-------|------------------|
| **Free** | $0 | 1 email account, 100 leads, 50 emails/month |
| **Pro** | $49/mo | 5 email accounts, 5,000 leads, unlimited emails |
| **Enterprise** | Custom | Unlimited, priority support |

Store the Stripe **Price ID** for each tier. In `organizations`, the schema has `subscription_tier` and `subscription_status` — use these to track the current plan.

---

### Step 9.8 — Checkout flow

- **API:** `POST /api/billing/checkout` — create a Stripe Checkout Session for the selected tier. Return the session URL.
  - Use `stripe.checkout.sessions.create({ mode: 'subscription', line_items: [{ price: priceId, quantity: 1 }], success_url, cancel_url, client_reference_id: org_id, customer_email: user.email })`.
- **UI:** On Settings or a dedicated Billing page, show current tier and "Upgrade" button. On click, POST to checkout, then redirect to Stripe.
- **Success:** After payment, Stripe redirects to `success_url` (e.g. `/settings?upgraded=1`). The webhook (Step 9.9) updates the org.

---

### Step 9.9 — Stripe webhook

- **File:** `app/api/webhooks/stripe/route.ts`
- **Events to handle:**
  - `checkout.session.completed` — user subscribed; get `client_reference_id` (org_id), update `organizations.subscription_tier` and `subscription_status = 'active'`.
  - `customer.subscription.updated` — plan changed; update tier.
  - `customer.subscription.deleted` — cancelled; set `subscription_status = 'cancelled'` or downgrade to free.
  - `invoice.payment_failed` — payment failed; set `subscription_status = 'past_due'`; optionally notify user.
- **Verify signature:** Use `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)`.
- **Return 200** to acknowledge.

---

### Step 9.10 — Enforce limits

- Before actions (e.g. add email account, import leads, send email), check the org's `subscription_tier` and enforce limits:
  - Free: max 1 email account, 100 leads total, 50 emails/month.
  - Pro: higher limits.
- If over limit, return 403 with a message like "Upgrade to Pro to add more leads."
- **Where:** In the relevant API routes (e.g. `POST /api/email-accounts`, `POST /api/leads/import/csv`, sender job).

---

### Step 9.11 — Billing page UI

- **File:** `app/(dashboard)/settings/billing/page.tsx` or a section on Settings.
- **Show:** Current plan, usage (leads count, emails sent this month, email accounts), renewal date.
- **Actions:** "Upgrade", "Manage subscription" (link to Stripe Customer Portal — use `stripe.billingPortal.sessions.create`).

---

## Part C: Final Polish

### Step 9.12 — Onboarding flow

For new users (first login, no campaigns):

1. **Welcome modal or page:** "Welcome to LeadPilot! Let's get started."
2. **Steps:**
   - Fill out **business context** (Settings form from Step 1).
   - Connect an **email account** (Step 4).
   - Create your first **campaign** (Step 2).
   - Import **leads** (Step 3).
   - Generate **sequences** (Step 5).
3. **Progress indicator:** Checklist or stepper UI. Store progress in `organizations.settings` or a separate `onboarding_completed` flag.
4. **Skip option:** Allow users to skip and explore on their own.

---

### Step 9.13 — Loading and empty states

- **Loading:** Add skeleton loaders or spinners on pages that fetch data (campaigns, leads, inbox, sequences). Use React Suspense or client-side loading state.
- **Empty states:** For each list (campaigns, leads, sequences, inbox), show a friendly empty state with illustration and CTA ("No leads yet. Import your first leads.").
- **Error states:** Catch errors in API calls; show toast (using `sonner` — already in deps) or inline error message. Don't show raw errors to users.

---

### Step 9.14 — Performance

- **Pagination:** Ensure all list pages paginate (leads, sequences, inbox, campaigns) to avoid loading thousands of rows.
- **Indexes:** The schema already has indexes; verify queries use them (check Supabase query performance).
- **Caching:** For expensive queries (analytics), consider caching or periodic aggregation.
- **Bundle size:** Run `pnpm build` and check for large bundles; code-split where needed.

---

### Step 9.15 — Accessibility and responsive design

- **Accessibility:** Ensure forms have labels, buttons have aria-labels, color contrast is sufficient. Use Radix UI (already in deps) for accessible components.
- **Responsive:** Test on mobile; the sidebar should collapse or become a hamburger menu. Tables may need horizontal scroll or card view on small screens.

---

### Step 9.16 — Documentation and help

- **In-app help:** Tooltips on complex features (e.g. "What is warmup?"), link to docs or FAQ.
- **README:** Keep `README.md` updated with setup instructions, env vars, and architecture overview.
- **API docs (optional):** If exposing API to users, document endpoints (use Swagger or a simple markdown file).

---

### Step 9.17 — Testing (optional but recommended)

- **Unit tests:** For lib functions (encryption, prompt builder, date utils).
- **Integration tests:** For critical API routes (auth callback, sequence generate, send email).
- **E2E tests:** Use Playwright or Cypress for key flows (login → create campaign → import leads → generate sequence).
- **CI:** Run tests on push (GitHub Actions).

---

### Step 9.18 — Deployment checklist

Before going live:

- [ ] **Env vars:** All production keys set (Supabase, Anthropic, Apify, Stripe, encryption key, OAuth secrets).
- [ ] **Database:** Migrations applied to production Supabase.
- [ ] **Auth:** Redirect URLs updated for production domain in Supabase, Google, Microsoft.
- [ ] **Webhooks:** Apify and Stripe webhook URLs point to production.
- [ ] **HTTPS:** Ensure app is served over HTTPS.
- [ ] **Rate limits:** Consider adding rate limiting to public-facing routes (e.g. with Vercel's built-in or a middleware).
- [ ] **Monitoring:** Set up error tracking (e.g. Sentry) and uptime monitoring.
- [ ] **Backups:** Supabase handles DB backups; verify settings.

---

## Checklist (summary)

### Analytics
- [ ] **9.1** Dashboard or analytics page with key metrics.
- [ ] **9.2** Metrics: total leads, active campaigns, emails sent, reply rate, positive replies.
- [ ] **9.3** Charts with Recharts: emails over time, replies over time, lead status breakdown.
- [ ] **9.4** Campaign-level stats on campaign detail.
- [ ] **9.5** (Optional) Export CSV.

### Billing
- [ ] **9.6** Stripe account and env vars.
- [ ] **9.7** Define subscription tiers (Free, Pro, Enterprise) in Stripe.
- [ ] **9.8** `POST /api/billing/checkout` — create Checkout Session; UI "Upgrade" button.
- [ ] **9.9** `POST /api/webhooks/stripe` — handle subscription events, update org.
- [ ] **9.10** Enforce limits based on tier in API routes.
- [ ] **9.11** Billing page: current plan, usage, upgrade, manage subscription.

### Final polish
- [ ] **9.12** Onboarding flow for new users.
- [ ] **9.13** Loading spinners, empty states, error toasts.
- [ ] **9.14** Pagination, query performance, caching.
- [ ] **9.15** Accessibility (labels, contrast) and responsive design.
- [ ] **9.16** In-app help, updated README.
- [ ] **9.17** (Optional) Unit, integration, E2E tests; CI.
- [ ] **9.18** Deployment checklist: env vars, migrations, webhooks, HTTPS, monitoring.

After this, LeadPilot is feature-complete and production-ready!
