# Nyla OS — Product Blueprint v2
*Personal Life Operating System — Full Redesign Specification*

Grounding notes (from current codebase audit, `nyla-os.html`, 7,324 lines):
- Single-file React 18 app, in-browser Babel, no bundler/build step.
- Persistence: `localStorage` (primary) + Firebase Firestore (cross-device sync).
- There is **no application backend today**. "Google Drive export" is currently a static link to `drive.google.com` — no OAuth, no Drive API.
- AI agents already call the Anthropic API directly from the client and have a basic command parser (`execAgentCmd`) that can act on replies — this is extended, not invented from scratch.
- Moon Phase lives under Cosmic sub-nav and has a dedicated render branch — safe to remove with a redirect.
- No PDF/DOCX generation libraries are loaded yet.

This changes what's *actually* buildable client-side vs. what requires a thin backend (Firebase Cloud Functions), and that distinction is threaded through this entire document, especially the handoff section.

---

## 1. Revised Information Architecture

```
Nyla OS
├── Home (command center / daily dashboard)
├── Calendar
├── Tasks
├── Idea Bank
├── Notebooks
├── Goals
├── Business
│   ├── Lunar Love
│   ├── Halo House Collective
│   ├── Dashboard (agency)
│   └── [+ New Venture]
├── University
├── Social Media
├── Books
├── Cosmic
│   ├── Numerology
│   ├── Astrology
│   └── Matrix of Destiny
├── Period Tracker
├── AI Agents (Live Agent Office)
├── Recently Deleted (system-wide, reachable from every module)
└── Settings
    ├── Appearance
    ├── Accounts & Connections (Google Drive, etc.)
    ├── Agent Permissions
    ├── Export History
    └── Data & Backups
```

**Cross-cutting systems** (not nav destinations, but present everywhere):
- Global save-state indicator (top bar)
- Global export menu (attached to any content object)
- Recently Deleted (accessible from a persistent Settings link + contextual "Restore" prompts)
- Universal search / command palette (⌘K) — searches ideas, notes, tasks, businesses, agents, books
- Voice Brain Dump launcher (floating action button, available from Home/Tasks/Notes)

**Design principle:** every object (idea, note, task, event, business, book) is a **node**, not a page. Nodes carry a `relations` map so the system can render "Related" rails anywhere. This is what makes Nyla OS feel connected instead of a folder of separate tools.

---

## 2. Navigation Structure

- **Primary nav (left sidebar, desktop):** Home, Calendar, Tasks, Idea Bank, Notebooks, Goals, Business, University, Social Media, Books, Cosmic, Period, AI Agents, Settings.
- **Secondary nav (sub-tabs):** shown as a horizontal strip under the page header, mirrors current `NAV` sub-array pattern already in the codebase.
- **Business primary nav is a switcher**, not a flat sub-tab list: a business picker (avatar/logo chips) at the top of the Business section, then module tabs *scoped to whichever modules that business actually has enabled* (see Priority 9 — no forced identical modules).
- **Global top bar**, present on every screen:
  - Save-state pill (Saving… / Saved / Offline / Sync Failed / Conflict)
  - ⌘K search
  - Voice Brain Dump mic icon
  - Notifications bell (agent completions, deadline alerts, conflict warnings)
  - Recently Deleted icon (trash, badge count)
- **Mobile:** bottom tab bar with 5 slots (Home, Calendar, Tasks, Agents, More) — "More" opens a full-screen grid of remaining sections, same pattern as current `MobileSubTabs` component, extended.
- **Removing Moon Phase:** delete from `NAV` cosmic `sub` array, delete render branch, and add a one-time redirect map `{'Moon Phase': 'Numerology'}` so any saved deep link or widget reference resolves instead of 404-ing internally.

---

## 3. Page-by-Page Feature Requirements

### 3.1 Home
- Today strip: calendar events, due tasks, period phase chip, agent notifications.
- "Continue where you left off" rail: last 5 edited notes/ideas/pages (uses `updatedAt`, not `createdAt`).
- Business health snapshot cards (one per active business, health score + current priority).
- Quick capture bar: type or use mic → routes into Voice Brain Dump triage screen.
- Recently Deleted reminder chip only appears if something was deleted in the last 24h ("3 items moved to Recently Deleted — Undo").

### 3.2 Calendar
- Month / Week / Day / Agenda views.
- Event types: personal, class (university-linked), business milestone (business-linked), content publish date (social-linked), recurring.
- Conflict detection: overlapping events get a red hairline + "Resolve conflict" affordance.
- Every event card shows its origin (manually created / from Agent / from Syllabus / from Content Calendar) with a link back to source.

### 3.3 Tasks
- Views: List, Board (by status), Board (by business/life-area).
- Task fields: title, notes, due date, priority, business/life-area tag, related idea, related goal, subtasks, recurrence.
- Bulk actions: complete, move, delete (→ Recently Deleted), convert to project.

### 3.4 Idea Bank (full detail in Priority 2 below)

