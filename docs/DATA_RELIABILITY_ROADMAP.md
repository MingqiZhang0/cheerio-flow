# Cheerio Flow Data Reliability Roadmap

## Goal

Cheerio Flow aims to provide **professional-grade local data reliability for research workflow projects**. The goal is to prevent accidental local data loss, unsafe writes, interrupted migrations, failed restores, and silent corruption in a local-first desktop environment.

This is not about enterprise cloud security or industrial control safety. It is about making sure a researcher's local project data survives application bugs, unexpected shutdowns, disk errors, and human mistakes.

## Current Foundation in v0.1.4

v0.1.4 — "Data Safety Foundation" — established the first layer of protection. It addressed the most dangerous failure mode: a bad load cascading into a destructive save.

### What v0.1.4 protects against

| Layer | Mechanism | What it prevents |
|---|---|---|
| Persistence gate | `loadedRef` + `canPersistRef` (frontend) | Autosave after failed load writing empty/invalid state |
| Empty-save rejection | Rust `save_database_to` refuses empty `projects` | Orphaning existing project files via save |
| No stale cleanup in save path | Normal `save_database_to` never deletes project files | Accidental project deletion during save |
| Read-only startup integrity scan | `scanLightweightIntegrity` runs on load, reports only | Silent corruption propagation |
| Manual full backup | `create_full_backup` copies `CheerioFlowData` to timestamped backup | Data loss from future operations |
| Restore with staging + rollback | Pre-restore backup → staging copy → rename → rollback on failure | Partial restore destroying both old and new data |
| Migration dry-run | `generate_migration_dry_run_plan` — read-only preview | Blind migration corrupting storage layout |
| Native folder picker | Tauri dialog plugin — only fills input, no auto-apply | Accidental storage root switching |

### What v0.1.4 intentionally does NOT do

- Does not automatically repair corrupted data.
- Does not automatically migrate storage layout.
- Does not write during integrity scanning.
- Does not require network access.
- Does not encrypt data at rest.

### The persistence gate in detail

The two-ref gate in `App.tsx` works as follows:

```
load success → loadedRef = true, canPersistRef = true → autosave enabled
load failure → loadedRef = false, canPersistRef = false → autosave blocked
```

`saveAllNow` checks both refs before calling `persistDatabase`. The autosave `useEffect` also gates on `canPersistRef.current`. When a restore is in progress, both refs are set to `false` before the operation and re-enabled on success.

### Current data model

```text
CheerioFlowData/
  projects/
    {project-id}.json      ← one flat file per project
  groups.json              ← group list with projectIds arrays
  app-state.json           ← UI state + dataVersion
```

`dataVersion` is currently `1`. The migration dry-run plans a `1 → 2` transition to a group-folder layout.

### Current save path (not yet atomic)

The Rust `write_json` helper (in `lib.rs`) uses `fs::write` directly:

```rust
fn write_json<T>(path: &Path, value: &T) -> Result<(), String> {
    // creates parent dirs, serializes, fs::write
}
```

This is a direct overwrite — no temp file, no `fsync`, no atomic rename. If the process is killed mid-write, the file can be left half-written. This is a known gap addressed in the roadmap below.

## Target Level

Cheerio Flow targets:

```text
professional-grade local data reliability for a local-first research workflow desktop app
```

Concretely, this means:

- **No silent data loss.** Any corruption or failure must be surfaced, not silently propagated.
- **Safe writes.** A save failure must never destroy the previous valid file.
- **Recoverable operations.** Dangerous operations (migration, restore, delete) must create checkpoints.
- **Discoverable interruptions.** If the app crashes mid-operation, the next startup must detect and report it.
- **Verifiable integrity.** Backups and migrations must be verifiable before and after execution.

## Non-goals

Cheerio Flow's data reliability scope explicitly excludes:

- Enterprise SSO / identity federation
- Cloud access control / IAM
- Multi-user compliance systems
- Encrypted vault (may be considered later, but not now)
- Industrial control safety systems
- Database-kernel-grade ACID engines
- Financial or medical record compliance (HIPAA, SOX, PCI-DSS)
- Real-time collaborative editing safety
- Network security / TLS / DDoS protection

These are valuable concerns but are not what Cheerio Flow is building toward. Cheerio Flow is a local-first desktop application for individual researchers. The reliability model reflects that scope.

## Core Principles

