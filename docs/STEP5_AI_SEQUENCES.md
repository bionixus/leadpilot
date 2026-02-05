# Step 5: AI Sequences — Claude, Generate, List & Editor

Follow these steps in order. You will add a **Claude integration** for sequence generation, wire the **generate** API to call it and save sequences, add a **Sequences** list page, and a **sequence editor** to view and edit steps.

**Existing:**

- `POST /api/sequences/generate` — accepts `campaign_id`, `lead_id`; builds prompt; **does not call Claude** (returns “pending” + prompt preview).
- `GET /api/sequences/[id]` — get one sequence.
- `PATCH /api/sequences/[id]` — update sequence (e.g. `emails` JSON).
- `src/lib/sequences/prompt.ts` — `generateSequencePrompt(businessContext, lead)` returns the user prompt string. Expects JSON response shape: `{ "emails": [ { "step", "delay_days", "subject", "body" } ] }`.

**Schema:** `sequences` has `org_id`, `campaign_id`, `lead_id`, `emails` (JSONB), `llm_model`, `llm_prompt_tokens`, `llm_completion_tokens`, `current_step`, `is_complete`, `stopped_reason`, `approved_at`, `approved_by`. `UNIQUE(lead_id)` — one sequence per lead.

**Missing:** Claude API call, parsing and validation of response, list sequences API, Sequences page, sequence editor UI.

---

## Part A: Claude integration

### Step 5.1 — Create Claude lib

- **File:** `src/lib/claude/index.ts` (or `generateSequence.ts`).
- **Dependencies:** `@anthropic-ai/sdk` (already in package.json). Use `ANTHROPIC_API_KEY` from env (or `ANTHROPIC_API_KEY` — check SDK docs for the exact env name).
- **API:** One function, e.g. `generateSequence(prompt: string): Promise<{ emails: Array<{ step: number; delay_days: number; subject: string; body: string }> }>`.
  - Call the Anthropic **Messages** API (or Completions if you prefer): send the prompt as the user message; optionally add a short system message (“You are a cold email copywriter. Reply only with valid JSON.”).
  - **Model:** e.g. `claude-sonnet-4-20250514` or the one in your schema default (`claude-sonnet-4-5-20250929`). Use a model that supports JSON output.
  - **Parse response:** The API returns text in the message content. Extract the text, then `JSON.parse`. Look for a JSON object in the response (sometimes the model wraps it in markdown code blocks; strip ```json and ``` if present).
  - **Validate:** Check that the result has an `emails` array and each item has `step`, `delay_days`, `subject`, `body`. Normalize types (e.g. string to number for step/delay_days). If invalid, throw a clear error.
  - **Return:** `{ emails }` and optionally `usage: { input_tokens, output_tokens }` if you want to store them in `llm_prompt_tokens` / `llm_completion_tokens`.
- **Errors:** If the API fails or the response is not valid JSON, throw. Let the route handle HTTP status and user message.

---

### Step 5.2 — Wire generate route to Claude and DB

- **File:** `app/api/sequences/generate/route.ts`
- **Flow (keep existing checks, replace the TODO):**
  1. Auth, body `campaign_id`, `lead_id`, load lead + campaign + org `business_context` (already there).
  2. Build prompt with `generateSequencePrompt(businessContext, lead)`. Optionally use campaign `settings.sequence_length` or org `business_context.sequence_length` to match the prompt (already in prompt.ts).
  3. Call `generateSequence(prompt)` from the Claude lib. Catch errors and return 500 with a safe message.
  4. **Insert sequence:** `supabase.from('sequences').insert({ org_id: campaign.org_id, campaign_id, lead_id, emails: result.emails, llm_model: '...', llm_prompt_tokens: usage?.input_tokens, llm_completion_tokens: usage?.output_tokens })`. Handle unique violation on `lead_id`: if a sequence already exists for this lead, either return 409 “Sequence already exists” or upsert/update (your product choice).
  5. Optionally update lead: `supabase.from('leads').update({ status: 'sequenced' }).eq('id', lead_id)`.
  6. Return the created sequence (e.g. `{ sequence: insertedRow }` or `insertedRow`).
- **Idempotency:** If you want “regenerate”, you can PATCH the existing sequence with new `emails` and reset `current_step` / `is_complete` instead of inserting again.

---

## Part B: List sequences API and Sequences page

### Step 5.3 — GET /api/sequences (list)

- **File:** `app/api/sequences/route.ts` (new file; only GET for list).
- **Behavior:**
  - Auth; get `org_id` from `users`.
  - Query params (optional): `campaign_id`, `lead_id`, `limit`, `offset`.
  - Query: `from('sequences').select('*', { count: 'exact' }).eq('org_id', orgId)`, then apply `.eq('campaign_id', campaign_id)` and/or `.eq('lead_id', lead_id)` if provided. Order by `created_at` desc. Paginate with `.range(offset, offset + limit - 1)`.
  - Return `{ sequences: rows, total: count }` (or `data` + `count`).

---

### Step 5.4 — Sequences page shell and data

- **File:** `app/(dashboard)/sequences/page.tsx`
- **Behavior:**
  - Server component. Set `metadata = { title: 'Sequences | LeadPilot' }`.
  - Read `searchParams`: e.g. `campaign_id`, `page`.
  - Fetch campaigns (for filter dropdown). Fetch sequences via `GET /api/sequences` with filters (or server-side Supabase with same filters).
  - Pass sequences, campaigns, and filter state to the list UI. Optionally join or fetch lead/campaign names for display.

