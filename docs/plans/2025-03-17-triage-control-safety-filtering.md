# Triage Control, Safety & Filtering — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add undo after "Delete all auto-delete", confirmation modal with count before archiving, advanced filtering for triage and emails, and allowlist/blocklist sender rules.

**Architecture:** Phase 1 adds a read-only preview endpoint and confirmation UI, plus an undo endpoint that reuses action_log and Gmail batchModify (add INBOX). Phase 2 adds triage_sender_rules table, CRUD API, and triage.service integration. Phase 3 adds optional query params to queue and emails APIs plus filter UI.

**Tech Stack:** Existing stack (Express, TypeScript, SQLite/sql.js, vanilla TS client). No new deps.

**Design reference:** `docs/plans/2025-03-17-triage-control-safety-filtering-design.md`

---

## Phase 1: Clearer "Delete all" + Undo

### Task 1: GET /api/triage/auto-delete-preview

**Files:**
- Modify: `src/server/routes/triage.routes.ts`
- Modify: `src/server/services/gmail.service.ts` (if needed — check for listMessagesByLabel / getOrCreateLabel)

**Step 1:** Add route before `POST /execute-auto-delete`. Get auth, Gmail client, resolve label id for `Triage/Auto-Delete`, call `listMessagesByLabel` with maxResults 1 and pageToken to count, or list with maxResults 500 and count length (design says count only). Easiest: listMessagesByLabel with maxResults 500, page until no nextPageToken, sum lengths. Return `{ success: true, data: { count } }`.

**Step 2:** Register route: `router.get('/auto-delete-preview', requireAuth, async (req, res) => { ... })`.

**Step 3:** Manual test: GET `/api/triage/auto-delete-preview` with session cookie; expect 200 and `data.count` number.

**Step 4:** Commit with message: `feat(api): add GET /api/triage/auto-delete-preview`

---

### Task 2: Client — API method and confirmation modal for Delete all auto-delete

**Files:**
- Modify: `src/client/js/api-client.ts`
- Modify: `src/client/js/app.ts`
- Modify: `src/client/index.html`

**Step 1:** In `api-client.ts` add `getAutoDeletePreview(): Promise<ApiResponse<{ count: number }>>` calling `GET /api/triage/auto-delete-preview`.

**Step 2:** In `index.html` add a modal structure (e.g. `<div id="confirm-archive-modal" class="modal">` with overlay, title "Confirm archive", body "You are about to archive **N** emails.", buttons "Cancel" and "Archive N emails"). Hide by default (e.g. `display: none` or class `.hidden`). Ensure modal has `data-count` or an element to set count and button text.

**Step 3:** In `app.ts` change `handleExecuteAutoDelete`: first call `api.getAutoDeletePreview()`. If `data.count === 0`, show toast "No emails labeled for auto-delete" and return. If `data.count > 0`, show modal with N and "Archive N emails" button; on confirm close modal and run existing executeAutoDelete logic (disable button, call `api.executeAutoDelete()`, toast, loadDashboard). On Cancel close modal.

**Step 4:** Add minimal modal styles in `src/client/styles/main.css` (overlay, centering, buttons).

**Step 5:** Commit with message: `feat(ui): confirm modal for Delete all auto-delete using preview count`

---

### Task 3: Gmail move-back-to-inbox helper

**Files:**
- Modify: `src/server/services/gmail.service.ts`

**Step 1:** Add method `moveToInbox(messageIds: string[]): Promise<void>` that calls `this.batchModifyLabels(messageIds, ['INBOX'], [])`. Batch in chunks of 100 if needed (Gmail batchModify limit).

**Step 2:** Commit with message: `feat(gmail): add moveToInbox for undo`

---

### Task 4: POST /api/triage/undo-last-archive

**Files:**
- Modify: `src/server/routes/triage.routes.ts`
- Modify: `src/server/services/database.service.ts` (if no method to get recent archive_bulk log)

**Step 1:** In `database.service.ts` add `getLastArchiveBulkLog(userId: number, withinMinutes: number): { target_id: string; created_at: string } | null` — query action_log for `user_id = ? AND action_type = 'archive_bulk' AND status = 'success'` ordered by created_at DESC limit 1, and where created_at >= now - withinMinutes. Return target_id and created_at.

**Step 2:** In triage routes add `POST /undo-last-archive`, requireAuth. Get userId, call db.getLastArchiveBulkLog(userId, 2). If null return 404 or 400 "Nothing to undo". Parse target_id (comma-separated) to gmail ids. Get auth and GmailService, call gmailService.moveToInbox(ids) in batches of 100. Log action_log(userId, 'undo_archive', 'emails', target_id, 'success', undefined, { count: ids.length }). Return `{ success: true, data: { restored: ids.length } }`.

