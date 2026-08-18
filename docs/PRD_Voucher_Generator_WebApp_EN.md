# PRD: Dynamic Room Voucher Generator Web App
**Product:** Lub d Room Voucher Issuing System
**Version:** 0.9 (Updated to match the shipped implementation)
**Status:** Live — core flow built and in use; this document reflects actual behavior

---

## 1. Background & Problem Statement

Today the team (e.g. Marketing / Reservations) issues Room Vouchers to guests/influencers manually (editing a Photoshop or Canva file per voucher), which causes:
- High time cost per voucher, doesn't scale as request volume grows
- No centralized running number system → risk of duplicate or skipped numbers
- No audit trail of who issued a voucher, who approved it, or when
- No status tracking (Pending / Approved / Rejected)

**Goal:** Build a web app where an Issuer fills out a form → sees a live preview instantly → sends it for approval → the Approver approves via an email link → the system generates print-quality JPEG/PDF files, with running numbers and status tracked automatically.

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
| **Front Office** (added post-launch, not in the original mockup) | Looks up approved/claimed vouchers for guests at check-in, marks a voucher `claimed` and records `claim_by` / `reservation_no`, can preview (watermarked, non-downloadable) the rendered voucher to compare against what the guest presents — cannot create, approve, or export vouchers | Login + role = front_office, scoped to assigned properties like Issuer |
| **Admin** | Manages the Approver list, views all vouchers from everyone, edits/cancels vouchers, configures template/coordinates, **assigns properties to each user (a user can be assigned multiple properties)** | Login + role = admin |

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
   - Sends an email to the Approver via Gmail/Google Workspace SMTP (revised from Resend, see section 10) with a signed URL link
