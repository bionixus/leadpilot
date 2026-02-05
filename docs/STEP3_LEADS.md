# Step 3: Leads — List, Filters, CSV Import & Detail

Follow these steps in order. You will add a **Leads** list page with filters, **CSV import UI** (and optionally a dedicated import page), and an optional **Lead detail** view.

**Existing API:**

- `GET /api/leads/[id]` — get one lead
- `PATCH /api/leads/[id]` — update a lead
- `POST /api/leads/import/csv` — import from CSV (FormData: `file`, optional `campaign_id`)
- `POST /api/leads/import/google-sheets` — stub (returns “not yet implemented”)
- `POST /api/campaigns/[id]/leads` — add lead objects to a campaign (body: `{ leads: [...] }` or array)

**Missing:** `GET /api/leads` for listing leads with filters. You will add it in Step 3.1.

**Lead fields (from schema):**  
`id`, `org_id`, `campaign_id`, `email`, `first_name`, `last_name`, `full_name` (generated), `company`, `job_title`, `linkedin_url`, `website`, `phone`, `city`, `state`, `country`, `timezone`, `enrichment_data`, `custom_fields`, `status`, `email_valid`, `source`, `source_url`, `created_at`, `updated_at`.

**Lead statuses:**  
`new`, `sequenced`, `contacted`, `replied`, `interested`, `not_interested`, `bounced`, `unsubscribed`, `converted`.

---

## Part A: List API and Leads List Page

### Step 3.1 — Add GET /api/leads (list with filters)

- **File:** `app/api/leads/route.ts`
- **Behavior:**
  - **GET** only (no POST here; create is via import or campaign leads).
  - Auth: get current user and `org_id` from `users` by `auth_id`. If no org, return 403.
  - Query params (all optional):
    - `campaign_id` — filter by campaign (must belong to org).
    - `status` — filter by lead status.
    - `search` — simple text search on `email`, `first_name`, `last_name`, `company` (e.g. `ilike` on each or use a single `or` filter).
    - `limit` — default 50, max 100.
    - `offset` — default 0 (for pagination).
  - Query: `from('leads').select('*', { count: 'exact' }).eq('org_id', orgId)` then apply filters. Order by `created_at` desc.
  - Return: `{ data: rows, count: totalCount }` or `{ leads: rows, total: totalCount }`. Use Supabase’s `.range(offset, offset + limit - 1)` for pagination and `.abortSignal()` if you need to avoid long runs.

**Example:**  
`GET /api/leads?campaign_id=xxx&status=new&limit=20&offset=0` → list of leads and total count.

---

### Step 3.2 — Leads list page shell and data loading

- **File:** `app/(dashboard)/leads/page.tsx`
- **Behavior:**
  - Server component. Set `metadata = { title: 'Leads | LeadPilot' }`.
  - Read searchParams: `campaign_id`, `status`, `page` (for offset).
  - Fetch campaigns for the org (for the “Campaign” filter dropdown).
  - Fetch leads: call `GET /api/leads` with the same filters (or fetch via server Supabase client with the same filters). Prefer using the new GET API so filters and pagination are consistent.
  - Pass `leads`, `total`, `campaigns`, and current filter values to the list UI and filter bar.

---

### Step 3.3 — Filter bar (client or server)

- **Location:** On the same page or in a client component (e.g. `LeadsFilterBar`).
- **Elements:**
  1. **Campaign** — dropdown of campaigns (option “All campaigns”). On change, update URL: `?campaign_id=...` (or clear).
  2. **Status** — dropdown: All, New, Sequenced, Contacted, Replied, Interested, Not interested, Bounced, etc. On change: `?status=...`.
  3. **Search** — text input (e.g. email, name, company). On submit or debounced input: `?search=...`.
  4. Optional: **Export** or **Import** button (Import opens CSV flow; see Part B).

- **URL as source of truth:** Keep filters in the URL so “Leads” page is shareable and back/forward work. Use `useSearchParams()` and `router.push` or `<Link>` in a client component, or server-render links for filter presets.

---

### Step 3.4 — Leads table

- **Columns (minimum):** Email, Name (or first + last), Company, Status, Campaign (name), Created.
- **Optional columns:** Job title, Phone, Actions (View / Edit).
- **Row click or “View”** — navigate to lead detail (e.g. `/leads/[id]`) or open a slide-over/drawer.
- **Pagination** — if total > limit, show “Previous / Next” or page numbers; update `offset` via `page` query param (e.g. `page=2` → offset = (page - 1) * limit).