**Step 3:** Commit with message: `feat(api): add POST /api/triage/undo-last-archive`

---

### Task 5: Client — Undo after Delete all auto-delete

**Files:**
- Modify: `src/client/js/api-client.ts`
- Modify: `src/client/js/app.ts`

**Step 1:** In `api-client.ts` add `undoLastArchive(): Promise<ApiResponse<{ restored: number }>>` calling `POST /api/triage/undo-last-archive`.

**Step 2:** In `app.ts` after successful `executeAutoDelete()` (when response.data.archived > 0), show toast with "Archived N email(s). [Undo]" or a persistent small banner with "Undo" for 60 seconds. Store timeout; on "Undo" click call `api.undoLastArchive()`, show "Restored N to inbox", clear timeout, refresh dashboard. If 60s passes without undo, dismiss banner/toast.

**Step 3:** Commit with message: `feat(ui): undo last archive with 60s window after Delete all auto-delete`

---

## Phase 2: Allowlists / Blocklists

### Task 6: Schema and DB for triage_sender_rules

**Files:**
- Modify: `src/server/database/schema.sql`
- Modify: `src/server/config/database.ts` (ensure schema is run on init; may already run schema.sql)
- Modify: `src/server/services/database.service.ts`

**Step 1:** Add to `schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS triage_sender_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('allowlist', 'blocklist')),
    value TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, kind, value),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_triage_sender_rules_user_id ON triage_sender_rules(user_id);
```

**Step 2:** In `database.service.ts` add: `getSenderRules(userId: number): any[]`, `createSenderRule(userId: number, kind: string, value: string): number`, `deleteSenderRule(id: number, userId: number): boolean`. Implement with prepared statements.

**Step 3:** Run app or DB init to apply schema (or add migration step). Commit with message: `feat(db): add triage_sender_rules table and service methods`

---

### Task 7: Sender rules API

**Files:**
- Modify: `src/server/routes/triage.routes.ts`

**Step 1:** Add `GET /sender-rules` (requireAuth) → return `db.getSenderRules(userId)`. Add `POST /sender-rules` (requireAuth) body `{ kind, value }` — validate kind in ['allowlist','blocklist'], value non-empty string (email or @domain). Call `db.createSenderRule(userId, kind, value)`, return 201 with created row. Add `DELETE /sender-rules/:id` (requireAuth) — parse id, ensure rule belongs to userId, `db.deleteSenderRule(id, userId)`, return 204 or 404.

**Step 2:** Commit with message: `feat(api): GET/POST/DELETE /api/triage/sender-rules`

---

### Task 8: Triage service — apply allowlist/blocklist in scoring

**Files:**
- Modify: `src/server/services/triage.service.ts`
- Modify: `src/server/services/database.service.ts` (already have getSenderRules)

**Step 1:** In `triage.service.ts` at start of `generateTriageSuggestions` load rules once: `const rules = this.db.getSenderRules(this.userId)`. In `calculateTriageScore(email)` before computing score: check email.from_email (and domain) against rules. If allowlist match → return `{ emailId, actionType: 'review', confidenceScore: 0, reason: 'Allowlisted sender' }` and do not add to queue (or add with status that keeps it out of "archive" suggestions). If blocklist match → set score high (e.g. 85), set actionType to archive or archive_and_unsubscribe if hasUnsubscribe, reason include "Blocklisted sender". Implement domain match: rule.value starts with '@' then email.from_email domain (extract after @) must equal rule.value.slice(1); else exact match on email.

**Step 2:** Ensure createTriageItem is still called for blocklist items; for allowlist either skip createTriageItem or create with action_type 'review' only. Per design: allowlist → never suggest archive (skip or review only); blocklist → suggest archive. So: allowlist → return early with review, do not add to queue (or add as review). Blocklist → compute as now but force high score and archive action.

**Step 3:** Commit with message: `feat(triage): apply allowlist/blocklist in triage scoring`

---

### Task 9: UI for sender rules

**Files:**
- Modify: `src/client/index.html`
- Modify: `src/client/js/app.ts`
- Modify: `src/client/js/api-client.ts`
- Modify: `src/client/styles/main.css`

**Step 1:** In `api-client.ts` add `getSenderRules()`, `createSenderRule(body: { kind: string; value: string })`, `deleteSenderRule(id: number)`.

**Step 2:** In `index.html` add a "Sender rules" subsection in Triage view (or a collapsible section): list of rules (kind + value), "Add rule" with dropdown (Allowlist/Blocklist) and text input (placeholder "email@example.com or @domain.com"), delete icon per row. Give container id e.g. `sender-rules-section`.

