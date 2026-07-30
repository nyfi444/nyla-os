# Nyla OS — Implementation Progress Checklist
*Tracks actual code changes in `nyla-os.html` against the full blueprint (`NYLA_OS_BLUEPRINT.md`). Updated as work lands — not aspirational. Every ✅ below was verified live in the browser preview, not just written.*

---

## Original 10 reported problems

- [x] 1. Notes and ideas sometimes disappear → root-caused to hard deletes with no recovery path; ideas, calendar events, tasks, habits, bucket list items, projects, university courses/assignments now all route through Recently Deleted instead of being destroyed.
- [x] 2. Saving an idea to Notebooks does not work → fixed the wrong-storage-key bug, added read-back verification, bidirectional link, "Open Notebook Page" button, and a real folder picker (plus a follow-on bug where the wrong folder highlighted after opening a page — also fixed).
- [ ] 3. Google Drive exports sometimes lead to "file not found" → root cause confirmed (clipboard-copy + blank-Google-Doc flow, not a real Drive API) but the real fix needs a Firebase Cloud Function backend — **not built**.
- [x] 4. Dark mode inconsistent, white components → full audit done, 2 real bugs fixed (paste-popup, Graph View canvas).
- [ ] 5. Default Idea Bank items cannot be deleted → could not reproduce; no blocking code path found.
- [ ] 6. App feels like separate pages → meaningfully improved (idea↔task↔calendar↔notebook↔project cross-links, `_navigateTo` bridge) but no unified relations model app-wide.
- [x] 7. AI agents mostly chat, can't reliably act → built a real action pipeline (parse → plan → slot-filling → preview → approve → execute → verify → log → undo), wired into the Agent Office chat. Verified end-to-end with the exact "recurring class" example from the spec: agent proposed a task + 26 recurring events, the dashboard flagged the missing start date inline, approval created and verified all 27 real items, and Undo cleanly moved all of them to Recently Deleted.
- [ ] 8. Business section too basic → not started.
- [ ] 9. University section too basic → only Recently Deleted coverage added.
- [x] 10. Export/download tools inconsistent → shared `ExportMenu` now wired into 8 modules (Ideas, Notebook pages, Goals, Business Plans, University Assignments + GPA, Numerology, Astrology, Matrix of Destiny), with TXT/Markdown/DOCX/CSV/Print/Drive/Copy-link all working.

---

## PRIORITY 1 — Data Safety & Reliability — mostly done

- [x] Recently Deleted covers: Ideas, Calendar events, Tasks, Habits, Bucket List, Projects (new), Goals, Businesses, Notebook pages, University Courses/Assignments
- [ ] Files, Agent-created documents, Content plans — no underlying feature exists yet
- [x] No automatic 30-day deletion; manual permanent-delete requires confirmation
- [x] Save states: **Saving… / Saved / Offline / Sync Failed / Conflict**, real offline detection
- [x] Fixed a live data-loss bug (silent cloud-overwrite on the Firestore real-time listener) with a `_dirty`-tracked Conflict resolution UI
- [x] **Found and fixed a second, related bug**: the conflict-guard's "force apply on initial attach" logic also fired on every plain page refresh (not just fresh sign-ins), which could have silently overwritten unsynced local edits on refresh. Now the guard checks `_dirty` even on initial attach.
- [x] **Generic, reusable version history system** — wired into both **Ideas** and **Notebook pages** (debounced to one snapshot per 3 min for pages, since those autosave per keystroke), capped at 20 versions, non-destructive restore
- [x] **Refresh/reopen recovery** — `_dirty` now persists across reloads (`nylaos_dirty_flag`), so the app can tell if the last session ended before its cloud push finished; shows a reassurance toast and attempts a catch-up sync. Added a `beforeunload` warning if closing/refreshing with unsynced changes while signed in.
- [ ] Continuous per-field autosave with a universal local IndexedDB draft store — still only Notebooks have this; the rest of the app relies on synchronous localStorage writes (which are already durable, just not a formal "draft" layer)

## PRIORITY 2 — Idea Bank — nearly complete

- [x] Status, Priority, Business/life area, custom color, Revenue potential, Difficulty, Estimated cost, Estimated time, Research
- [x] Related businesses, Related notes (real notebook page links), Related agent chats (logged)
- [x] Version history per idea
- [x] Duplicate, Move, Archive, Convert to Task, Add to Calendar, Convert to Project, Send to Agent — all real and verified
- [x] Save to Notebook (fixed + folder picker), full `ExportMenu`
- [x] Confirmed defaults are editable/deletable
- [ ] Full-screen workspace (still expand-in-card + "More details" panel, not a dedicated screen)
- [ ] Attachments (file uploads)

### New: Projects system
- [x] Real `nylaos_projects` entity + panel — fixes a previously **dead nav tab** ("Projects" under Tasks existed with zero render branch)

## PRIORITY 3 — Notebooks — strong progress

- [x] Fixed the core save bug + added folder picker + version history
- [x] Fixed the folder-highlight-after-navigation bug
- [x] `ExportMenu` in the page toolbar
- [ ] Audio/video embeds, drawing/handwriting blocks, page covers, favorites/pinned/recently-viewed lists — not started

## PRIORITY 4 — Global Export System — much wider coverage now

