/* ── Agents that change existing things ────────────────────────────────
   Loads before the main app script: top level must not touch app globals.
   Merged into AGENT_ACTION_SPECS / AGENT_ACTION_DOCS by the main script. */
const TASK_EDIT_ACTION_SPECS = {};
const TASK_EDIT_ACTION_DOCS = '';
const agentTaskContext = () => '';
// Which agent permission an action needs: 'create' | 'edit' | 'delete'.
const actionPermissionFor = action => 'create';