---

### Step 5.5 — Sequences list UI

- **Content:**
  - **Filter:** Campaign dropdown (optional). URL: `?campaign_id=...`.
  - **Table or cards:** For each sequence show: lead (email/name), campaign name, status (e.g. “Draft” if not approved, “Active” if sending), steps count, generated date. Link to sequence detail: `/sequences/[id]`.
  - **Empty state:** “No sequences yet. Generate a sequence from a campaign lead.”
  - Optional: “Generate” from here (e.g. open a modal to pick campaign + lead, then POST generate). Often “Generate” is easier from the campaign or lead detail (e.g. “Generate sequence” on a lead row).

---

### Step 5.6 — “Generate sequence” entry points

- **From Leads list or lead detail:** For a lead that has no sequence yet, show “Generate sequence”. On click: pick campaign (or use lead’s `campaign_id`), then `POST /api/sequences/generate` with `{ campaign_id, lead_id }`. On success: redirect to `/sequences/[id]` or refresh and show the new sequence.
- **From Campaign detail:** List leads; for each lead without a sequence, “Generate” button that calls the same POST. Optional: “Generate for all” (batch) — call generate for each lead without a sequence (with rate limiting or background job to avoid timeouts).
- **From Sequences page:** Optional “New sequence” flow: select campaign, select lead (e.g. from a dropdown of leads in that campaign without a sequence), then POST generate.

Implement at least one of these (e.g. “Generate” on lead detail or campaign leads table).

---

## Part C: Sequence detail and editor

### Step 5.7 — Sequence detail page

- **File:** `app/(dashboard)/sequences/[id]/page.tsx`
- **Behavior:**
  - Load sequence by `id` (GET API or server Supabase). If not found or not in org, `notFound()`.
  - Optionally load lead and campaign (for breadcrumb and context).
  - Render: sequence metadata (lead, campaign, generated date, approved state), and the list of **steps** (emails). Each step: step number, delay_days, subject, body (read-only or editable — see 5.8).

---

### Step 5.8 — Sequence editor (view + edit steps)

- **Location:** On the same sequence detail page or a dedicated “edit” view.
- **Display:** For each item in `sequence.emails`, show:
  - Step number, delay (e.g. “Day 0”, “Day 3”).
  - Subject (text input or read-only with “Edit”).
  - Body (textarea or rich text; keep plain text for MVP).
- **Edit mode:** When the user changes subject or body (and optionally delay_days), either:
  - **Debounced save:** PATCH `emails` on blur or after a short delay.
  - **Explicit “Save”:** Button that PATCHes the whole `emails` array.
- **PATCH payload:** `{ emails: [ { step: 1, delay_days: 0, subject: "...", body: "..." }, ... ] }`. Validate on client or server that structure matches (step, delay_days, subject, body).
- **Optional:** “Approve” button: PATCH with `{ approved_at: new Date().toISOString(), approved_by: user_id }` so downstream sending (Step 6) only sends approved sequences.

---

### Step 5.9 — Regenerate (optional)

- **UI:** “Regenerate” on sequence detail. Calls `POST /api/sequences/generate` with same `campaign_id` and `lead_id`. Backend: if a sequence already exists for that lead, **update** it (PATCH the existing row with new `emails`, reset `current_step`, `is_complete`, clear `approved_at`) instead of failing on unique. Then redirect or refresh to show the new draft.

---

## Part D: Prompt and context tweaks (optional)

### Step 5.10 — Campaign-level overrides

- The prompt currently uses **org** `business_context`. You can extend it to merge **campaign** `llm_context` (e.g. different CTA or tone for this campaign). In the generate route, build a merged context: `{ ...org.business_context, ...campaign.llm_context }` and pass that to `generateSequencePrompt`. Ensure `sequence_length` still comes from org or campaign settings.

---

### Step 5.11 — Sequence length from campaign settings

- In `generateSequencePrompt` (or in the generate route before calling it), use `campaign.settings.sequence_length` if present, else `business_context.sequence_length`, else 3. Pass that into the prompt so the “Generate N emails” and the JSON structure match.

---

## Checklist (summary)

- [ ] **5.1** `src/lib/claude` — `generateSequence(prompt)` calls Anthropic, parses JSON, returns `{ emails, usage? }`; validate structure.
- [ ] **5.2** `POST /api/sequences/generate` — call Claude, insert (or update) sequence, optionally set lead status to `sequenced`.
- [ ] **5.3** `GET /api/sequences` — list with optional `campaign_id`, `lead_id`, pagination.
- [ ] **5.4** `app/(dashboard)/sequences/page.tsx` — load sequences and campaigns; pass to list.
- [ ] **5.5** Sequences list: filter by campaign, table/cards, link to `/sequences/[id]`.
- [ ] **5.6** “Generate sequence” from lead or campaign (e.g. button → POST generate → redirect to sequence).
- [ ] **5.7** `app/(dashboard)/sequences/[id]/page.tsx` — sequence detail, show steps.
- [ ] **5.8** Editor: edit subject/body (and delay_days); PATCH `emails`; optional “Approve”.
- [ ] **5.9** (Optional) “Regenerate” — POST generate, update existing sequence row.
- [ ] **5.10** (Optional) Merge campaign `llm_context` into prompt context.
- [ ] **5.11** (Optional) Use campaign `settings.sequence_length` in prompt.

After this, users can generate AI sequences per lead, list and filter them, and view/edit steps; optional approve and regenerate complete the flow before sending (Step 6).
