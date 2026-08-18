# PRD: Dynamic Room Voucher Generator Web App
**Product:** Lub d Room Voucher Issuing System
**Version:** 0.8 (Draft — confirmed POC-first approach for the export engine, as recommended)
**Status:** Draft for Review

---

## 1. Background & Problem Statement

Today the team (e.g. Marketing / Reservations) issues Room Vouchers to guests/influencers manually (editing a Photoshop or Canva file per voucher), which causes:
- High time cost per voucher, doesn't scale as request volume grows
- No centralized running number system → risk of duplicate or skipped numbers
- No audit trail of who issued a voucher, who approved it, or when
- No status tracking (Pending / Approved / Rejected)

**Goal:** Build a web app where an Issuer fills out a form → sees a live preview instantly → sends it for approval → the Approver approves via an email link → the system generates print-quality PNG/PDF files, with running numbers and status tracked automatically.

---

## 2. Goals / Non-Goals

**Goals**
- Vouchers are issued correctly, matching the brand template 100%
- Running numbers never duplicate or skip, even when issued concurrently by multiple people
- The approval process works via email with no login required (or a lightweight login)
- System cost = $0/month (entirely on free tiers) in phase 1

**Non-Goals (out of scope for this phase)**
- No actual room booking engine — a voucher is an entitlement that still requires contacting the reservation team to redeem
- No system to track real on-site redemption (e.g. QR check-in) — add as Phase 2 if needed
- No cross-property reporting or shared running numbers (each property runs its own numbering independently — see sections 3 and 11)

---

## 3. Users & Roles

| Role | Permissions | Access Trigger |
| --- | --- | --- |
| **Issuer** | Fills the form, views preview, sends for approval, views their own voucher history/status | Login (Google Workspace SSO recommended if the org already uses Google Workspace) |
| **Approver** | Receives email, approves/rejects via a tokenized link, downloads files | No login required — uses a signed link that expires (e.g. 7 days) |
| **Admin** (recommended addition) | Manages the Approver list, views all vouchers from everyone, edits/cancels vouchers, configures template/coordinates, **assigns properties to each user (a user can be assigned multiple properties)** | Login + role = admin |

> ✅ **Confirmed:** One approver per request (no multi-level approval) — matches the single "Send for Approval" dropdown in the mockup

> ✅ **Confirmed:** Multi-property support — the Admin assigns which users can see which properties (a user can be assigned more than one property). Issuers/Approvers only see vouchers for properties they've been assigned to. Running numbers and files still run independently per property, never combined.

---

## 4. Detailed User Flow

1. Issuer logs in → goes to the "Create Voucher" page
2. The system pulls the latest running number from the DB and displays it (Last No. / Current No. as in the mockup)
3. Issuer fills out the form (see section 5) → the canvas on the right updates the preview in real time on every keystroke/change (debounce ~150–300ms)
4. Issuer clicks **"Send request for approval"**
5. The system:
   - Saves a record with status `pending_approval` and **reserves the running number(s) in advance** (see 6.4 on concurrency)
   - Generates and stores a preview image (so the approver can view it without re-rendering)
   - Sends an email to the Approver via Resend with a signed URL link
6. Approver opens the link (no login) → sees a read-only preview page + Approve / Reject buttons
7. If **Approved** → adds a signature/approval date onto the voucher → renders the real files (PNG + PDF) → status changes to `approved` → immediately downloadable + (optionally) emails the Issuer that it's been approved with the file attached/linked
8. If **Rejected** → enters a reason (text) → status changes to `rejected` → notifies the Issuer by email → **returns the reserved running number back into the pool** (see 6.4)
9. Issuer visits the "History" page to see the status of every voucher ever issued, searchable/filterable by status or date range

---

## 5. Form Fields — Detailed Spec from the Mockup