### 3.5 Notebooks (full detail in Priority 3 below)

### 3.6 Goals
- Goal fields: title, description, target date, life-area/business, progress %, linked tasks, linked ideas, milestones.
- Progress auto-rolls up from linked task completion when the goal has ≥1 linked task; otherwise manual slider.

### 3.7 Business (full detail in Priority 9)

### 3.8 University (full detail in Priority 8)

### 3.9 Social Media (full detail in Priority 10)

### 3.10 Books (full detail in Priority 11)

### 3.11 Cosmic
- Numerology, Astrology, Matrix of Destiny only. Each report has the Global Export menu attached.

### 3.12 Period Tracker
- Unchanged scope, but gains theme-token dark mode compliance and Recently Deleted for logged entries.

### 3.13 AI Agents / Live Agent Office (full detail in Priority 5 & 6)

### 3.14 Settings
- Appearance (Priority 13), Accounts & Connections, Agent Permissions, Export History, Data & Backups (manual "Export all data as JSON" + "Import" for user-owned backup, independent of Drive).

---

## 4. User Flows

### 4.1 Save an Idea to a Notebook (fixes current broken flow)
1. User opens an idea → clicks **Save to Notebook**.
2. Modal: select existing Notebook + Folder, or "Create new notebook/folder" inline.
3. User clicks **Save**.
4. System state → `Saving…` pill shown in modal.
5. Backend/local write: create Notebook page record with idea's title, description, tags, attachments copied by reference.
6. System **reads back** the created page from the store to confirm it exists (not just that the write call resolved without throwing).
7. On confirmed existence: link `idea.relatedNotebookPageId ⇄ page.sourceIdeaId`, close modal, toast "Saved to Notebook", and show a persistent **Open Notebook Page** button on the idea card.
8. On failure at step 6 (write appeared to succeed but page not found on read-back): do NOT show success. Show "Save Failed — Retry" and log to Agent/Sync error log. This directly targets bug #2.

### 4.2 Recover from a lost connection while editing
1. User is editing a Notebook page; Wi-Fi drops mid-keystroke.
2. Autosave (every content change, debounced 800ms) writes to local IndexedDB draft store regardless of network.
3. Top bar pill flips `Saving…` → `Offline` after failed sync attempt.
4. All further edits keep saving locally; a badge shows "3 changes pending sync."
5. Network returns → automatic retry with exponential backoff (1s, 3s, 8s, 20s, then every 30s) → pill flips to `Saving…` → `Saved`.
6. If the remote copy changed in the meantime (another device edited it), do NOT silently overwrite — go to Conflict flow (4.3).

### 4.3 Conflict resolution
1. Sync detects remote `updatedAt` newer than the local draft's `baseVersion`.
2. Pill shows `Conflict`. Clicking it opens a side-by-side diff: "Your version" vs "Synced version."
3. Options: **Keep mine** (creates new version, old remote version preserved in Version History), **Keep synced** (discards local draft, local draft archived to Recently Deleted as a safety net), **Merge manually** (opens both in a merge editor for rich text; for structured data like task fields, field-by-field radio choice).

### 4.4 Restore a deleted idea
1. User goes to Recently Deleted → filters by type "Ideas."
2. Sees deleted idea with deleted date, deleted-by (user/agent), and a preview.
3. Clicks **Restore** → idea reappears in Idea Bank in its original board/status, all relations intact.
4. Clicks **Delete Permanently** → confirmation modal ("This cannot be undone. Type DELETE to confirm") → hard delete.

### 4.5 Agent multi-step action (Lunar Love launch plan example)
1. User: "Create a launch plan for Lunar Love, save it to my business notebook, add the milestones to my calendar and create a downloadable PDF."
2. Agent parses intent → builds an **Action Plan** object: `[create_document, create_notebook_page, create_calendar_events(x8), generate_pdf]`.
3. Agent shows **Preview Panel**: "1 document will be created · 1 Notebook page will be created · 8 calendar events will be created · 1 PDF will be generated." Each line expandable to see exact contents.
4. User clicks **Approve All**, **Edit Actions** (opens inline editors per action, e.g. remove 2 of the 8 events), or **Cancel**.
5. On approval, actions execute sequentially; each shows a live checklist item flipping from ⏳ to ✅ (or ⚠️ on failure, without blocking the rest of the queue).
6. Final summary card: links to the document, the Notebook page, the calendar (jump to first milestone), and the PDF download — plus "Undo All" (reverses every successfully-completed action in the batch, moving created items to Recently Deleted / removing calendar events).

### 4.6 Voice Brain Dump
1. User taps mic FAB, speaks freely.
2. Transcript streams live (captions).
3. On stop, agent classifies each utterance/sentence into a bucket (Tasks, Calendar, Ideas, Notes, Shopping, Content Ideas, Follow-ups) using the same intent classifier as chat agents.
4. **Review screen**: grouped by bucket, each item as an editable card with a bucket-reassignment dropdown, edit-in-place text, and a delete (x) icon.
5. User clicks **Approve & Save** (or per-bucket "Save this section"). Only after this does anything get written — nothing is auto-committed from voice.

