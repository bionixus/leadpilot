# Step 8: Scraping — Apify Client, LinkedIn/Apollo Jobs, Webhook & Lead Import

Follow these steps in order. You will add an **Apify client** lib to start actors and fetch results, wire the **LinkedIn** and **Apollo** scraping routes, implement the **webhook** that receives run completion and imports leads, and optionally add a **polling job** as an alternative.

**Existing:**

- `POST /api/scraping/linkedin` — stub ("Apify integration pending"); accepts `campaign_id`, `input_config`.
- `POST /api/scraping/apollo` — stub (same).
- `GET /api/scraping/jobs/[id]` — returns a `scraping_jobs` row by id.
- `POST /api/webhooks/apify` — stub; receives `runId`, `status`, `datasetId`.

**Schema:** `scraping_jobs` with `apify_actor_id`, `apify_run_id`, `job_type` (linkedin_search, linkedin_profile, apollo_search, apollo_enrich, google_maps), `input_config` (JSONB), `status` (pending, running, completed, failed, cancelled), `results_count`, `leads_created`, `error_message`, `compute_units_used`, `started_at`, `completed_at`.

**Missing:** Apify API calls, creating `scraping_jobs`, webhook logic to fetch results and create leads, UI to start scraping and view job status.

---

## Part A: Apify client lib

### Step 8.1 — Create Apify lib

- **File:** `src/lib/apify/index.ts`
- **Dependencies:** `apify-client` (already in package.json). Use `APIFY_API_TOKEN` from env.
- **API:**
  1. **`startActor(actorId: string, input: Record<string, unknown>, webhookUrl?: string): Promise<{ runId: string }>`**
     - Use `ApifyClient` from `apify-client`. Call `client.actor(actorId).start({ input, webhooks: [{ eventTypes: ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED'], requestUrl: webhookUrl }] })` (if webhookUrl provided).
     - Return `{ runId: run.id }`.
  2. **`getRunStatus(runId: string): Promise<{ status: string; datasetId?: string; ... }>`**
     - Call `client.run(runId).get()`. Return status, defaultDatasetId, stats (compute units, etc.).
  3. **`fetchDatasetItems<T>(datasetId: string): Promise<T[]>`**
     - Call `client.dataset(datasetId).listItems()`. Return `items`.
- **Error handling:** Wrap API calls in try/catch; throw with a clear message on failure.

---

### Step 8.2 — Actor IDs

You will need the Apify actor IDs for the scrapers you use. Common actors:

| Use case | Example actor | Actor ID (example) |
|----------|---------------|---------------------|
| LinkedIn Search | "LinkedIn Search Scraper" | `curious_coder/linkedin-search` or similar |
| LinkedIn Profile | "LinkedIn Profile Scraper" | `anchor/linkedin-profile-scraper` |
| Apollo Search | "Apollo.io Scraper" | `code_monk/apollo-io-scraper` |
| Google Maps | "Google Maps Scraper" | `compass/google-maps-scraper` |