| Field | Type | Options / Validation | Notes |
| --- | --- | --- | --- |
| Running No. (Last / Current) | Read-only, auto | Format: `{2-digit BE year}/{Property Code}{3-digit running number}`, e.g. `26/LDCH099` | ⚠️ Real data shows the "Lub d Koh Samui" property used code `SAMUI`, not following the `LD`+abbreviation pattern (e.g. `26/SAMUI004`) — needed to confirm whether to enforce one format across all properties or let Admin set a prefix per property |
| Room Type | Multi-select (checkbox), required, min 1 | ⚠️ **Updated from real data:** the Google Sheet shows a single voucher can select more than one room type (e.g. "The Compact, The Duo") — not a single dropdown as in the original mockup. Changed to multi-select, stored as an array | Pulled from a master list managed in the Admin page — the sheet shows many property-specific room types (e.g. Koh Tao has "Coconut Hideaway", "Tanote Bay Suite", etc.), so the master list needs to be split per property |
| Number of Nights | Stepper (+/-), min 1 | Integer, has a min/max (e.g. 1–14) | Max value still needs to be confirmed |
| Number of Vouchers | Stepper (+/-), min 1 | Can issue multiple vouchers per batch — 1 submission = N sequential running numbers generated | Major impact on the running-number logic (see 6.4) |
| Breakfast Option | ⚠️ **Updated from real data:** boolean toggle (TRUE/FALSE) | required | UI still displays "Included/Not Included" for clarity, but stored in the DB as a boolean, matching the existing data |
| Validity | Date range picker | Start ≤ End, should not be earlier than today | Calendar highlights the selected range as in the mockup |
| Blackout Date | Radio: Default / Custom | Default = standard text ("Weekend and Public Holiday...") / Custom = free text | Custom text needs a character limit to avoid overflowing the template (see 6.2) |
| Issued by | Read-only, auto = current user | From session/login | Corresponds to the "Requested By" column in the existing sheet |
| Send for Approval | Dropdown, required | List of Approvers from the master list | Corresponds to the "Approved By" column in the existing sheet — ⚠️ real data shows some rows store a name, others an email; needs normalization to link to a user account in the new system |
| Note | Textarea, optional | Length limit (recommended ≤200 characters) since the voucher has limited space | Example from mockup: "Voucher for Influencer [Influencer Name]" — corresponds to the "Remark" column in the existing sheet |

### 5.1 Additional Fields Found in Real Data (Not in the Original Mockup)

The Google Sheet currently used for tracking has columns that don't appear in the form mockup. Recommend adding these to scope so data isn't lost during migration:

| Field from the existing sheet | Description | Proposal |
| --- | --- | --- |
| **Item Name** | Campaign/batch name for the voucher, e.g. "GoxSomeday (KOLs)", "Classical Service Staff Party 2026" — one Item Name is usually tied to multiple vouchers (a batch) | Add as a "Campaign / Batch Name" field on the form, used to group multiple vouchers issued together when viewing/searching |
| **Purpose** | Category: `KOL`, `Partner Compliment`, `Staff Party`, `etc. Compliment` | Add as a required dropdown on the form |
| **Claim by** | Free text stating who is claiming/where to claim (e.g. "Contact Lub d Bangkok Chinatown", "Guest Experience Leader Chinatown") | Add as a supplementary field, filled in when status changes to Claimed |
| **File** | Reference filename/link (currently appears to reference a Google Drive folder name) | In the new system this should be automatically replaced by `exported_png_url` / `exported_pdf_url` — no manual entry needed |
| **Additional statuses** | Besides Claimable/Claimed found in real data, the sheet's legend also lists `Expired` and `Revoked` | Need to add these 2 statuses to the DB enum (see section 8) — **needed to confirm the conditions**: when Expired triggers automatically (e.g. past Validity End Date while still Claimable) and who can trigger Revoked |

---

## 6. Dynamic Template Overlay Engine (Technical Detail)

### 6.1 Approach
Use **HTML5 Canvas** to draw the base image (a voucher background pre-designed by the graphics team), then draw text/numbers on top at pre-defined (x, y) coordinates per field.

### 6.2 Canvas Coordinate Mapping
- Store coordinates as a **percentage (%) of the original image dimensions**, not fixed pixels, to support responsiveness/different resolutions between the preview (screen) and export (300 DPI for print)
- Example config structure (recommend storing in the DB or a JSON config separate from the code, so Admin can edit without redeploying):
```json
{
  "template_id": "lubd_bkk_chinatown_v1",
  "canvas_size": { "width": 1350, "height": 1080 },
  "fields": [
    { "key": "running_no", "x_pct": 0.62, "y_pct": 0.06, "font": "Poppins Bold", "size_pct": 0.018, "color": "#FFFFFF", "align": "left", "max_chars": 14 },
    { "key": "room_type", "x_pct": 0.06, "y_pct": 0.40, "font": "Poppins Regular", "size_pct": 0.014 },
    { "key": "validity_range", "x_pct": 0.06, "y_pct": 0.46 },
    { "key": "blackout_text", "x_pct": 0.06, "y_pct": 0.50, "max_lines": 2, "line_height_pct": 0.016 }
  ]
}
```
- **Font**: needs to embed the actual font used (mockup appears to use a bold sans-serif) both on the browser side (`@font-face`) and server-side rendering if using Node canvas — Thai/English fonts need to render correctly if Thai text is added in the future
- **Text overflow**: free-text fields (e.g. Custom Blackout Date, Note) need a character limit + auto line-wrap or auto-shrink font size so they don't overflow the frame — must be tested against realistic worst-case text length, not just the happy path