**Step 3:** In `app.ts` when loading triage view (or on init of that view), fetch and render sender rules. On add: validate value, call createSenderRule, reload rules and triage queue. On delete: call deleteSenderRule(id), reload rules. Optional: "Add from sender" on triage row to prefill value.

**Step 4:** Commit with message: `feat(ui): sender rules (allowlist/blocklist) in triage view`

---

## Phase 3: Advanced Filtering and Search

### Task 10: Backend — filter params for triage queue

**Files:**
- Modify: `src/server/services/database.service.ts`
- Modify: `src/server/services/triage.service.ts`
- Modify: `src/server/routes/triage.routes.ts`

**Step 1:** Extend `getTriageQueue(userId, status, filters?)` to accept optional filters: `{ sender?: string, dateFrom?: string, dateTo?: string, actionType?: string, minConfidence?: number, search?: string }`. Build parameterized SQL: base query JOIN emails e ON tq.email_id = e.id WHERE tq.user_id = ? AND tq.status = ?; add AND e.from_email LIKE ? if sender (use %sender%); AND e.date >= ? if dateFrom; AND e.date <= ? if dateTo; AND tq.action_type = ? if actionType; AND tq.confidence_score >= ? if minConfidence; AND (e.subject LIKE ? OR e.from_email LIKE ? OR e.snippet LIKE ?) if search (use %search% for each). Bind params in order. Keep ORDER BY tq.confidence_score DESC, tq.created_at ASC.

**Step 2:** In triage routes GET /queue parse query: status, sender, dateFrom, dateTo, actionType, minConfidence, search. Pass to triageService.getTriageQueue(userId, status, filters).

**Step 3:** In TriageService.getTriageQueue pass filters to db.getTriageQueue. Commit with message: `feat(api): triage queue filter params (sender, date, actionType, confidence, search)`

---

### Task 11: Backend — filter params for emails list

**Files:**
- Modify: `src/server/services/database.service.ts`
- Modify: `src/server/routes/emails.routes.ts`

**Step 1:** Extend `getEmails(userId, limit, offset, filters?)` with optional filters: `{ sender?: string, dateFrom?: string, dateTo?: string, promotional?: boolean, search?: string }`. Build parameterized WHERE user_id = ? and add AND from_email LIKE ?, AND date >= ?, AND date <= ?, AND is_promotional = ?, AND (subject LIKE ? OR from_email LIKE ? OR snippet LIKE ?). Keep ORDER BY date DESC LIMIT ? OFFSET ?.

**Step 2:** In emails routes GET / parse query: limit, offset, sender, dateFrom, dateTo, promotional, search. Pass filters to db.getEmails. Commit with message: `feat(api): emails list filter params (sender, date, promotional, search)`

---

### Task 12: Client — filter UI for triage queue

**Files:**
- Modify: `src/client/index.html`
- Modify: `src/client/js/app.ts`
- Modify: `src/client/js/api-client.ts`

**Step 1:** In `api-client.ts` update `getTriageQueue(status?: string, filters?: { sender?: string; dateFrom?: string; dateTo?: string; actionType?: string; minConfidence?: number; search?: string })` to pass filters as query params.

**Step 2:** In triage view add filter bar: inputs/dropdowns for sender (text), date From/To (date or text), action type (dropdown: All, archive, unsubscribe, archive_and_unsubscribe, review), min confidence (number), search (text). "Apply" or apply on change. Store current filters in app state; when loading triage queue pass them to API.

**Step 3:** Render queue with current filters; when filters change re-fetch queue. Optional: persist filters in sessionStorage. Commit with message: `feat(ui): triage queue filter bar and API integration`

---

### Task 13: Client — filter UI for emails list

**Files:**
- Modify: `src/client/index.html`
- Modify: `src/client/js/app.ts`
- Modify: `src/client/js/api-client.ts`

**Step 1:** In `api-client.ts` update `getEmails(limit?, offset?, filters?)` to accept and pass filter query params.

**Step 2:** In emails view add filter bar: sender, date From/To, promotional (checkbox or All/Yes/No), search. Apply on change or Apply button; re-fetch emails with limit/offset and filters.

**Step 3:** Commit with message: `feat(ui): emails list filter bar and API integration`

---

## Execution Handoff

Plan complete and saved to `docs/plans/2025-03-17-triage-control-safety-filtering.md`.

**Two execution options:**

1. **Subagent-driven (this session)** — I dispatch a fresh subagent per task (or batch of small tasks), review between tasks, fast iteration. Use **subagent-driven-development** skill.

2. **Parallel session (separate)** — Open a new session (optionally in a worktree), use **executing-plans** skill, and run the plan in batches with checkpoints.

Which approach do you want?