6. Approver opens the link (no login) → sees a read-only preview page + Approve / Reject buttons
7. If **Approved** → adds a signature/approval date onto the voucher → renders the real files (JPEG + PDF) → status changes to `approved` (directly claimable — see section 7 for why there's no separate `claimable` status) → immediately downloadable via a private, unguessable short link (`/v/{share_code}`) + emails the Issuer that it's been approved with the link
8. If **Rejected** → enters a reason (text) → status changes to `rejected` → notifies the Issuer by email → **returns the reserved running number back into the pool** (see 6.4)
9. Issuer visits the "History" page to see the status of every voucher ever issued, searchable/filterable by status or date range

---

## 5. Form Fields — Detailed Spec from the Mockup

| Field | Type | Options / Validation | Notes |
| --- | --- | --- | --- |
| Running No. (Last / Current) | Read-only, auto | Format: `{2-digit BE year}/{Property Code}{3-digit running number}`, e.g. `26/LDCH099` | ⚠️ Real data shows the "Lub d Koh Samui" property used code `SAMUI`, not following the `LD`+abbreviation pattern (e.g. `26/SAMUI004`) — needed to confirm whether to enforce one format across all properties or let Admin set a prefix per property |
| Room Type | Multi-select (checkbox), required, min 1, **max 3** | ✅ **Confirmed:** capped at 3 room types per voucher, enforced both client-side and server-side (`MAX_ROOM_TYPES` in `src/lib/voucher/types.ts`) so the line always fits the printed template | Pulled from a per-property master list (`room_types` table) managed in the Admin page, which supports inline add/rename/deactivate — as originally proposed |
| Number of Nights | Stepper (+/-), min 1 | Integer, no fixed max in the shipped implementation | — |
| Number of Vouchers | Stepper (+/-), min 1, **max 50** | ✅ **Confirmed:** capped at 50 per submission. Can issue multiple vouchers per batch — 1 submission = N sequential running numbers generated | Major impact on the running-number logic (see 6.4) |
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
| **Claim by** | Free text stating who is claiming/where to claim (e.g. "Contact Lub d Bangkok Chinatown", "Guest Experience Leader Chinatown") | ✅ **Shipped:** `claim_by`, filled in by Front Office (see section 3) when status changes to `claimed`, via `claim_voucher(voucher_id, claim_by, reservation_no)` |
| **Reservation No.** (not in the original sheet, added during build) | Free text, optional | ✅ **Shipped:** `reservation_no`, captured at the same time as `claim_by` — links the voucher to the guest's actual hotel reservation record for front-desk reference |
| **File** | Reference filename/link (currently appears to reference a Google Drive folder name) | ✅ **Shipped, different from proposal:** not a stored URL — `exported_jpeg_path` / `exported_pdf_path` hold private Storage paths, resolved to short-lived signed URLs on demand, or accessed by anyone with the link via the public but unguessable `/v/{share_code}` route |
| **Additional statuses** | Besides Claimable/Claimed found in real data, the sheet's legend also lists `Expired` and `Revoked` | ✅ **Shipped, see section 7 for the resolved design:** `expired` and `revoked` both exist in the status enum; `claimable` as a distinct status does not — see section 7 |

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
- **High-quality export (JPEG/PDF for print):** rendered **server-side** (not client-side `html2canvas`) in order to:
  - Guarantee resolution control regardless of the user's browser/device
  - Prevent file tampering (if rendered client-side and uploaded, a user could alter values in DevTools before export)
  - Node-side libraries used: `node-canvas` (for drawing) + `pdf-lib` (`embedJpg`, for composing into PDF)

> ✅ **Confirmed, shipped:** `node-canvas` deploys and runs fine on Vercel (Node.js runtime, not Edge — export routes set `export const runtime = "nodejs"`). No fallback to Satori/`@vercel/og` was needed.

> ✅ **Confirmed (revised from PNG):** the canvas is rendered once and encoded to **JPEG at quality 80** (`EXPORT_JPEG_QUALITY` in `src/lib/voucher/export.ts`), used both as the downloadable image and embedded directly into the PDF via `pdf-lib`'s `embedJpg` (which keeps the JPEG bytes as-is, unlike `embedPng`'s decode-and-reflate). This was chosen after generating and visually comparing real output at multiple quality levels (60/70/80/92) — quality 80 cut per-voucher storage from ~3.6MB to ~767KB with no visible quality loss, which matters materially given Supabase's free-tier storage limit (see section 9). **RGB** color throughout, no CMYK conversion.

### 6.4 Running Number — Concurrency & Multi-Voucher Issue
The most critical issue for this system is that **running numbers must never duplicate**, even if 2 people issue vouchers at the same time:
- Use a **PostgreSQL sequence or `SELECT ... FOR UPDATE` within a transaction** via Supabase (never compute the next number client-side and write it back — this causes a race condition)
- When "Number of Vouchers" > 1, reserve a range of running numbers within a single transaction — e.g. requesting 5 vouchers reserves `26/LDCH099` through `26/LDCH103` atomically
- If the Approver clicks **Reject** → ✅ **Confirmed:** the running number returns to the pool for reuse, but the original record remains in the Log/History with status `rejected` (never deleted), so an audit can look back and see this number was previously requested and rejected
- ✅ **Confirmed:** Running numbers reset to 001 every year, prefixed with the 2-digit Buddhist-era year — e.g. `26/LDCH001` in 2026 (BE 2569), `27/LDCH001` when the year rolls to 2027 (BE 2570) — matches the `running_number_counters (property_id, year, last_number)` schema already designed in section 8

---

## 7. Approval System & Email

- Gmail/Google Workspace SMTP (revised from Resend, see section 10) sends an email to the Approver with a signed link (a DB-generated token bound to `voucher_id` + expiry)
- The link must **expire** (recommend 7 days) and be usable for a single action only (prevents double-approval / use after expiry)
- The Approve/Reject page for the Approver must be a public route, but the token must be verified server-side every time — **never trust any value sent from the client without checking against the DB**
- Status flow: `pending_approval` → `approved` → `claimed` | `rejected` | `expired` (auto, once past the Validity End Date) | `revoked` (manual, always requires a reason — see section 11)