### 6.3 Preview vs Export
- **Preview** (real-time): render on `<canvas>` client-side with JS directly — fast, no server load
- **High-quality export (PNG/PDF for print):** recommend rendering **server-side** (not client-side `html2canvas`) in order to:
  - Guarantee resolution control (300 DPI) regardless of the user's browser/device
  - Prevent file tampering (if rendered client-side and uploaded, a user could alter values in DevTools before export)
  - Suitable Node-side libraries: `node-canvas` (for drawing) + `pdf-lib` or `puppeteer` (for converting/composing into PDF) — needs testing for cold-start time on Vercel Serverless, since `node-canvas` has a native dependency that sometimes causes issues with serverless runtimes (should verify it actually deploys on Vercel before locking in the architecture — not 100% confirmed, recommend a spike/POC first)

> ✅ **Confirmed:** Proceeding as recommended — start with a small POC testing whether `node-canvas` actually deploys on Vercel Serverless Functions (since there are cases of native binding compilation failing in some environments). If issues are found, fall back to the recommended alternatives: Vercel's Satori/`@vercel/og` (image generation), or run rendering on a Supabase Edge Function/Cloudflare Worker instead — this POC is in the Week 1 milestone (see section 13)

> ✅ **Confirmed (revised from CMYK):** Use **RGB** for both PNG and PDF export — no need to convert to CMYK, which simplifies the export pipeline and removes the need for an ICC color profile or additional color-conversion library. The color seen in the preview will match the exported file.

### 6.4 Running Number — Concurrency & Multi-Voucher Issue
The most critical issue for this system is that **running numbers must never duplicate**, even if 2 people issue vouchers at the same time:
- Use a **PostgreSQL sequence or `SELECT ... FOR UPDATE` within a transaction** via Supabase (never compute the next number client-side and write it back — this causes a race condition)
- When "Number of Vouchers" > 1, reserve a range of running numbers within a single transaction — e.g. requesting 5 vouchers reserves `26/LDCH099` through `26/LDCH103` atomically
- If the Approver clicks **Reject** → ✅ **Confirmed:** the running number returns to the pool for reuse, but the original record remains in the Log/History with status `rejected` (never deleted), so an audit can look back and see this number was previously requested and rejected
- ✅ **Confirmed:** Running numbers reset to 001 every year, prefixed with the 2-digit Buddhist-era year — e.g. `26/LDCH001` in 2026 (BE 2569), `27/LDCH001` when the year rolls to 2027 (BE 2570) — matches the `running_number_counters (property_id, year, last_number)` schema already designed in section 8

---

## 7. Approval System & Email

- **Resend** sends an email to the Approver with a signed link (e.g. a JWT or HMAC token bound to `voucher_id` + expiry)
- The link must **expire** (recommend 7 days) and be usable for a single action only (prevents double-approval / use after expiry)
- The Approve/Reject page for the Approver must be a public route, but the token must be verified server-side every time — **never trust any value sent from the client without checking against the DB**
- Status flow: `pending_approval` → `approved` → `claimable` → `claimed` | `rejected` | `expired` (auto, once past the Validity End Date) | `revoked` (manual, always requires a reason — see section 11)

---

## 8. Data Model (Draft)

