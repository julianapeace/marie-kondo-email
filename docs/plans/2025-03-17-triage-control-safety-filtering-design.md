# Triage Control, Safety & Filtering — Design

**Date:** 2025-03-17  
**Status:** Approved

## 1. Scope

- **Undo / soft delete** — Time-limited "Undo" after "Delete all auto-delete" that moves the just-archived messages back to Inbox.
- **Clearer "Delete all auto-delete"** — Show count and require explicit confirmation before archiving.
- **Advanced filtering and search** — Filter triage queue and scanned emails by sender, date, action type, confidence, search phrase.
- **Allowlists / blocklists** — Per-user sender/domain rules: blocklist → suggest archive; allowlist → never suggest archive.

## 2. Undo / Soft Delete

- After "Delete all auto-delete", show an "Undo" action for a short window (e.g. 30–60s). Undo = add `INBOX` label to those messages (Gmail: move back to Inbox).
- Use existing `action_log`: we log `archive_bulk` with `target_id` = comma-separated Gmail IDs. New endpoint `POST /api/triage/undo-last-archive`: find latest successful `archive_bulk` for user within last N minutes (e.g. 2), parse `target_id`, call Gmail `batchModify` with `addLabelIds: ['INBOX']`, log `undo_archive`. Optionally mark log entry as "undone" to prevent double-undo.
- One undo per run; only the most recent run in the window is undoable.

## 3. Clearer "Delete All Auto-Delete"

- New `GET /api/triage/auto-delete-preview` returning `{ count }` (messages with label `Triage/Auto-Delete`). Read-only.
- UI: On "Delete all auto-delete" click → call preview; if count > 0 show confirmation modal: "You are about to archive **N** emails. [Cancel] [Archive N emails]." On confirm, call existing `POST /api/triage/execute-auto-delete`.
- Optional: rename button to "Archive all auto-delete"; modal title "Confirm archive".

## 4. Advanced Filtering and Search

- **Triage:** Optional query params on `GET /api/triage/queue`: `sender`, `dateFrom`, `dateTo`, `actionType`, `minConfidence`, `search` (subject/sender/snippet). Backend extends `getTriageQueue` with parameterized WHERE (JOIN emails). Keep ordering (confidence DESC, created_at ASC).
- **Emails:** Optional params on `GET /api/emails`: `sender`, `dateFrom`, `dateTo`, `promotional`, `search`. Extend `getEmails` with same idea; keep limit/offset.
- **UI:** Filter bar on Triage (action type, date range, min confidence, search); same idea on Emails. Optional: persist in sessionStorage or URL.

## 5. Allowlists / Blocklists

- **Data model:** New table `triage_sender_rules`: `user_id`, `kind` ('allowlist' | 'blocklist'), `value` (email or `@domain`), `created_at`. Unique `(user_id, kind, value)`.
- **Semantics:** Blocklist → always suggest archive (high confidence / archive action). Allowlist → never suggest archive (skip queue or add as "review" only).
- **Triage:** In `triage.service.ts`, before/inside `calculateTriageScore`: load user rules; if from_email or domain matches allowlist → return "review" / skip queue; if blocklist → add with archive (or archive_and_unsubscribe if unsubscribe exists). Match: exact email or domain (`@company.com` → `*@company.com`).
- **API:** `GET /api/triage/sender-rules`, `POST /api/triage/sender-rules` (body `{ kind, value }`), `DELETE /api/triage/sender-rules/:id`. Validate: value required; email or `@domain`.
- **UI:** "Sender rules" section (Triage or Settings): list rules, add (kind + value), delete. Optional: "Add from sender" from triage row.

## 6. Data and API Summary

- **New table:** `triage_sender_rules` (user_id, kind, value, created_at).
- **New endpoints:**  
  - `GET /api/triage/auto-delete-preview` → `{ count }`  
  - `POST /api/triage/undo-last-archive` → `{ restored: number }`  
  - `GET /api/triage/queue?status=&sender=&dateFrom=&dateTo=&actionType=&minConfidence=&search=`  
  - `GET /api/emails?limit=&offset=&sender=&dateFrom=&dateTo=&promotional=&search=`  
  - `GET /api/triage/sender-rules`, `POST /api/triage/sender-rules`, `DELETE /api/triage/sender-rules/:id`
- **Gmail:** Use existing `batchModifyLabels(ids, ['INBOX'], [])` for undo.

## 7. Phasing

- **Phase 1:** Clearer "Delete all" (preview + confirmation modal); Undo (endpoint + UI).
- **Phase 2:** Allowlists/blocklists (table, API, triage integration, UI).
- **Phase 3:** Advanced filtering (triage + emails API + filter UI).