### 4.7 Syllabus upload (University)
1. User uploads file/paste text → system extracts structured fields (see Priority 8 list) using the document-parsing agent.
2. **Review screen**: every extracted field editable, with confidence flags on anything the parser is unsure about (e.g. "Instructor email — low confidence, please verify").
3. User approves → system creates: Course record, recurring calendar meetings, assignment/exam events with reminders, a Course Notebook (with syllabus PDF attached as first page), semester timeline, grade tracker shell, and a suggested study plan draft.
4. Confirmation screen lists everything created with jump links, same pattern as 4.5.

---

## 5. Component Inventory

**Shell / chrome**
- `TopBar` (save-state pill, search, mic, notifications, trash icon)
- `SidebarNav`, `MobileTabBar`, `MobileMoreGrid`
- `BusinessSwitcher` (avatar chip rail)
- `CommandPalette` (⌘K)

**Save/state**
- `SaveStatePill` (states: idle/saving/saved/offline/sync-failed/conflict)
- `ConflictResolver` (diff view)
- `VersionHistoryPanel` (timeline + restore-this-version)
- `RecentlyDeletedDrawer` (filterable by type, restore/permanently-delete actions)

**Idea Bank**
- `IdeaCard` (board/grid view)
- `IdeaWorkspace` (full-screen editor, all fields from Priority 2)
- `IdeaActionsMenu`
- `ConvertToProjectModal`, `ConvertToTaskModal`, `SaveToNotebookModal`
- `IncubatingVentureBuilder` (lean canvas, cost estimator, roadmap generator)

**Notebooks**
- `NotebookSidebar` (folders, favorites, pinned, recent, archive, deleted)
- `BlockEditor` (rich text, checklist, table, image, file, audio, video-embed, quote, callout, divider, code, drawing/canvas blocks)
- `PageIconPicker`, `PageCoverPicker`
- `BacklinksPanel`, `GraphView` (already exists as `NoteGraph`, extend)

**Export**
- `GlobalExportMenu` (attaches to any exportable object)
- `GoogleDriveConnectModal`, `DriveFolderPicker`, `ExportHistoryTable`

**Agents**
- `AgentOfficeGrid` (desks/avatars/status)
- `AgentDeskPanel` (chat / tasks / memory / files / calendar actions / notebook contributions / permissions / instructions / activity history tabs)
- `ActionPreviewPanel` (Approve All / Edit Actions / Cancel)
- `ActionExecutionChecklist`
- `AgentActivityLog`
- `AgentPermissionEditor`

**Voice**
- `VoiceCaptureModal` (live transcript)
- `BrainDumpReviewBoard` (bucketed cards)

**University**
- `SyllabusUploader`, `SyllabusReviewForm`
- `CourseDashboard` (GPA, projected GPA, credit progress, deadlines, attendance, study hours, countdown)
- `GradeTracker`, `StudyPlanGenerator`

**Business**
- `BusinessProfileHeader`
- `ModuleTabBar` (dynamic per-business module set)
- `LeanCanvasEditor`, `RoadmapBuilder`, `CRMTable`, `FinancialsSheet`

**Social Media**
- `ContentCalendar`, `ContentItemCard`, `ContentPipelineBoard` (Ideas→Drafts→Scheduled→Published→Repurposing), `AssetLibrary`, `PlatformAnalyticsPanel`

**Books**
- `BookShelf` (status columns), `BookDetailPanel`, `ReadingProgressBar`, `QuoteCollector`, `AIBookTools` (summarize/flashcards/themes)

**Appearance**
- `ThemeTokenProvider` (context, single source of truth — replaces hardcoded colors)
- `AppearanceSettingsPanel` (mode switch, color wheel, gradient builder, font/density/shadow/motion controls, presets)

---

## 6. Data Entities & Relationships

Core shape every entity shares:
```
BaseEntity {
  id, type, createdAt, updatedAt, updatedBy ('user'|agentId),
  version, deletedAt (null unless in Recently Deleted),
  relations: { [entityType]: [ids] }
}
```

**Idea**
`{ title, description, tags[], color, status, priority, businessId|lifeArea, revenuePotential, difficulty, estimatedCost, estimatedTime, research, attachments[], relatedNoteIds[], relatedTaskIds[], relatedEventIds[], relatedBusinessIds[], relatedAgentChatIds[], versionHistory[], isTemplate:boolean }`

**NotebookPage**
`{ notebookId, folderId, title, icon, cover, color, blocks[], tags[], favorite, pinned, sourceIdeaId|null, backlinks[], versionHistory[] }`

**Task**
`{ title, notes, dueDate, priority, status, businessId|lifeArea, relatedIdeaId, relatedGoalId, subtasks[], recurrenceRule }`

**Goal** `{ title, description, targetDate, businessId|lifeArea, progress, relatedTaskIds[], relatedIdeaIds[], milestones[] }`

