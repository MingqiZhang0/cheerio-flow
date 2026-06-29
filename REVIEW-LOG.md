# Cheerio Flow — Architecture Review Log

## Session: 2026-06-28

### v0.1.4–v0.1.6 Roadmap Review (Initial)
- **Verdict:** 8.3/10 — route approved
- **Key risks:** v0.1.5 migration is highest risk; `save_database_to` stale cleanup + empty payload is the single most dangerous pattern
- **Foundation to protect:** `updateProjects`, `projectsRef`, `flowNodesRef`, `normalizeProject`, `resetInteractionState`, `mergeLatestFlowPositions`, `applyGroupMembership`, `save_database_to`/`load_database_from`
- **Directory recommendation:** Plan A — `projects/ungrouped/` + `projects/groups/{groupId}/`
- **Canonical source recommendation:** `group.projectIds` authoritative; `project.groupId` as derived cache; reconcile in `applyGroupMembership`
- **Folder naming:** use `groupId`, never `group.title`

---

### P0 Emergency Patch Review
- **Incident:** Bad project JSON → parse error → `updateProjects([])` + `setLoaded(true)` → autosave → `save_database_to` with empty payload → all project JSONs deleted
- **Root cause:** `save_database_to` stale file cleanup loop + frontend `.catch()` path breeding empty `projectsRef`
- **P0 Fix:** 
  - `save_database_to`: empty-payload guard (`return Err`), stale cleanup loop removed
  - `canPersistRef` ref: independent of `loaded`, only set `true` in `.then()` success
  - `.catch()` no longer calls `updateProjects([])`, clears timer, sets `canPersistRef=false`
  - `saveAllNow` checks `loadedRef.current && canPersistRef.current`
  - Autosave effect checks `loaded && canPersistRef.current`
  - `fs::remove_file` only in explicit `delete_project` command
- **Verdict:** Passed — four-layer defense confirmed

---

### P0.1 Recovery Patch Review
- **Issue:** P0 blocked users from switching storage root when `canPersistRef=false` — dead end for recovery
- **P0.1 Fix:**
  - New `switch_storage_root` Rust command: takes only `storage_root: String`, calls `load_database_from` before `write_bootstrap`, never calls `save_database_to`
  - `applyStorageRoot` branches: `canPersistRef=true` → `chooseStorageRoot` (save current); `canPersistRef=false` → `switchStorageRoot` (load from target)
  - Old guard `if (!canPersistRef) { setError("Cannot change..."); return; }` **removed**
- **Not-working diagnosis:** User saw old error message "Cannot change storage root..." which no longer exists in P0.1 source → running old binary
- **Path confusion:** `storageRoot` = parent of `CheerioFlowData`, NOT the data directory itself. `data_root_for` appends `CheerioFlowData`

---

### Step 2: Read-only Startup Integrity Scan Review
- **Verdict:** Passed — commit recommended
- **Key changes:**
  - `integrity.ts`: pure function, no side effects, no `Math.random()`/`Date.now()`, no disk writes
  - Rust `load_database_from`: removed write-back of `groups.json`/`app-state.json`; removed `group.projectIds` cleanup; `groups` now immutable
  - `hydrateLoadedData`: raw groups → scan; normalized groups → UI state
  - `skipNextAutosaveRef`: blocks first autosave cycle after hydration
  - `normalizeGroups` removed from `normalizePersistedData` — safe for all callers
- **Non-blocking notes:**
  - `dataVersion` changed from `u32` + custom deserializer to `serde_json::Value` in Rust
  - `ensure_data_dirs` removed from non-fresh load path (intentional)

---

### Step 4: Restore from Backup Review
- **Verdict:** Passed — all 20 checks passed
- **Design highlights:**
  - Uses `fs::rename` (not `remove_dir_all`) — old data preserved as `CheerioFlowData.before-restore-{timestamp}`
  - Staging: copy → validate → rename into place
  - Pre-restore backup created before any mutation
  - Rollback on staging failure
  - `backupId` strict validation: no `..`, no `/`, no `\`, must start with `backup-`
  - Symlink rejection via `fs::symlink_metadata`
  - Restore allowed when `canPersistRef=false`; Create Backup still refused
  - After restore: `loadDatabase()` + `hydrateLoadedData()` reload from disk
  - Error path: tries `loadDatabase()` to verify disk state before keeping error mode

---

### Step 5: Dry-run Migration Plan (WIP) Review
- **Verdict:** WIP direction correct — one must-fix before commit
- **Must-fix:** `blockerCount`/`warningCount` double-counting bug
  - Current: `blockers.len() + project_blocker_count + group_blocker_count + operation_blocker_count`
  - Fix: use `blockers.len()` only
- **Should-fix:** `validate_path_segment_for_migration` missing whitespace check
- **Confirmed read-only:** Zero writes in entire dry-run call chain
- **Confirmed isolated:** No `load_database`/`save_database_to`/`hydrateLoadedData`/`persistDatabase` calls
- **All prior steps (P0/P0.1/Step2/Step3/Step4) intact**

---

## Protected Foundation (v0.1.x)
These must be touched with extreme care across all versions:

| Foundation | Risk if broken |
|---|---|
| `updateProjects` + `projectsRef` | Core state sync, all saves depend on it |
| `setFlowNodes` + `flowNodesRef` | Canvas-to-project position sync |
| `normalizeProject` | Data integrity at load boundary |
| `resetInteractionState` | Pointer capture cleanup, UI state |
| `mergeLatestFlowPositions` | Prevents drag position loss on save |
| `save_database_to` | P0 empty guard must stay; no stale delete |
| `load_database_from` | Read-only after Step 2; fresh-install path preserved |
| `applyGroupMembership` | Group/project membership reconcile |
| `canPersistRef` | Must stay false after load failure |
| `skipNextAutosaveRef` | Must skip first cycle after hydrate |
| `switchStorageRoot` | P0.1 recovery path must stay intact |
| 350ms debounce save | Timer behavior unchanged across versions |
| `applyStorageRoot` branching | P0.1 two-path logic must stay intact |

---

## Pending for Future Versions

### v0.1.5: Group Folder Migration
- **Prerequisites:** v0.1.4 backup/restore tested; `dataVersion` mechanism works; dry-run plan generates correctly
- **Highest risk:** `save_database_to` rewrite for nested directories; file move operations
- **Safety:** copy-validate-delete, not rename; migration-state.json for crash recovery
- **Canonical source:** `group.projectIds` authoritative after migration

### v0.1.6: Data Health Toolkit
- Deep scan + conservative repair buttons
- Backup cleanup strategy (keep last N)
- Should not change primary storage structure