1. **Fail-closed persistence.** A failed load must disable persistence, not trigger an empty save.
2. **Atomic writes.** A save failure must leave the previous valid file intact; no half-written JSON.
3. **Checkpoint before danger.** Any operation that could lose data must create a recoverable backup first.
4. **Dry-run before migration.** Structural storage changes must be previewed and blocker-checked before execution.
5. **Staged restore.** Restore must use staging, verification, and rollback — never a direct overwrite.
6. **Interrupted-operation visibility.** If the app crashes mid-operation, the next startup must surface the incomplete operation.
7. **Single-writer enforcement.** Two app instances must not write to the same storage root simultaneously.
8. **Plane separation (future).** Active workspace data and recovery/governance data should eventually live in separate directory trees.
9. **No automatic bidirectional sync.** Changes in active data must not automatically overwrite vault data, and vice versa.
10. **Corruption containment.** Any detected corruption must be reported, quarantined where possible, or made recoverable — never silently propagated.

## Safety Invariants

These are the non-negotiable invariants that every future version must preserve:

1. **Failed load must not write back invalid or empty state.**
2. **Save failure must not destroy the previous valid file.**
3. **Dangerous operations must create recoverable checkpoints.**
4. **Migration must be dry-run first, then applied only when blockers are resolved.**
5. **Restore must be staged, verifiable, and rollback-aware.**
6. **Interrupted operations must be discoverable on next startup.**
7. **Two app instances must not write to the same storage root at the same time.**
8. **Active workspace data and recovery/governance data should eventually be separated.**
9. **No automatic bidirectional sync between active data and vault data.**
10. **Any corruption must be reported, quarantined, or made recoverable; it must not silently propagate.**

## Proposed Architecture

The architecture evolves from v0.1.4's single-layer safety toward a multi-layered reliability model.

### Layer model

```text
┌─────────────────────────────────────────────┐
│  Layer 5: Dual-Plane Data Model (future)    │
│  CheerioFlowData ←→ CheerioFlowVault        │
├─────────────────────────────────────────────┤
│  Layer 4: Governance & Audit (future)        │
│  policy.json, audit-log.jsonl, retention    │
├─────────────────────────────────────────────┤
│  Layer 3: Verification & Integrity          │
│  checksums, backup verification, test matrix│
├─────────────────────────────────────────────┤
│  Layer 2: Operational Safety                │
│  atomic save, journal, single-writer lock   │
├─────────────────────────────────────────────┤
│  Layer 1: Foundation (v0.1.4)               │
│  persistence gate, backup, restore, dry-run │
└─────────────────────────────────────────────┘
```

### Module overview

#### 1. Fail-closed Persistence Gate (v0.1.4 — completed)

**Current implementation:** `loadedRef` + `canPersistRef` in `src/App.tsx`.

**Responsibility:**

```text
load failed → disable persistence → block autosave → preserve existing files
```

When `loadDatabase` throws, `canPersistRef` is set to `false`. This prevents `saveAllNow` and the autosave `useEffect` from calling `persistDatabase`. The Rust backend also independently refuses empty project-list payloads via `save_database_to`.

**Future enhancement:** The gate should also prevent the save UI from appearing functional when persistence is blocked. Currently the save status shows "error", but this could be clearer.

#### 2. Atomic Save Layer (planned: v0.1.6)

**Current gap:** `write_json` in `lib.rs` uses `fs::write` directly — a direct overwrite. If the process crashes or the disk fills mid-write, the target file is left half-written, and the previous valid content is lost.

**Planned implementation:**

```text
write to temp file (e.g. {filename}.tmp)
flush to OS
fsync the temp file
rename temp → target (atomic on same filesystem)
fsync parent directory (where possible)
cleanup leftover .tmp files on startup
```

**Target invariant:**

```text
old file remains complete OR new file becomes complete
```

**Files covered:**

- `projects/*.json` (project files)
- `groups.json`
- `app-state.json`
- `backup-manifest.json`
- Migration reports
- Journal files (future)
- `cheerio-flow-bootstrap.json`

**Platform note:** On Windows, `fsync` / `FlushFileBuffers` behavior differs from POSIX. The atomic rename (`MoveFileEx` with `MOVEFILE_REPLACE_EXISTING`) is the critical guarantee. The implementation should handle Windows specifically.

#### 3. Operation Journal / Recovery Mode (planned: v0.1.7)

**Purpose:** Detect interrupted operations on startup and provide recovery paths.

**Journal entries:**