Store these in env (e.g. `APIFY_LINKEDIN_SEARCH_ACTOR`, `APIFY_APOLLO_ACTOR`) or hardcode for MVP. Check [Apify Store](https://apify.com/store) for exact IDs.

---

## Part B: Wire scraping routes

### Step 8.3 — LinkedIn scraping route

- **File:** `app/api/scraping/linkedin/route.ts` (replace stub).
- **Body:** `{ campaign_id?: string; input_config: { searchUrl?: string; ... } }`. The `input_config` matches what the LinkedIn actor expects (e.g. search URL, number of results).
- **Flow:**
  1. Auth, get `org_id` and `user_id`.
  2. Insert into `scraping_jobs`: `org_id`, `campaign_id`, `created_by: user_id`, `apify_actor_id` (from env or hardcoded), `job_type: 'linkedin_search'`, `input_config`, `status: 'pending'`.
  3. Call `startActor(actorId, input_config, webhookUrl)` where `webhookUrl = {APP_URL}/api/webhooks/apify?job_id={job.id}` (include job ID in query so webhook can find it).
  4. Update `scraping_jobs` row: `apify_run_id = runId`, `status: 'running'`, `started_at: now()`.
  5. Return `{ job_id, run_id, status: 'running' }`.
- **Errors:** If Apify call fails, update job to `status: 'failed'`, `error_message`, and return 500.

---

### Step 8.4 — Apollo scraping route

- **File:** `app/api/scraping/apollo/route.ts` (replace stub).
- **Same pattern:** Insert job with `job_type: 'apollo_search'` (or `'apollo_enrich'` if enriching existing leads), call Apify, update job, return job info.

---

### Step 8.5 — Google Maps (optional)

- Add `POST /api/scraping/google-maps` if you want to support Google Maps scraping. Same flow with `job_type: 'google_maps'`.

---

## Part C: Webhook — Receive completion and import leads

### Step 8.6 — Secure the webhook (optional but recommended)

- Apify can include a **secret** in webhook requests. Add `APIFY_WEBHOOK_SECRET` to env; in the webhook route, verify the signature or a query param matches.
- Alternatively, include your own `?secret=...` in the webhookUrl when starting the actor, and check it on receipt.

---

### Step 8.7 — Implement webhook

- **File:** `app/api/webhooks/apify/route.ts` (replace stub).
- **Flow:**
  1. Parse body: Apify sends `{ resource: { id, actorId, status, defaultDatasetId, ... }, eventType, ... }`. The `resource.id` is the run ID; `resource.status` is e.g. `SUCCEEDED` or `FAILED`.
  2. Find `scraping_jobs` row by `apify_run_id = resource.id` (or use `job_id` from query if you passed it in webhookUrl).
  3. If `status === 'SUCCEEDED'`:
     - Call `fetchDatasetItems(resource.defaultDatasetId)`.
     - Map each item to a lead (see Step 8.8). Insert leads into `leads` with `org_id`, `campaign_id` (from job), source = 'linkedin' or 'apollo', etc.
     - Update job: `status: 'completed'`, `completed_at: now()`, `results_count: items.length`, `leads_created: inserted.length`, optionally `compute_units_used` from run stats.
  4. If `status === 'FAILED'`:
     - Update job: `status: 'failed'`, `error_message` from run or generic, `completed_at: now()`.
  5. Optionally send a **notification** (`type: 'scraping_completed'`) to the user who started the job.
  6. Return 200 OK.

---

### Step 8.8 — Map Apify results to leads

Apify actors return different schemas. You need to map fields:

**LinkedIn example:**

```ts
{
  fullName: "John Doe",
  firstName: "John",
  lastName: "Doe",
  headline: "CEO at Acme",
  companyName: "Acme Inc",
  location: "San Francisco, CA",
  profileUrl: "https://linkedin.com/in/johndoe",
  email: "john@acme.com" // if available
}
```

**Mapping:**

```ts
const lead = {
  org_id,
  campaign_id,
  email: item.email ?? '', // may be empty; handle later or skip
  first_name: item.firstName,
  last_name: item.lastName,
  company: item.companyName,
  job_title: item.headline?.split(' at ')[0] ?? item.headline,
  linkedin_url: item.profileUrl,
  city: parseCity(item.location),
  source: 'linkedin',
  source_url: item.profileUrl,
  enrichment_data: { raw: item }, // store full item for reference
};
```

**Apollo example:**

```ts
{
  email: "john@acme.com",
  first_name: "John",
  last_name: "Doe",
  title: "CEO",
  company: { name: "Acme Inc", ... },
  linkedin_url: "...",
  ...
}
```

Adjust mapping per actor. For MVP, handle the main fields; store rest in `enrichment_data`.

---

### Step 8.9 — Handle duplicates

- `leads` has `UNIQUE(org_id, campaign_id, email)`. On insert, use `ON CONFLICT DO NOTHING` (Supabase: `.upsert(..., { onConflict: 'org_id,campaign_id,email', ignoreDuplicates: true })`) or catch unique violation and skip. Track `leads_created` = actually inserted count.

---

## Part D: Polling (alternative to webhook)

### Step 8.10 — Poll job status

If webhooks are unreliable or you want a backup:

- **Trigger.dev job** or **cron API**: periodically (e.g. every 2 min) query `scraping_jobs` where `status = 'running'`. For each, call `getRunStatus(apify_run_id)`. If status changed to `SUCCEEDED` or `FAILED`, process as in Step 8.7.
- This is optional if webhooks work reliably.

---

## Part E: UI — Start scraping and view jobs

### Step 8.11 — "Import from LinkedIn/Apollo" on campaign or leads page

- **UI:** Button "Import from LinkedIn" (or Apollo, Google Maps). Opens a modal or page.
- **Form fields:**
  - **Campaign** (optional): attach leads to this campaign.
  - **Search URL** (LinkedIn) or **Search params** (Apollo): text input or structured fields depending on actor requirements.
- **Submit:** POST to `/api/scraping/linkedin` (or `/apollo`). On success, show job ID and status; redirect to job detail or show progress.

---

### Step 8.12 — Scraping jobs list (optional)

- **File:** `app/(dashboard)/scraping/page.tsx` or a section on Settings / Leads page.
- **API:** Add `GET /api/scraping/jobs` (list jobs for org with optional filters: `status`, `campaign_id`).
- **UI:** Table: job type, campaign, status, results count, leads created, date. Click → job detail (status, error, link to campaign).

---

### Step 8.13 — Job detail / status polling in UI

- On job detail or modal, poll `GET /api/scraping/jobs/[id]` every few seconds while status is `running`. Show progress (spinner, "Running…"), then results when completed.

---

## Checklist (summary)

- [ ] **8.1** `src/lib/apify` — `startActor(actorId, input, webhookUrl)`, `getRunStatus(runId)`, `fetchDatasetItems(datasetId)`; uses `apify-client` and `APIFY_API_TOKEN`.
- [ ] **8.2** Store or configure actor IDs (LinkedIn, Apollo, etc.) in env or code.
- [ ] **8.3** `POST /api/scraping/linkedin` — insert job, call Apify, update job with runId, return job info.
- [ ] **8.4** `POST /api/scraping/apollo` — same pattern.
- [ ] **8.5** (Optional) `POST /api/scraping/google-maps`.
- [ ] **8.6** (Optional) Secure webhook with secret.
- [ ] **8.7** `POST /api/webhooks/apify` — find job by runId, if succeeded fetch dataset and create leads, update job status.
- [ ] **8.8** Map Apify result items to lead fields; store extra in `enrichment_data`.
- [ ] **8.9** Handle duplicate leads on insert (upsert or ignore).
- [ ] **8.10** (Optional) Polling job: check running jobs periodically as backup to webhook.
- [ ] **8.11** UI: "Import from LinkedIn/Apollo" button + form; POST to scraping route.
- [ ] **8.12** (Optional) `GET /api/scraping/jobs` list; Scraping jobs page.
- [ ] **8.13** (Optional) Poll job status in UI while running.

After this, users can start LinkedIn/Apollo scrapes from the UI, Apify runs the actor, webhook imports leads into the campaign, and job status is tracked in `scraping_jobs`.