**CalendarEvent** `{ title, start, end, allDay, recurrenceRule, sourceType ('manual'|'agent'|'syllabus'|'content'), sourceId, location, reminder }`

**Business** `{ name, logo, description, industry, businessModel, stage, location, launchDate, mission, vision, values[], targetAudience, founderStory, revenueModel, currentPriority, healthScore, enabledModules[] }`

**Course** (University) `{ name, code, instructor, instructorEmail, officeHours, schedule[], location, semester, creditHours, textbooks[], gradeCategories[], assignments[], exams[], attendancePolicy, lateWorkPolicy, syllabusFileRef, notebookId }`

**ContentItem** (Social) `{ platform, businessId, pillar, format, status, publishDate, caption, script, media[], link, metrics:{views,likes,saves,shares,comments,watchTime,leads,revenue} }`

**Book** `{ title, author, cover, genre, pageCount, startDate, finishDate, rating, progress, format, quotes[], notes, lessons, reflections, relatedGoalIds[], relatedBusinessIds[], relatedIdeaIds[], relatedNotebookPageIds[] }`

**Agent** `{ name, avatar, role, personality, businessAssignment, folderAccess[], permissions{}, autoActions[], memory[] }`

**AgentAction** (log entry) `{ agentId, type, targetEntity, status ('proposed'|'approved'|'executing'|'done'|'failed'|'undone'), preview, result, timestamp }`

**RecentlyDeletedItem** `{ originalEntity (full snapshot), entityType, deletedAt, deletedBy }`

**ExportRecord** `{ sourceEntityId, format, destination ('download'|'drive'|'print'), driveFileId|null, status, createdAt }`

Relationship rule: relations are stored as ID arrays on both sides (bi-directional) and kept in sync by a single `linkEntities(a, b)` / `unlinkEntities(a, b)` utility — never written ad hoc in individual features, to avoid the "notes disappear" class of bug caused by inconsistent one-sided links.

---

## 7. Permission Rules

- **User** has full control over everything except items explicitly flagged `isTemplate: true` (a small starter set), which can be duplicated but not edited/deleted in place — duplicating creates a normal, fully-editable copy.
- **Agents** operate under a per-agent permission object:
  - `canCreate: [entityTypes]`
  - `canEdit: [entityTypes]`
  - `canDelete: false` by default (agents move to Recently Deleted at most, never permanently delete, ever — no permission flag can grant hard-delete)
  - `requiresApproval: [actionTypes]` — destructive or bulk actions (>3 items, calendar changes, financial data edits) always require approval regardless of other permission settings.
  - `folderAccess: [notebookFolderIds]` — agents can only read/write inside folders they're explicitly granted.
- **Business-scoped agents** (e.g. Lunar Love Strategist) only see/act on data tagged to their assigned business by default; cross-business action requires explicit user request in that session.
- Recently Deleted items are user-restorable only — agents cannot restore or permanently delete on their own.

---

## 8. Agent Action System

**Pipeline:** `Intent Parse → Slot Filling (ask for missing required fields) → Action Plan Build → Preview → Approval Gate → Sequential Execution → Result Summary → Activity Log Entry`

- **Slot filling example** ("class Monday/Wednesday/Friday at 10am"): system detects recurring class pattern, and asks *only* for the missing required fields — Course name, End time, Start date, End date, Location, Reminder — as a single compact inline form, not one question at a time.
- **Action Plan object:** ordered list of typed steps, each with a human-readable preview line and a machine-executable payload. This is what powers the Preview Panel in 4.5.
- **Approval Gate:** default threshold — any plan touching ≥1 calendar event, ≥1 notebook page, or ≥3 tasks requires explicit Approve; single-task/single-note quick actions inline in chat can have an "auto" toggle per agent (opt-in, off by default).
- **Execution:** steps run sequentially so later steps can reference IDs created by earlier ones (e.g. PDF references the notebook page just created); each step wrapped in try/catch, failures don't halt the whole batch, they're flagged and included in the final summary as "Needs Attention."
- **Undo:** every completed AgentAction batch can be undone as a unit within the same session (reverses creates → Recently Deleted, reverses edits → restores previous version via Version History) — not available after a hard Recently Deleted purge.
- **Activity Log:** flat, filterable list per agent and system-wide: timestamp, action type, target, status, undo link.
- **Failure handling:** on step failure, show inline error with the exact reason (e.g. "Calendar write failed — offline") and a **Retry** button scoped to just that step, not the whole batch.

---

## 9. Error States

- **Save failed:** pill → `Sync Failed`, toast with **Retry now**, item still safe in local draft store.
- **Drive upload failed at any of the 7 steps in Priority 4's workflow:** explicit message naming which step failed ("Upload succeeded but file verification failed — retrying automatically"), never show a Drive link unless step 7 (verified real link) completed.
- **Agent step failure:** inline ⚠️ in execution checklist, doesn't block sibling steps, retry scoped to the step.
- **Syllabus parse failure/low confidence:** field-level warning badges in the review screen, never silently guesses without flagging.
- **Network loss mid-edit:** silent to the user except the pill state change — never a blocking error dialog for something autosave already handled locally.
- **Permission-denied agent action:** chat message explaining exactly what permission is missing and a one-click "Grant permission" shortcut to Settings.