```json
{ "operation": "restore", "phase": "started", "timestamp": "...", "backupId": "..." }
{ "operation": "restore", "phase": "committed", "timestamp": "..." }
{ "operation": "migration", "phase": "started", "timestamp": "...", "fromVersion": 1, "toVersion": 2 }
{ "operation": "migration", "phase": "committed", "timestamp": "..." }
{ "operation": "delete", "phase": "started", "timestamp": "...", "projectId": "..." }
{ "operation": "delete", "phase": "committed", "timestamp": "..." }
```

**Startup detection:**

If the journal shows an unfinished operation (started but not committed):

1. Open the app in **read-only mode**.
2. Present the incomplete operation to the user.
3. Offer recovery options:
   - **Rollback** to pre-operation state.
   - **Retry** the operation.
   - **Choose a different storage root** to inspect data safely.
4. Log the recovery decision.

**Journal file location:**

```text
CheerioFlowData/.cheerio/journal.jsonl
```

#### 4. Single-writer Lock (planned: v0.1.8)

**Purpose:** Prevent two Cheerio Flow instances from writing to the same storage root simultaneously.

**Lock file:**

```text
CheerioFlowData/.cheerio/storage-lock.json
```

**Lock file contents:**

```json
{
  "pid": 12345,
  "instanceId": "uuid",
  "acquiredAt": "2026-06-30 12:00:00",
  "hostname": "research-laptop"
}
```

**Behavior:**

| Condition | Behavior |
|---|---|
| No lock file | Acquire lock, proceed normally |
| Lock file exists, process alive | Refuse write, offer read-only mode |
| Lock file exists, process dead (stale lock) | Warn user, offer to break lock |
| Lock file corrupted | Treat as stale, offer to recreate |

**Stale lock detection:** Check if the PID in the lock file is still running. On Windows, `OpenProcess` + `GetExitCodeProcess` can determine this.

**Read-only fallback:** When another instance holds the lock, open in read-only mode and display a clear message. The user can browse data but cannot modify it.

#### 5. Backup Manifest v2 / Checksums (planned: v0.1.9)

**Current manifest (v1):**

```json
{
  "manifestVersion": 1,
  "backupId": "backup-20260630-120000",
  "createdAt": "2026-06-30 12:00:00",
  "dataVersion": 1,
  "sourceDataDir": "...",
  "backupDir": "...",
  "projectFileCount": 5,
  "copiedFileCount": 7,
  "totalBytes": 12345,
  "warnings": []
}
```

**Planned manifest v2 additions:**

```json
{
  "manifestVersion": 2,
  "files": [
    {
      "relativePath": "projects/project-abc.json",
      "size": 4096,
      "sha256": "abc123..."
    },
    {
      "relativePath": "groups.json",
      "size": 1024,
      "sha256": "def456..."
    }
  ],
  "appVersion": "0.1.9",
  "projectCount": 5,
  "groupCount": 2,
  "reason": "pre-migration"
}
```

**New fields:**

| Field | Purpose |
|---|---|
| `files[]` | Per-file path, size, SHA-256 |
| `appVersion` | Cheerio Flow version that created the backup |
| `projectCount` | Number of project files |
| `groupCount` | Number of groups |
| `reason` | Why the backup was created (manual, pre-migration, pre-restore, auto) |

**Verification uses:**

- **Before restore:** Verify all files in manifest exist and match checksums.
- **After restore:** Verify restored files match manifest.
- **Backup listing:** Flag backups with checksum mismatches as potentially corrupted.
- **Corruption detection:** Identify which specific file in a snapshot is damaged.

#### 6. Versioned Migration Engine (planned: v0.1.5+)

**Purpose:** Formalize the migration from dry-run preview to a safe, reversible execution engine.

**Migration lifecycle:**

```text
1. detect version     — read dataVersion from app-state.json
2. dry-run            — generate plan, identify blockers
3. require backup     — enforce backup before migration
4. resolve blockers   — user fixes issues reported by dry-run
5. stage              — create staging copy of target layout
6. apply              — execute file moves/rewrites in staging
7. verify             — validate staged result
8. commit             — rename staging to active (atomic swap)
9. write journal      — record committed migration
10. write report      — persist migration report
```

**Rollback:** If verification fails at step 7, discard staging and report errors. The original data is untouched.

**First formal migration (v0.1.5):**