- [x] Shared `ExportMenu` + TXT/Markdown/**DOCX** (HTML-as-.doc trick)/**CSV**/Print/Drive/Copy-link
- [x] Wired into: Ideas, Notebook pages, Goals, Business Plans, University Assignments, GPA Calculator, Numerology, Astrology, Matrix of Destiny (8 modules)
- [ ] AI responses, Content calendars, Book notes, syllabus summaries — not wired (some don't exist as features yet)
- [ ] Real Google Drive API workflow — needs a Firebase Cloud Function backend (infrastructure decision)

## PRIORITY 5 — AI Agents (action-taking) — core pipeline done

- [x] Real Action Pipeline: parse → build plan → detect missing required fields → **preview panel** → Approve All / Edit Actions / Cancel → execute sequentially → **verify each write** → log → **undo**
- [x] Multi-action support — a single agent reply can propose several actions together (task + recurring event, etc.), shown as one reviewable plan, matching the "launch plan" multi-step spec example
- [x] Slot-filling for missing info — verified with the spec's exact example ("class Monday/Wednesday/Friday at 10am"): agent proposes `addRecurringEvent` with what it knows, dashboard flags the missing required field (start date) with an inline input, blocks Approve until filled
- [x] Action types wired: addTask, addGoal, addEvent, addRecurringEvent, addNote (Notebook page), addIdea
- [x] Agent Activity Log — visible from the AI Agents page, shows every batch (agent, timestamp, each action + status)
- [x] Undo system — session-scoped "Undo this batch" button after any executed plan; reverses by moving every created item into Recently Deleted (never a second, parallel undo mechanism — reuses the same trash system as everything else)
- [x] Basic permission ceiling — agents can create/edit but the executor has no delete capability at all (not just "off by default" — the action spec set contains no delete action)
- [x] Failure handling — a failed step (missing field, verify-failed, thrown error) is flagged inline in the plan/summary without blocking sibling steps
- [ ] Not yet covered: updateTask, editTask, updateBusinessData, createStudyGuide, processSyllabus, createSocialMediaPlan, createReport, voice-brain-dump processing — the pipeline/preview mechanism is generic and built to extend, but only 6 concrete action types exist so far
- [ ] Legacy single-action `execAgentCmd`/`[CMD:]` path left untouched for the Floating Quick Chat (lower-stakes, single-action assistant) — only the Agent Office chat uses the new multi-action pipeline

## PRIORITY 6 — Live Agent Office
- [ ] Agent roster/cards/chat exist (pre-existing), now with real action-taking wired in — but the specific "desk," status (Available/Thinking/Working/etc.), and per-agent permission/folder-access editor from the spec are **not built**.

## PRIORITY 7 — Voice Brain Dump
- [ ] Not started. (Would reuse the same intent-classification approach as Priority 5 once that exists.)

## PRIORITY 8 — University
- [x] Courses and Assignments route through Recently Deleted; GPA/Assignments have export
- [ ] Syllabus pipeline, dashboard redesign — not started

## PRIORITY 9 — Business Section
- [ ] Not started (Business Plan editor now has full export, but modules/personalization untouched)

## PRIORITY 10 — Social Media Content Tracker
- [ ] Not started. Section doesn't exist yet.

## PRIORITY 11 — Book Section
- [ ] Not started. Section doesn't exist yet.

## PRIORITY 12 — Cosmic Section (remove Moon Phase)
- [x] **Done and verified.**

## PRIORITY 13 — Dark Mode & Appearance
- [x] Full audit done; both real bugs fixed
- [ ] Formal named theme-token system, full appearance settings expansion — not started

---

## Net new capabilities added this session (not explicit blueprint line items, but load-bearing)

- [x] Sync conflict guard + refresh-safe dirty tracking (two related data-loss bugs found and fixed)
- [x] `window._navigateTo` global cross-section navigation bridge
- [x] `TrashPanel`/`addToTrash` support multiple types per view
- [x] Generic, reusable version history system (used by 2 entity types so far, ready for more)
- [x] Real Projects entity (fixed a dead nav tab)
- [x] Shared export utilities now support DOCX and CSV, not just TXT/Markdown/Print
- [x] Generic agent Action Pipeline (`AGENT_ACTION_SPECS`, `buildActionPlan`, `ActionPreviewPanel`, `executeActionPlan`, `undoActionBatch`) — reusable scaffolding, only 6 action types plugged in so far but built to extend
- [x] Agent Activity Log (`nylaos_agent_activity_log`) and session-scoped batch undo, both generic and reusable beyond agents if needed later

---

## Suggested next block of work (unprioritized until you confirm)

1. Live Agent Office UI (Priority 6) — desks, live status (Available/Thinking/Working/etc.), per-agent permission/folder-access editor. Builds directly on the action pipeline from this session.
2. Voice Brain Dump (Priority 7) — reuse the action-pipeline's parsing approach for transcript → categorized items.
3. Extend the agent action pipeline itself: more action types (updateTask, editTask, updateBusinessData, createStudyGuide, processSyllabus, createSocialMediaPlan, createReport).
4. University syllabus pipeline + dashboard redesign.
5. Business section per-venture modules + Idea Bank → new venture flow.
6. Real Google Drive backend (Cloud Function) — needs your sign-off, new infrastructure.
7. Social Media tracker, Books section — net-new modules, largest remaining builds.
8. Formal theme-token system + full Appearance settings expansion.