## 10. Empty States

- Idea Bank empty: illustration + "Capture your first idea" + mic quick-capture button.
- Notebook with no pages: "This notebook is empty — create a page or drag one in from Idea Bank."
- Recently Deleted empty: "Nothing here. Deleted items across Nyla OS will show up here so nothing is ever truly lost."
- Agent Office with no custom agents: default roster shown, "+ Customize an agent" CTA.
- Business with no modules enabled yet: module picker checklist shown inline instead of blank tabs.

## 11. Loading States

- Skeleton screens (not spinners) for board/list views (Idea Bank, Tasks, Notebooks, Content Calendar).
- Agent "Thinking" status shown as an animated typing indicator on its desk avatar in the Live Agent Office, and inline in chat.
- Syllabus/document parsing: progress steps shown ("Reading document… Extracting schedule… Extracting assignments…") not a blank spinner, since this can take several seconds.
- Export generation: progress bar with step labels ("Generating PDF… Uploading to Drive… Verifying file…").

## 12. Confirmation States

- Hard delete (Delete Permanently): type-to-confirm modal.
- Overwrite vs. create-copy on Drive re-export: explicit modal, never silently overwritten.
- Bulk task/idea actions (archive/move/delete >3 items): confirmation toast with Undo, not a blocking modal (keeps flow fast, still reversible).
- Agent batch actions: Approve All / Edit Actions / Cancel gate (4.5) is itself the confirmation step — no redundant second confirmation once approved.

## 13. Undo and Recovery Behavior

- Every delete (single or bulk, user or agent) → Recently Deleted, never immediate hard delete.
- Recently Deleted has **no automatic expiry** — permanent until manually purged.
- Every edit creates a version snapshot; Version History accessible from any object's detail view with one-click "Restore this version" (which itself creates a new version rather than destructively reverting, so nothing is ever lost even from a bad restore).
- Session-level Undo stack for agent batches (8.4) and bulk UI actions, available for the duration of the session or until explicitly dismissed.
- Refresh/browser-close recovery: local draft store (IndexedDB) is authoritative for in-flight edits until confirmed synced; on reopen, if an unsynced draft newer than the last synced version exists, prompt "Recover unsaved changes?" rather than silently discarding or silently applying.

## 14. Mobile and Tablet Behavior

- Bottom tab bar (5 slots) + "More" grid, as in section 2.
- Idea Workspace, Notebook editor, and Agent Desk panels open as full-screen sheets on mobile (not modals-within-modals).
- Voice Brain Dump is the primary mobile capture method — mic FAB persistent on Home/Tasks/Notebooks.
- Tablet: two-pane layout where space allows (list + detail), same breakpoint pattern as the existing `MobileSubTabs`/responsive logic already in the codebase — extend rather than replace.
- Touch targets ≥ 44px; swipe-to-archive/delete on list rows (revealing Restore-safe delete, not permanent).

## 15. Accessibility Requirements

- All interactive elements keyboard-reachable and operable (tab order follows visual order); ⌘K palette fully keyboard-navigable.
- Color is never the sole status indicator (save-state pill, agent status, priority) — always paired with an icon/label.
- Minimum contrast ratio 4.5:1 for text in both light and dark themes, enforced by the token system (section 16) rather than per-component overrides.
- Focus rings visible and theme-aware (not the default browser blue that disappears on dark backgrounds).
- All images/icons carry alt text or aria-labels; decorative icons `aria-hidden`.
- Motion-level setting (Priority 13) includes a "Reduced motion" option that disables non-essential transitions/animations app-wide.
- Voice Brain Dump has a text-input fallback for anyone who can't/doesn't want to use voice.

## 16. Design-System Rules

- **Single theme-token provider** (`ThemeTokenProvider`) is the only source of color/spacing truth. Tokens: `background, surface, surfaceElevated, border, textPrimary, textSecondary, accent, accentMuted, inputBackground, hover, selected, disabled, error, success, warning`.
- **No hardcoded hex values in component code.** Every color reference goes through `theme.tokenName`. This is the direct fix for bug #4 (inconsistent dark mode). Enforce via a lint-style code review pass before merge (grep for raw hex outside the token definition file).
- Light/Dark/System/Scheduled/Custom modes all resolve to the same token set — Custom themes just override token values via the color wheel/gradient builder/hex inputs, never bypass the token layer.
- Typography: keep existing DM Sans / DM Serif Display pairing; font-size and density settings scale via CSS custom properties, not per-component literals.
- Border radius, shadow level, and motion level are also tokens, not scattered inline styles.
- Component states (hover/selected/disabled/error/success/warning) always pull from the token set so every surface (cards, modals, tables, charts, tooltips, scrollbars) is automatically theme-correct.