```text
dataVersion 1 → dataVersion 2
flat projects/ layout → group-folder layout

projects/{project-id}.json
→ projects/ungrouped/{project-id}.json   (for ungrouped projects)
→ projects/groups/{group-id}/{project-id}.json   (for grouped projects)
```

**Post-migration:** `app-state.json` `dataVersion` is updated to `2`.

#### 7. Data Safety Test Matrix (planned: v0.2.0)

**Purpose:** A structured test document and (eventually) automated test suite that validates every safety invariant against destructive scenarios.

**Test scenarios:**

| Scenario | Expected behavior | Invariant checked |
|---|---|---|
| Bad project JSON (malformed) | Load fails, persistence disabled, existing files preserved | #1, #10 |
| Bad groups.json | Load fails or reports integrity warning, no destructive save | #1, #10 |
| Bad app-state.json | Graceful fallback to defaults, no destructive save | #1, #10 |
| Half-written project file (truncated JSON) | Load fails or skips file, reports warning | #1, #10 |
| Restore interrupted (crash mid-rename) | Next startup detects staging dir or before-restore dir, offers recovery | #6 |
| Migration interrupted (crash mid-apply) | Next startup detects journal entry, offers rollback | #4, #6 |
| Permission denied on save | Error surfaced, previous file intact | #2 |
| File locked by another process | Error surfaced, no silent skip | #2 |
| Disk full during save | Temp file write fails, original file untouched (after atomic save) | #2 |
| Two app instances writing | Second instance blocked by lock file, read-only fallback | #7 |
| Wrong storage root (empty dir) | Bootstrap created, no existing data destroyed | #1 |
| Wrong storage root (has CheerioFlowData) | Data loaded normally, previous storage root data untouched | #1 |
| Bad backup manifest | Restore blocked, error reported | #5 |
| Backup checksum mismatch | Restore blocked or warned, specific file identified | #5 |
| Corrupted backup data dir | Validation fails before restore, original data safe | #5, #10 |

**For each test, verify:**

- No silent data loss.
- No unsafe write after failed load.
- Recovery path remains visible to the user.
- Backup or previous state remains available.

#### 8. Dual-Plane Local Data Model (future: v0.2.1+)

This is a future design direction. See `docs/IDEAS_DUAL_PLANE_LOCAL_DATA_MODEL.md` for the full design document.

**Summary:**

```text
Active Plane:    CheerioFlowData/    ← current editable workspace
Governance Plane: CheerioFlowVault/  ← local pseudo-cloud vault
```

The vault stores snapshots, backup manifests, audit logs, journals, recovery data, and quarantined corrupted files.

Core rules:
- Vault is not a sync folder.
- Data → Vault only through controlled operations (snapshot, backup, checkpoint).
- Vault → Data only through controlled operations (restore, recover, import).
- No automatic bidirectional sync.
- Corruption in one plane must not pollute the other.

## Roadmap

### Phase 1: Operational Safety (v0.1.5 – v0.1.8)

```text
v0.1.5 — Real Group Folder Migration
  - dataVersion 1 → 2 migration
  - dry-run required before migration
  - backup required before migration
  - staging + verify + commit
  - rollback-aware
  - migration report written to disk

v0.1.6 — Atomic Save Layer
  - atomic_write_json helper
  - temp file + fsync + atomic rename
  - no partial JSON writes
  - leftover .tmp cleanup on startup
  - applies to all persistence paths

v0.1.7 — Operation Journal / Recovery Mode
  - journal restore/migration/delete events
  - detect interrupted operation on startup
  - recovery UI state (read-only mode)
  - rollback / retry / inspect options

v0.1.8 — Single-writer Lock
  - storage-lock.json in .cheerio/
  - prevent multiple app instances writing same storage root
  - stale lock detection (PID check)
  - read-only fallback when locked
```

### Phase 2: Verification & Integrity (v0.1.9 – v0.2.0)

```text
v0.1.9 — Backup Manifest v2
  - file list with relative paths
  - SHA-256 checksums
  - appVersion, projectCount, groupCount, reason
  - backup verification before restore
  - restored-file verification after restore

v0.2.0 — Data Safety Test Matrix
  - structured test document
  - destructive scenario descriptions
  - bad JSON / interrupted operation / permission tests
  - no-data-loss invariant verification per test
```

### Phase 3: Governance Foundation (v0.2.1 – v0.2.2)

