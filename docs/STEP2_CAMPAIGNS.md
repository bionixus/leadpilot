# Step 2: Campaigns — Create & Detail Pages

Follow these steps in order. The campaigns **list** already lives at `/` (dashboard home). You will add **New Campaign** and **Campaign Detail** pages and wire the list actions.

**Existing API (use as-is):**

- `GET /api/campaigns` — list
- `POST /api/campaigns` — create (body: name, description?, source, source_config?, email_account_id?, settings?, llm_context?)
- `GET /api/campaigns/[id]` — get one
- `PATCH /api/campaigns/[id]` — update
- `DELETE /api/campaigns/[id]` — delete
- `POST /api/campaigns/[id]/start` — set status to `active`, set `started_at`
- `POST /api/campaigns/[id]/leads` — add leads (body: `{ leads: [{ email, first_name?, ... }] }` or array of lead objects)

**Campaign fields (from schema):**

- **Required:** `name`, `source` (one of: `csv` | `google_sheets` | `linkedin` | `apollo` | `google_maps` | `manual`)
- **Optional:** `description`, `source_config` (object), `email_account_id`, `settings` (object), `llm_context` (object)
- **Default status:** `draft`
- **settings** default: `{ sequence_length: 3, delay_between_emails_days: [0, 3, 5], stop_on_reply: true, track_opens: true, timezone: "UTC", send_window_start: "09:00", send_window_end: "17:00" }`

---

## Part A: New Campaign Page

### Step 2.1 — Create the route and page shell

- **File:** `app/(dashboard)/campaigns/new/page.tsx`
- **Behavior:**
  - Server component.
  - Set `metadata = { title: 'New Campaign | LeadPilot' }`.
  - Render a heading (e.g. “New Campaign”) and a client component for the form (e.g. `<NewCampaignForm />`). Optionally add a “Back to campaigns” link to `/`.

---

### Step 2.2 — Load data needed for the form (server)

On the same page (or in a parent), load:

1. **Email accounts** — so the user can pick “Send from” (optional).  
   Query `email_accounts` for the current org (get `org_id` from `users` by `auth_id`), e.g. `select('id', 'email_address', 'display_name')`.

2. Pass the list of email accounts (and any defaults) as props to the form component.

---

### Step 2.3 — New Campaign form (client component)

- **File:** e.g. `app/(dashboard)/campaigns/new/NewCampaignForm.tsx` (or under `components/campaigns/` if you prefer).

**Fields to include (minimum for MVP):**

1. **Name** (required) — text input.
2. **Description** (optional) — textarea.
3. **Source** (required) — select or radio: `csv`, `google_sheets`, `linkedin`, `apollo`, `google_maps`, `manual`. Default e.g. `manual` or `csv`.
4. **Send from (email account)** — select, optional. Options from props; value = `email_account_id`. Can be “Select later”.
5. **Settings (optional for MVP)** — you can hide advanced settings behind “Advanced” or use defaults:
   - Sequence length (number, default 3)
   - Delay between emails (e.g. comma-separated or 3 number inputs: day after 1st, after 2nd, after 3rd) → map to `delay_between_emails_days: [0, 3, 5]`
   - Stop on reply (checkbox, default true)
   - Timezone (text or select, default `UTC`)
   - Send window start/end (time inputs, default 09:00–17:00)

**Submit:**

- Build JSON: `{ name, description, source, source_config: {}, email_account_id: selectedId || null, settings: { ... } }`.
- `POST /api/campaigns` with that body.
- On success: `router.push(\`/campaigns/${data.id}\`)` (or redirect to campaign detail).
- On error: show message from API (e.g. `error.message`).

**Validation:** At least `name` and `source` required. Optionally use Zod or simple checks before submit.

---

### Step 2.4 — Optional: `source_config` by source

For a minimal first version you can leave `source_config` as `{}`. Later you can add:

- **google_sheets:** sheet_id, range, sync_enabled
- **linkedin:** search_url, filters
- **apollo:** search_params
- **csv / manual:** nothing

You can add a small “Source config” section that shows different inputs based on `source` (Step 2.3) and merge into `source_config` on submit.

---

## Part B: Campaign Detail Page

### Step 2.5 — Create the detail route and load campaign

- **File:** `app/(dashboard)/campaigns/[id]/page.tsx`
- **Behavior:**
  - Server component. Get `id` from `params`.
  - Get current user and `org_id` (from `users` by `auth_id`).
  - Fetch campaign: `campaigns` where `id = params.id`. If not found or not in org (RLS will enforce org), return `notFound()`.
  - Optionally fetch related: lead count for this campaign (`leads` where `campaign_id = id`), and email accounts for the org (for dropdown if user edits “Send from”).
  - Pass `campaign` (and lead count, email accounts) to the detail view / edit form.

---

### Step 2.6 — Campaign detail layout and actions

On the campaign detail page, show:

1. **Header**
   - Campaign name (and status badge: draft, active, paused, completed, archived).
   - Buttons/actions:
     - **Edit** — toggle or link to edit mode / modal (optional for MVP: inline edit).
     - **Start campaign** — only if status is `draft` or `paused`. On click: `POST /api/campaigns/[id]/start`, then refresh or update local state.
     - **Pause campaign** — only if status is `active`. `PATCH /api/campaigns/[id]` with `{ status: 'paused' }`.
     - **Delete** — confirm dialog, then `DELETE /api/campaigns/[id]`, then `router.push('/')`.