## 17. Feature Dependencies

1. **Theme Token Provider** must land first — nearly everything else (new modals, panels, agent office) gets built on top of it, and retrofitting later is much more expensive.
2. **Autosave/versioning/Recently Deleted core** must land before Idea Bank/Notebooks redesign, since the new workspace UIs assume these primitives exist.
3. **Idea↔Notebook linking utility** (`linkEntities`/`unlinkEntities`) must exist before "Save to Notebook" can be fixed.
4. **Global Export Menu component** should be built once, generically, before wiring it into every module (Ideas, Notes, Business, University, Cosmic, etc.) — build the menu + PDF/DOCX/TXT/MD generators as a shared service first.
5. **Google Drive OAuth + thin backend function** is a prerequisite for any real Drive upload — cannot be faked client-side; this blocks Priority 4's Drive workflow specifically (not the rest of export, which can ship without Drive).
6. **Agent Action Plan / Preview / Approval pipeline** must exist before Live Agent Office desks can show meaningful statuses (Working/Waiting for Approval/etc.) — office UI is a view over this pipeline's state, not a separate system.
7. **Voice Brain Dump** depends on the same intent-classification approach used for agent slot-filling — build the classifier once, reuse for both chat parsing and brain dump triage.
8. **University syllabus extraction** and **Business AI advisor** both depend on the document-parsing agent pattern — build the generic "upload → extract → review → approve → create" pipeline once, specialize per module.

## 18. Acceptance Criteria

- [ ] No note, idea, or task can be lost without appearing in Recently Deleted first — verified by test: delete every entity type, confirm recovery.
- [ ] "Save to Notebook" from an Idea always results in either a verified, openable Notebook page, or a visible failure state — never a silent no-op.
- [ ] Every default/starter Idea Bank item is editable and deletable unless explicitly flagged `isTemplate`.
- [ ] Google Drive exports only report success after the file is verified to exist and a working link is generated — no more "file not found."
- [ ] Zero raw hex colors outside the token definition file; dark mode toggling leaves no white surfaces anywhere in the app (manual QA pass through every screen).
- [ ] Agents can complete the full multi-step example (launch plan → notebook page → calendar milestones → PDF) end-to-end with a single approval, and every created artifact is independently verifiable/openable.
- [ ] Recently Deleted items persist indefinitely with no auto-purge job present in the codebase.
- [ ] Moon Phase is fully removed with no dead nav entries, dead routes, or console errors referencing it.
- [ ] Voice Brain Dump correctly buckets a mixed multi-topic transcript (per the example sentence) into at least 5 distinct categories with user-editable review before save.
- [ ] Syllabus upload → approval produces: course record, recurring calendar events, assignment/exam events with reminders, a course notebook containing the original file, and a semester timeline — all cross-linked.

## 19. Priority Roadmap

**Phase 1 — Foundation (data safety + design system):** Theme Token Provider; autosave/version-history/Recently Deleted core; conflict resolution; save-state pill.
**Phase 2 — Core content loop:** Idea Bank full workspace redesign; Notebook redesign; Idea↔Notebook save flow fix; Global Export Menu (Download formats first, no Drive yet).
**Phase 3 — Connections:** Google Drive OAuth + backend function + verified upload workflow; cross-entity relations rails on all object detail views.
**Phase 4 — Agents:** Action Plan/Preview/Approval pipeline; extend `execAgentCmd`; Agent Activity Log & permission editor; Live Agent Office UI.
**Phase 5 — Capture & Academic:** Voice Brain Dump; University syllabus pipeline + dashboard.
**Phase 6 — Depth modules:** Business section personalization (Lunar Love / Halo House / Dashboard agency workspaces + generic venture builder); Social Media tracker; Books section.
**Phase 7 — Polish:** Cosmic cleanup (Moon Phase removal); mobile/tablet pass; accessibility audit; full dark-mode QA sweep.

---

## 20. CODEX IMPLEMENTATION HANDOFF

**Target file:** `nyla-os.html` (single-file React 18 + Babel-in-browser app, no bundler). Persistence today: `localStorage` + Firebase Firestore. Deployed via GitHub Pages at `nyfi444.github.io/nyla-os/nyla-os.html`.

**Architectural constraints the implementing agent must respect:**
- This is a no-build-step app. New "libraries" must be added as `<script>` CDN tags (e.g. jsPDF, docx.js) at the top of `<head>`, matching the existing pattern used for React/Firebase.
- There is no application server. Any feature requiring a secret (Google Drive OAuth client secret, token refresh) **cannot** be implemented purely client-side — it needs a Firebase Cloud Function (Firebase is already in use for Firestore, so Functions is the natural extension) acting as a thin token-exchange/upload proxy. Flag this explicitly to the user rather than faking a "Save to Drive" button that doesn't actually call the Drive API.
- Do not introduce a framework migration (no Next.js/Vite rewrite) as part of this work — extend the existing single-file architecture unless the user separately approves a rewrite.