```sql
-- properties (Confirmed: multi-property support from the start — each property runs its own numbering and files independently)
-- code = prefix for the running number, Admin can edit per property, default values: LDBS (Bangkok Siam), LDCH (Bangkok Chinatown),
-- LDPT (Phuket Patong), LDKT (Koh Tao), LDSM (Koh Samui), LDMK (Manila Makati), LDSR (Siem Reap)
properties (id, code, name, template_config jsonb)

-- user_properties (mapping for Admin to assign which users can see which properties — a user can be assigned multiple)
user_properties (user_id, property_id)

-- room_types
room_types (id, property_id, name, is_active)

-- vouchers
vouchers (
  id uuid primary key,
  running_no text unique not null,       -- e.g. "26/LDCH099" (⚠️ format varies per property today, see section 5)
  item_name text,                        -- Campaign/batch name, e.g. "GoxSomeday (KOLs)" — new field found in real data
  purpose text check (purpose in ('kol','partner_compliment','staff_party','etc_compliment')), -- new field found in real data
  property_id uuid references properties,
  room_type_ids uuid[] not null,         -- ⚠️ changed to array — real data shows multiple room types per voucher
  nights int not null,
  breakfast_included boolean not null,   -- ⚠️ changed to boolean per real data (was an enum in v0.2)
  blackout_type text check (blackout_type in ('default','custom')),
  blackout_text text,
  validity_start date not null,
  validity_end date not null,
  note text,                             -- maps to "Remark" in the existing sheet
  claim_by text,                         -- new field found in real data, e.g. "Contact Lub d Bangkok Chinatown"
  issuer_id uuid references users,       -- maps to "Requested By"
  approver_id uuid references users,     -- maps to "Approved By" (⚠️ existing sheet mixes names/emails — needs normalization on migration)
  status text check (status in ('pending_approval','approved','claimable','claimed','rejected','expired','revoked')) default 'pending_approval', -- ⚠️ expanded: real data/legend shows expired and revoked in addition to claimable/claimed
  approval_token text,
  approval_token_expires_at timestamptz,
  approved_at timestamptz,
  rejected_reason text,
  expired_at timestamptz,                -- ✅ Confirmed: set automatically by a scheduled job once past validity_end while still 'claimable'
  revoked_at timestamptz,                -- ✅ Confirmed: manual action only, any account with permission
  revoked_by uuid references users,
  revoked_reason text,                   -- ✅ Confirmed: required whenever a voucher is revoked
  exported_png_url text,
  exported_pdf_url text,
  created_at timestamptz default now()
)

-- running_number_counters
running_number_counters (property_id, year, last_number int)
```

---

## 9. Non-Functional Requirements