```text
v0.2.1 — Dual-Plane Local Data Model Draft
  - CheerioFlowData + CheerioFlowVault directory separation
  - snapshot / restore controlled exchange
  - no automatic bidirectional sync
  - quarantine directory for corrupted files

v0.2.2 — Local Governance Layer
  - policy.json (retention rules, backup frequency)
  - audit-log.jsonl (structured event log)
  - retention enforcement for old snapshots
```

### Phase 4: Validation (v0.3.0)

```text
v0.3.0 — Closed Alpha Testing
  - small group testing after data reliability baseline is stable
  - real-world migration scenarios
  - interruption recovery testing
  - cross-platform validation (Windows, macOS, Linux)
```

### Ordering rationale

1. **v0.1.5 (Migration)** comes first because v0.1.4 already has the dry-run infrastructure, and the group-folder layout is needed before adding more files to the data directory.
2. **v0.1.6 (Atomic Save)** comes before journal and lock because it fixes the most fundamental write-safety gap.
3. **v0.1.7 (Journal)** depends on atomic save — journal entries themselves must be written atomically.
4. **v0.1.8 (Lock)** is relatively self-contained and can be developed in parallel with v0.1.6–v0.1.7 if resources allow.
5. **v0.1.9 (Manifest v2)** builds on the backup infrastructure and enables verification.
6. **v0.2.0 (Test Matrix)** is documentation-first and can be started earlier in parallel.
7. **v0.2.1–v0.2.2 (Dual-Plane)** is a significant architectural change that should only be attempted after the operational safety layers (atomic save, journal, lock) are solid.

## Testing Strategy

### Test categories

| Category | Scope | Automation |
|---|---|---|
| Unit tests | Individual Rust functions (atomic write, lock acquire, checksum) | cargo test |
| Integration tests | Tauri command end-to-end (save → load → verify) | cargo test + test fixtures |
| Scenario tests | Destructive scenarios from test matrix | Manual + scripted |
| Platform tests | Windows, macOS, Linux file behavior | Manual per platform |
| Regression tests | Re-run scenario tests on each release | Manual checklist → automated over time |

### Test fixture design

Test fixtures should include:

- `fixtures/healthy-v1/` — a valid v1 flat-layout data directory
- `fixtures/corrupt-project-json/` — one project file is malformed JSON
- `fixtures/half-written-project/` — one project file is truncated
- `fixtures/missing-groups-json/` — groups.json does not exist
- `fixtures/duplicate-project-ids/` — two projects share the same ID
- `fixtures/post-migration-v2/` — a valid v2 group-folder layout

### Invariant checks per test

Every test must explicitly verify:

1. No silent data loss — original files still exist and are unchanged.
2. No unsafe write after failed load — no new/modified files when persistence is gated.
3. Recovery path visible — error messages or UI state indicate recovery options.
4. Backup/previous state available — pre-operation checkpoint exists and is valid.

## Future Dual-Plane Local Data Model

See the companion document:

```text
docs/IDEAS_DUAL_PLANE_LOCAL_DATA_MODEL.md
```

This is a design idea for v0.2.1+, not an immediate implementation target. The operational safety layers (atomic save, journal, lock) must be solid before introducing plane separation.

## Terminology

| Term | Definition |
|---|---|
| **Persistence gate** | `loadedRef` + `canPersistRef` — blocks save after failed load |
| **Atomic save** | Write to temp, fsync, rename — old file survives write failure |
| **Operation journal** | Append-only log of multi-step operations for crash recovery |
| **Single-writer lock** | File-based mutual exclusion preventing concurrent writes |
| **Staging** | Writing results to a temporary directory before atomically swapping into place |
| **Rollback** | Reverting to pre-operation state on failure |
| **Dry-run** | Read-only preview of an operation's effects |
| **Checksum verification** | Comparing SHA-256 hashes to detect corruption |
| **Active Plane** | `CheerioFlowData/` — the live editable workspace |
| **Governance Plane** | `CheerioFlowVault/` — local pseudo-cloud vault for snapshots and recovery |
| **Quarantine** | Isolated storage for corrupted files pending inspection |
| **Bootstrap** | `cheerio-flow-bootstrap.json` — records the active storage root path |
| **Data version** | `dataVersion` field in `app-state.json` — tracks storage format version |
| **Recovery mode** | Read-only app state entered when an interrupted operation is detected |

---

*This document describes the planned evolution of Cheerio Flow's data reliability architecture. It is a living document and will be updated as implementation progresses and requirements evolve.*