> ✅ **Confirmed, resolved from earlier draft:** `claimable` as a separate status was dropped during implementation — `approved` already means the file exists and is immediately downloadable/claimable, so an intermediate `claimable` state added nothing distinguishable. The DB status enum (section 8) does not include it. A voucher moves `approved` → `claimed` directly when Front Office claims it (recording `claim_by`/`reservation_no`), or `approved` → `expired`/`revoked` if neither happens first.
- The **downloadable file itself is also status-gated**, not just the DB row: the `/v/{share_code}` short link (see 6.3/9) checks status server-side on every request and stops serving the JPEG/PDF once a voucher is `claimed`, `revoked`, or `expired` — so a link that was shared before claiming can't be used to re-download after the fact.

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
  property_id bigint references properties, -- ✅ Shipped as bigint identity, not uuid — properties/room_types/approvers all use bigint identity ids; only vouchers/profiles use uuid
  room_type_ids bigint[] not null,       -- ⚠️ changed to array — real data shows multiple room types per voucher; capped at 3 (see section 5)
  nights int not null,
  breakfast_included boolean not null,   -- ⚠️ changed to boolean per real data (was an enum in v0.2)
  blackout_type text check (blackout_type in ('default','custom')),
  blackout_text text,
  validity_start date not null,
  validity_end date not null,
  note text,                             -- maps to "Remark" in the existing sheet
  issuer_id uuid references profiles,    -- maps to "Requested By"
  approver_id bigint references approvers, -- maps to "Approved By" — ✅ shipped as a *separate* approvers table (id, name, email, is_active), not a login-capable user account; see approver_properties below for the property-scoping join
  claim_by text,                         -- ✅ Shipped: filled in by Front Office at claim time
  reservation_no text,                   -- ✅ Shipped, new field not in the original mockup: captured alongside claim_by, links to the guest's hotel reservation
  status text check (status in ('pending_approval','approved','claimed','rejected','expired','revoked')) default 'pending_approval', -- ✅ Shipped without a separate 'claimable' status — 'approved' is directly claimable (see section 7); the DB check constraint still lists 'claimable' as a historical artifact but no code path ever sets it
  approval_token text,
  approval_token_expires_at timestamptz,
  approved_at timestamptz,
  rejected_reason text,
  expired_at timestamptz,                -- ✅ Confirmed: set automatically by a daily cron job (api/cron/expire-vouchers) once past validity_end while still 'approved'
  revoked_at timestamptz,                -- ✅ Confirmed: manual action only, any account with permission
  revoked_by uuid references profiles,
  revoked_reason text,                   -- ✅ Confirmed: required whenever a voucher is revoked
  exported_jpeg_path text,               -- ✅ Shipped as 'path', not 'url': a private Storage object path, not a public URL — renamed from an earlier exported_png_url once export switched from PNG to JPEG
  exported_pdf_path text,
  share_code text unique,                -- ✅ Shipped, not in the original design: short random token powering the public but unguessable /v/{share_code} download link, generated at approval time
  created_at timestamptz default now()
)