**Build order (do not reorder — each phase's components are load-bearing for the next):**

1. **Theme Token System**
   - Create a `THEME_TOKENS` object (light + dark variants) and a `ThemeContext`/`useTheme()` hook.
   - Audit-and-replace: grep the file for hardcoded hex colors (`#[0-9a-fA-F]{3,6}`) outside the token definition and replace with token references. This is the single highest-leverage fix for bug #4.
   - Wire Appearance settings (mode switch, color wheel, gradient builder, hex inputs, font/density/shadow/motion sliders, saved presets) to write into a custom theme object that overrides tokens.

2. **Data Safety Core**
   - Add a `version`, `updatedAt`, `updatedBy`, `deletedAt` field to every existing entity shape (ideas, notes/pages, tasks, goals, events, businesses).
   - Build a generic `useAutosave(entity, saveFn)` hook: debounced local write (IndexedDB, not just localStorage, for reliability across refresh) on every change, background sync attempt to Firestore, exponential-backoff retry, and the save-state machine (`idle|saving|saved|offline|sync-failed|conflict`) exposed via context for the global `SaveStatePill`.
   - Build `moveToRecentlyDeleted(entity)` / `restoreFromRecentlyDeleted(id)` / `permanentlyDelete(id)` as the *only* sanctioned delete path — refactor every existing delete call site (`deletePage`, task deletion, idea deletion, etc.) to go through this instead of directly splicing arrays.
   - Build `RecentlyDeletedDrawer` UI, reachable from the top bar trash icon, filterable by entity type.
   - Build simple Version History: on each debounced autosave, push a snapshot (capped/prunable count, e.g. keep last 50 + one per day older) into `entity.versionHistory`; build `VersionHistoryPanel` with restore-as-new-version.
   - Build `ConflictResolver` for the case where Firestore's stored `updatedAt`/`version` is ahead of the local base version at sync time.

3. **Idea Bank Redesign**
   - Replace the current idea list/detail with `IdeaWorkspace` (full-screen), covering every field in Priority 2.
   - Remove any special-casing that prevents default/seed ideas from being edited/deleted — add `isTemplate` flag only where genuinely intended, default false.
   - Implement `linkEntities`/`unlinkEntities` utility for bi-directional relation arrays; use it for all "related X" fields everywhere (not idea-specific).
   - Implement the "Save to Notebook" flow exactly as specified in User Flow 4.1, including the read-back verification step — this is the direct fix for bug #2.

4. **Notebooks Redesign**
   - Extend the existing `RichEditorComponent`/block system to cover: checklists, tables, images, files, audio, video-embeds, quotes, callouts, dividers, code blocks, drawing/canvas.
   - Add page icon/cover, folders/subfolders/nesting (extend existing folder model), favorites, pinned, recently viewed/edited (derive from `updatedAt`/access log), Archive, and route deletes through the Recently Deleted core from step 2.
   - Extend existing `NoteGraph`/backlinks to include Idea Bank-originated pages.

5. **Global Export Menu**
   - Build one `GlobalExportMenu` component taking a generic `exportable` object (title + content + metadata) and rendering: Download PDF, Download DOCX, Download TXT, Download Markdown, Download CSV (only where a tabular shape is passed), Print, Save to Google Drive, Save to Notebook, Copy link.
   - Add jsPDF (or similar) and a DOCX-generation library via CDN script tags; implement generator functions per format as pure functions taking the exportable object.
   - Attach this single component everywhere export/print/download currently appears or should appear (Ideas, Notes, Notebook pages, AI responses, Business plans, Goals, University guides, Calendar plans, Content calendars, Book notes, Astrology/Numerology/Matrix reports).

6. **Google Drive Integration (requires backend)**
   - Implement a Firebase Cloud Function that performs the OAuth token exchange and the actual Drive API upload (files never touch the client with a bare secret).
   - Client flow: generate file → call Cloud Function with file blob → function uploads via Drive API → returns real file ID → client verifies existence via a follow-up Drive `files.get` call (through the same function) → only then render the Drive link and mark success.
   - Build `GoogleDriveConnectModal` (OAuth flow), `DriveFolderPicker`, rename-before-save, overwrite-vs-copy prompt, `ExportHistoryTable`, and per-record retry for failed exports.
   - This phase is explicitly gated on backend availability — do not stub it with a fake success state.

7. **Agent Action Pipeline**
   - Extend the existing `execAgentCmd` parser into a full pipeline: `parseIntent → fillSlots → buildActionPlan → preview → approvalGate → executeSequentially → summarize → logActivity`.
   - Build `ActionPreviewPanel` (Approve All / Edit Actions / Cancel) and `ActionExecutionChecklist`.
   - Build per-agent `permissions` object (`canCreate`, `canEdit`, `canDelete: false` hardcoded, `requiresApproval`, `folderAccess`) and enforce it inside the executor before each step runs.
   - Build `AgentActivityLog` (flat list, filterable per agent) and session-scoped Undo for completed batches (reverse via Recently Deleted / Version History primitives from step 2 — do not build a second undo system).

8. **Live Agent Office**
   - Build `AgentOfficeGrid`: desk/avatar cards showing name, role, current assignment, status (`available|thinking|working|waiting_for_approval|completed|needs_information|error`), progress, recent work, assigned business.
   - Clicking a desk opens `AgentDeskPanel` with tabs: Chat, Current Tasks, Memory, Files Created, Calendar Actions, Notebook Contributions, Permissions, Instructions, Activity History — all reading from the same AgentAction log and permission object built in step 7.
   - Seed the default roster (Chief of Staff, Personal Assistant, Calendar Manager, Task Manager, Academic Assistant, Study Buddy, Research Analyst, Content Strategist, Social Media Manager, Business Planner, Financial Assistant, Brand Director, Idea Development Agent, Document Creator, Travel Planner, Book and Learning Coach, Habit Coach, Project Manager, Lunar Love Strategist, Halo House Advisor), each customizable (name/avatar/role/personality/business assignment/folder access/permissions/auto-actions) via the existing `AgentsPanel` edit form pattern, extended.

9. **Voice Brain Dump**
   - Build `VoiceCaptureModal` using the Web Speech API (or existing STT approach if already integrated) for live transcript capture.
   - Reuse the intent classifier from step 7's slot-filling to bucket transcript sentences into Tasks/Calendar/Ideas/Notes/Shopping/Content Ideas/Follow-ups.
   - Build `BrainDumpReviewBoard`: editable, bucket-reassignable, deletable cards; nothing writes to any entity store until **Approve & Save**.

10. **University Pipeline**
    - Build `SyllabusUploader` accepting PDF/DOCX/image/pasted text (Google Drive file and Canvas export can be stubbed behind a "coming soon" if those integrations aren't feasible yet — do not silently drop them from the UI, mark them explicitly unavailable).
    - Build extraction (reuse document-parsing agent pattern) → `SyllabusReviewForm` with per-field confidence flags → on approval, create Course record, recurring calendar events (via the same recurrence engine used for regular calendar events), assignment/exam events with reminders, a Course Notebook (via Notebooks system from step 4, syllabus file attached as first page), semester timeline, grade tracker shell, suggested study plan.
    - Build `CourseDashboard` (GPA, projected GPA, credit progress, upcoming assignments, grade tracking, attendance, weekly study hours, semester countdown, professor contacts/office hours, resources, scholarships, internships, workload/deadline-conflict/academic-risk alerts).

11. **Business Section Personalization**
    - Refactor Business from a fixed tab set to a `enabledModules[]`-driven `ModuleTabBar` per business.
    - Build the generic module components (Overview, Strategy, Financials, Products, Services, Customers, CRM, Competitors, Brand, Content, Marketing, Sales, Operations, Projects, Tasks, Documents, Analytics, Legal, Roadmap, AI advisor, Team, Meetings, Ideas) as reusable pieces, then assign the specific module sets called out for Lunar Love, Halo House Collective, and Dashboard agency.
    - Build the generic "New Venture" flow from Idea Bank: link-to-existing-business, create-new-venture, incubating-venture status, lean canvas, startup cost estimator, launch roadmap generator.

12. **Social Media Tracker**
    - Build `ContentPipelineBoard` (Ideas→Drafts→Scheduled→Published→Repurposing), `ContentCalendar`, `AssetLibrary`, and the `ContentItemCard` with all fields from Priority 10 (platform, business, pillar, format, status, publish date, caption, script, media, link, and the metrics set).
    - Wire scheduled publish dates into the main Calendar as `sourceType: 'content'` events.

13. **Books Section**
    - Build `BookShelf` (Want to Read/Currently Reading/Finished/Paused/DNF/Favorites), `BookDetailPanel` with all fields from Priority 11, and the AI tools panel (summarize notes, flashcards, theme identification, lessons→tasks conversion, cross-book idea connections, recommendations, monthly recap) — reuse the document/content-summarization agent pattern already built for University/agents rather than a new one.

14. **Cosmic Cleanup**
    - Remove `'Moon Phase'` from the Cosmic `sub` array in `NAV` and delete its render branch.
    - Add a redirect map so any stored deep link/reference to Moon Phase resolves to Numerology instead of erroring.
    - Grep the whole file for any other `Moon Phase`/`moonPhase` references (widgets, dashboard shortcuts, search index) and remove/update them.

15. **Mobile/Tablet & Accessibility Pass**
    - Verify every new full-screen workspace (Idea, Notebook editor, Agent Desk) collapses to a full-screen sheet on mobile per section 14 of the spec.
    - Run a contrast/token audit in both themes; verify focus rings and keyboard navigation on the new ⌘K palette, Export menu, and Agent approval gate.

**Testing/verification expectations for the coding agent:** for each phase above, manually verify against the relevant Acceptance Criteria in section 18 before moving to the next phase — do not implement all 15 steps and test once at the end, since later phases depend on earlier primitives (Recently Deleted, theme tokens, linkEntities) actually working correctly.