| Category | Requirement |
| --- | --- |
| **Performance** | Preview updates < 300ms after typing/changing a value; real file export < 3 seconds (revised from the original "under 1 second" target, since server-side rendering + PDF composition typically takes longer than client-side canvas — expectations need to be set accordingly) |
| **Cost** | Target $0/month in the MVP phase using free tiers: Supabase (500MB DB, 1GB storage), Vercel Hobby, Resend (3,000 emails/month) — **usage must be monitored** since exceeding the free tier incurs immediate cost |
| **Security** | Signed links have an expiry; RLS (Row Level Security) on Supabase prevents an Issuer from seeing other people's vouchers; no sensitive data stored in URL query strings |
| **Availability** | No formal SLA in phase 1 (running on free tiers, which don't guarantee uptime) |
| **Export Format** | ✅ **Confirmed:** always export both PNG and PDF (not either/or), with **RGB** as the standard color mode at 300 DPI |
| **Browser Support** | Latest Chrome/Edge/Safari — no need to support IE |
| **Localization** | ✅ **Confirmed:** primarily English per the current mockup (no need to support Thai on the voucher in this phase) |

---

## 10. Tech Stack (Summary + Rationale)

| Component | Technology | Additional Notes |
| --- | --- | --- |
| Frontend | Next.js (React) | Chosen because it supports both client-side canvas (preview) and server routes (export) in a single project |
| Canvas Preview | HTML5 Canvas API directly (not relying on `html2canvas` for the real file) | `html2canvas` is good for a fast preview but not recommended as the official output file |
| Export Engine | Server-side render (Node canvas / `@vercel/og` / Puppeteer) — **POC required before locking in** | See section 6.3 |
| Backend & DB | Supabase (Postgres + Auth + Storage) | RLS helps with data isolation between Issuers |
| Email | Resend | Free tier of 3,000 emails/month is sufficient for the MVP |
| Hosting | Vercel | Fully supports Next.js, but must check the serverless function timeout limit (Hobby plan = 10s) is enough for the export process |

---

## 11. Decisions Confirmed & Remaining Open Questions

**Confirmed:**
1. ✅ One approver per request (no multi-level approval)
2. ✅ Running numbers reset to 001 every year, prefixed with the 2-digit BE year — e.g. `26/LDCH001` → `27/LDCH001`
3. ✅ When Rejected, the running number returns to the pool for reuse, but the Log/History still records that it was rejected
4. ✅ Multi-property support from the start — Admin assigns which users can see which properties (a user can be assigned multiple properties), with running numbers and files still running independently per property, never combined
5. ✅ Always export both PNG and PDF, with RGB as the standard color at 300 DPI
6. ✅ Primarily English, no need to support Thai on the voucher in this phase

**Still to discuss:**
1. Does the system need to track actual on-site "redemption" (e.g. QR code, scan to mark as used)? If needed, this is additional scope not in the current mockup
2. **Migration from the existing Google Sheet:** the team currently tracks vouchers manually via a Google Sheet and wants that existing data migrated into the new system — needed to review the actual file to assess: how closely the column structure matches the schema in section 8, how to import previously issued running numbers so they continue seamlessly with new numbers without colliding, and whether any property/room type data needs additional mapping from the existing setup

---

## 12. Data Migration (Updated After Reviewing the Actual Google Sheet)

**Summary of the existing file structure** (sheet named "VC" or similar — please reconfirm the actual file name):
- Divided into separate tables per property: Lub d Bangkok Siam, Lub d Bangkok Chinatown, Lub d Koh Tao, Lub d Phuket Patong, Lub d Koh Samui (each table has a different row count; roughly 250+ real voucher entries in total, not counting empty pre-prepared rows)
- Columns: `Item Name, VC No., Property, Room Type, Breakfast, Status, Claim by, Issue Date, Start Date, End Date, Purpose, Requested By, Approved By, File, Remark`
- **Important:** the same file also contains another sheet, something like "Creative Request Tracker," which tracks the team's graphic/artwork projects (247 projects, with metrics like Avg lead time, Count by property) — **this is a completely separate system, unrelated to Vouchers.** ✅ Confirmed: not included in this migration's scope

**Migration Plan:**
1. Write a one-time Node script to read the data via the Google Sheets API (or export CSV per property if you'd rather not integrate with the API)
2. Map the existing columns → the new `vouchers` schema per the table in section 8 (mostly maps directly)
3. Normalize `Approved By` / `Requested By` to link to `users.id` — need to create user records in the new system matching the names/emails found in the sheet (e.g. "Parika Kirdjongrak", "Oliver lan Council", "parika.k@marasca.live")
4. Preserve all existing running numbers exactly as-is (import as they are, no revising/remapping the old prefix — ✅ Confirmed), then have the new system's counter continue from the highest existing number per property/year, with new numbers issued after go-live using the prefix confirmed in section 11 (e.g. Koh Samui moving from the old `SAMUI` to `LDSM` for new vouchers)
5. Pre-create property records for Siem Reap and Manila Makati (no voucher data yet, but they need to be set up in advance with prefix codes `LDSR`/`LDMK`)
6. Set up a scheduled job to auto-expire vouchers that have passed the Validity End Date while still `claimable`

**Confirmed After Reviewing the Actual File:**
1. ✅ **Property Prefix:** Admin can set the prefix themselves per property, but use this set as the default to start — `LDBS` (Bangkok Siam, code unchanged), `LDCH` (Bangkok Chinatown), `LDPT` (Phuket Patong), `LDKT` (Koh Tao), `LDSM` (Koh Samui, changed from the old `SAMUI`), `LDMK` (Manila Makati), `LDSR` (Siem Reap) — ✅ Confirmed: **existing running numbers already issued will NOT be revised/remapped** — all historical numbers are preserved exactly as they are (Koh Samui's old numbers under `SAMUI` will remain that way in history; new numbers issued after go-live will use `LDSM`)
2. ✅ **Expired:** status changes automatically once past the Validity End Date (requires a cron job/scheduled function checking daily)
3. ✅ **Revoked:** manual action only — can be triggered by any account with permission (Admin and the owner of the property the voucher belongs to), and **a reason must always be entered** before the status changes (stored as `revoked_reason` and `revoked_by` in the DB)
4. ✅ **Migration scope:** migrate the actual data of the 5 properties currently live (Bangkok Siam, Chinatown, Koh Tao, Phuket Patong, Koh Samui) **and also prepare (set up) other properties that don't have voucher data yet** (e.g. Siem Reap, Manila Makati) so they're ready to use as soon as those properties start issuing vouchers
5. ✅ **Will NOT migrate** the "Creative Request Tracker" sheet into this system — confirmed as a separate matter

---

## 13. Suggested Milestones (Rough)

1. **Week 1:** Set up the project (Next.js + Supabase + Vercel), design the DB schema (including `user_properties` for multi-property), do a POC for server-side rendering one voucher first (de-risk section 6.3)
2. **Week 2:** Build the form + client-side Canvas live preview matching the mockup, build the Admin page for assigning properties to users
3. **Week 3:** Running number system (concurrency-safe, annual reset) + save/submit flow + email approval system
4. **Week 4:** Approver page (approve/reject), real file export (PNG/PDF RGB), History page for the Issuer
5. **Week 5:** QA around unusually long text/edge cases, concurrency testing, evaluate the existing Google Sheet for migration, go live