-- approvers (✅ shipped as a lightweight standalone entity — no login, receives email + approves via a
-- tokenized link only, so it doesn't need an auth.users/profiles row of its own)
approvers (id, name, email, is_active)

-- approver_properties (mapping for which properties each approver can act on, same shape as user_properties)
approver_properties (approver_id, property_id)

-- running_number_counters
running_number_counters (property_id, year, last_number int)
```

---

## 9. Non-Functional Requirements

| Category | Requirement |
| --- | --- |
| **Performance** | Preview updates < 300ms after typing/changing a value; real file export < 3 seconds (revised from the original "under 1 second" target, since server-side rendering + PDF composition typically takes longer than client-side canvas — expectations need to be set accordingly) |
| **Cost** | Target $0/month in the MVP phase using free tiers: Supabase (500MB DB, 1GB storage), Vercel Hobby, Gmail/Google Workspace SMTP for outbound email (not Resend, see section 10) — **usage must be monitored** since exceeding the free tier incurs immediate cost. JPEG quality 80 (~767KB/voucher) was chosen specifically to stretch Supabase's free 1GB Storage tier further than the original PNG output (~3.6MB/voucher) would allow |
| **Security** | Storage is private end-to-end: `vouchers`/`templates`/`signatures` buckets have no public or anon/authenticated read access at all — every file is served via a fresh, server-generated signed URL or the unguessable `/v/{share_code}` route, never a stored public URL. RLS (Row Level Security) on Supabase scopes every table to the caller's assigned properties (or admin); the approver flow authorizes via `approval_token` possession, checked server-side, not a stored public link |
| **Availability** | No formal SLA in phase 1 (running on free tiers, which don't guarantee uptime) |
| **Export Format** | ✅ **Confirmed (revised from PNG):** always export both **JPEG (quality 80)** and PDF (not either/or), with **RGB** as the standard color mode — see section 6.3 for why JPEG replaced PNG |
| **Browser Support** | Latest Chrome/Edge/Safari — no need to support IE |
| **Localization** | ✅ **Confirmed:** primarily English per the current mockup (no need to support Thai on the voucher in this phase) |

---

## 10. Tech Stack (Summary + Rationale)

| Component | Technology | Additional Notes |
| --- | --- | --- |
| Frontend | Next.js (React) | Chosen because it supports both client-side canvas (preview) and server routes (export) in a single project |
| Canvas Preview | HTML5 Canvas API directly (not relying on `html2canvas` for the real file) | `html2canvas` is good for a fast preview but not recommended as the official output file |
| Export Engine | Server-side render — `node-canvas` + `pdf-lib` | ✅ Shipped as originally proposed; see section 6.3 |
| Backend & DB | Supabase (Postgres + Auth + Storage) | RLS helps with data isolation between Issuers |
| Email | ✅ **Shipped, revised from Resend:** Gmail/Google Workspace SMTP directly (`nodemailer`), configurable per-org via env vars or the Admin → Email panel | Avoids a third-party ESP dependency/account; see `src/lib/email/mailer.ts` |
| Hosting | Vercel | Fully supports Next.js, but must check the serverless function timeout limit (Hobby plan = 10s) is enough for the export process |

---

## 11. Decisions Confirmed & Remaining Open Questions

**Confirmed:**
1. ✅ One approver per request (no multi-level approval)
2. ✅ Running numbers reset to 001 every year, prefixed with the 2-digit BE year — e.g. `26/LDCH001` → `27/LDCH001`
3. ✅ When Rejected, the running number returns to the pool for reuse, but the Log/History still records that it was rejected
4. ✅ Multi-property support from the start — Admin assigns which users can see which properties (a user can be assigned multiple properties), with running numbers and files still running independently per property, never combined
5. ✅ Always export both JPEG (quality 80, revised from PNG) and PDF, with RGB as the standard color
6. ✅ Primarily English, no need to support Thai on the voucher in this phase
7. ✅ Room Type capped at 3 selections per voucher; Number of Vouchers capped at 50 per submission
8. ✅ No separate `claimable` status — `approved` is directly claimable; the download link is status-gated server-side instead (stops serving the file once `claimed`/`revoked`/`expired`)
9. ✅ A fourth role, Front Office, was added post-launch to handle claim-time lookups at check-in (not in the original 3-role mockup)

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
6. Set up a scheduled job to auto-expire vouchers that have passed the Validity End Date while still `approved` (shipped as `api/cron/expire-vouchers`, daily Vercel Cron)

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
4. **Week 4:** Approver page (approve/reject), real file export (JPEG/PDF RGB), History page for the Issuer
5. **Week 5:** QA around unusually long text/edge cases, concurrency testing, evaluate the existing Google Sheet for migration, go live