2. **Summary**
   - Description (if any).
   - Source, “Send from” (email account label or “Not set”).
   - Stats: total leads, emails sent, replies (from `campaign.stats`).

3. **Leads section**
   - Count and a link or button to “Add leads” (e.g. link to `/campaigns/[id]/leads` or a modal — Step 2.8).
   - Optional: table of leads (paginated) with columns email, name, status. For MVP you can show count only and “Add leads” / “View leads” (Step 3 will add leads list).

---

### Step 2.7 — Edit campaign (inline or form)

- Either on the same page or in a modal:
  - Form with: name, description, source, email_account_id, and (optionally) settings fields.
  - Submit: `PATCH /api/campaigns/[id]` with the changed fields.
  - On success: refresh server data (e.g. revalidatePath) or update client state.

- **Authorization:** RLS ensures the user’s org owns the campaign; no extra check needed in the API if you use the same Supabase client as the logged-in user.

---

### Step 2.8 — “Add leads” from campaign detail

Options:

**A) Link to Leads page with campaign filter**  
- Link to `/leads?campaign_id=[id]` and on the Leads page (Step 3) support “Import CSV” for that campaign and/or show leads for this campaign. The CSV import API already accepts `campaign_id` in the form body.

**B) Inline “Add leads” on campaign detail**  
- Button “Add leads” that opens a modal or inline form:
  - File input for CSV upload.
  - On submit: `POST /api/leads/import/csv` with `formData` including `file` and `campaign_id` (or use `POST /api/campaigns/[id]/leads` with a list of lead objects if you prefer to paste/add manually).
- After success: refresh campaign (and lead count) and close modal.

For Step 2 you can implement **B** minimally: “Add leads” button, CSV upload form that calls `POST /api/leads/import/csv` with `campaign_id`, then refresh. Full leads list and filters come in Step 3.

---

## Part C: Wire the campaigns list (dashboard home)

### Step 2.9 — Fix links from the list

The list is at `app/(dashboard)/page.tsx` (route `/`). Ensure:

1. **“New Campaign”** — links to `/campaigns/new` (already in your code).
2. **Each row** — campaign name links to `/campaigns/[id]` (already in your code).
3. **Play button** (start campaign) — when status is `draft` or `paused`:
   - Either make it a form that POSTs to `/api/campaigns/[id]/start` and then redirects/refreshes, or a client button that fetches `POST /api/campaigns/[id]/start` and then refreshes the list (e.g. router.refresh()).
4. **Pause button** — when status is `active`: `PATCH /api/campaigns/[id]` with `{ status: 'paused' }`, then refresh.
5. **More menu (⋯)** — add “Edit” (navigate to `/campaigns/[id]` or open edit mode) and “Delete” (confirm → `DELETE /api/campaigns/[id]` → redirect to `/`).

Implementing 3–5 may require turning the table row (or the whole list) into a client component, or using server actions for “Start”/“Pause”/“Delete” that call the API and then revalidatePath.

---

### Step 2.10 — Optional: Move campaigns list to `/campaigns`

Right now the list is at `/`. You can keep it that way or move it to `/campaigns` for consistency:

- Add `app/(dashboard)/campaigns/page.tsx` that renders the same campaigns list (copy from `(dashboard)/page.tsx`).
- Update dashboard home `app/(dashboard)/page.tsx` to either redirect to `/campaigns` or show a small dashboard overview (e.g. same stats + “Recent campaigns” with link “View all → /campaigns”).
- Update sidebar “Campaigns” link from `/` to `/campaigns` so “Campaigns” is the list and “New Campaign” stays `/campaigns/new`.

This step is optional; you can keep the list at `/` and only add `/campaigns/new` and `/campaigns/[id]`.

---

## Checklist (summary)

- [ ] **2.1** `app/(dashboard)/campaigns/new/page.tsx` — page shell and title.
- [ ] **2.2** Load email accounts for org and pass to form.
- [ ] **2.3** New Campaign form (client): name, description, source, email account, optional settings; POST to `/api/campaigns`; redirect to `/campaigns/[id]` on success.
- [ ] **2.4** (Optional) Source-specific `source_config` inputs.
- [ ] **2.5** `app/(dashboard)/campaigns/[id]/page.tsx` — load campaign (and lead count, email accounts).
- [ ] **2.6** Detail: header, status, Start/Pause/Delete, summary, stats, leads section.
- [ ] **2.7** Edit campaign (PATCH) on detail page or modal.
- [ ] **2.8** “Add leads” from detail (e.g. CSV upload to `POST /api/leads/import/csv` with `campaign_id`, then refresh).
- [ ] **2.9** List at `/`: Start/Pause and Delete (and Edit) work; links to `/campaigns/new` and `/campaigns/[id]` correct.
- [ ] **2.10** (Optional) Move list to `/campaigns` and adjust sidebar.

After this, you can create campaigns, open them, edit them, start/pause/delete, and add leads via CSV from the detail page.