---

## Part B: CSV Import UI

### Step 3.5 — Import entry point

Two options (pick one or both):

**A) From Leads page**  
- Button “Import leads” on the Leads list page. Opens a modal or navigates to `/leads/import`. In the modal or page: file input + campaign selector + “Import” button.

**B) From Campaign detail (already in Step 2)**  
- “Add leads” on `/campaigns/[id]` with CSV upload and pre-filled `campaign_id`. No change required here if you did Step 2.8.

For Step 3, implement **A** so users can import from the Leads section even without opening a campaign; campaign can be “None” (leads without campaign) or a chosen campaign.

---

### Step 3.6 — CSV import form (client)

- **Fields:**
  1. **File** — `<input type="file" accept=".csv" />`. Required.
  2. **Campaign** (optional) — dropdown of org campaigns. Value = `campaign_id`; empty = “No campaign”.
- **Submit:**
  - Build `FormData`: append `file`, optionally `campaign_id`.
  - `POST /api/leads/import/csv` with that FormData.
  - On success: show “Imported N leads” and close modal or redirect to Leads list (optionally with `?campaign_id=...` to show the new leads). Refresh list data.
  - On error: show API error message (e.g. “No file”, or DB error).
- **CSV format hint:** Show a short note: “CSV should have headers. We use: email, first_name, last_name, company, job_title, linkedin_url, phone, location.”

---

### Step 3.7 — Optional: Dedicated import page

- **File:** `app/(dashboard)/leads/import/page.tsx`
- Same form as in the modal (file + campaign). After import, redirect to `/leads` or `/leads?campaign_id=...`. Use this if you prefer a full-page flow instead of a modal.

---

## Part C: Lead Detail (optional)

### Step 3.8 — Lead detail route and data

- **File:** `app/(dashboard)/leads/[id]/page.tsx`
- **Behavior:**
  - Get `id` from params. Fetch lead: `GET /api/leads/[id]` or server-side Supabase `from('leads').select('*').eq('id', id).single()`.
  - If not found or not in org (RLS), `notFound()`.
  - Optionally fetch campaign name if `campaign_id` is set (for breadcrumb or context).
  - Render lead fields in a readable layout (sections: Contact, Company, Status, Dates, etc.).

---

### Step 3.9 — Lead detail layout and edit

- **Display:** Email, first name, last name, company, job title, phone, LinkedIn, website, city/state/country, status, campaign (link to campaign), created/updated, enrichment_data (if any) as read-only or key-value.
- **Edit:** “Edit” button that either:
  - Navigates to `/leads/[id]/edit`, or
  - Opens an inline form / modal with fields (email, first_name, last_name, company, job_title, status, etc.). Submit: `PATCH /api/leads/[id]`. On success, refresh or update local state.

---

### Step 3.10 — Optional: Lead status quick-update

On the list or detail page, allow changing status without opening full edit (e.g. dropdown or buttons: Mark as Contacted, Replied, Interested, etc.). On change: `PATCH /api/leads/[id]` with `{ status: '...' }`, then refresh.

---

## Checklist (summary)

- [ ] **3.1** Add `GET /api/leads` with filters: campaign_id, status, search, limit, offset; return list + count.
- [ ] **3.2** `app/(dashboard)/leads/page.tsx` — load campaigns and leads (using GET API) from searchParams.
- [ ] **3.3** Filter bar: campaign, status, search; URL reflects filters.
- [ ] **3.4** Leads table: columns (email, name, company, status, campaign, created); pagination; link to detail.
- [ ] **3.5** “Import leads” entry point on Leads page (modal or link to import page).
- [ ] **3.6** CSV import form: file + optional campaign; POST to `/api/leads/import/csv`; success/error feedback.
- [ ] **3.7** (Optional) Dedicated `/leads/import` page with same form.
- [ ] **3.8** (Optional) `app/(dashboard)/leads/[id]/page.tsx` — load and show lead.
- [ ] **3.9** (Optional) Lead detail: layout + edit (inline or separate page).
- [ ] **3.10** (Optional) Quick status update on list or detail.

After this, you have a working Leads list with filters and pagination, CSV import from the Leads area, and optionally a lead detail (and edit) page.
