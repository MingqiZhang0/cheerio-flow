# Dual-Plane Local Data Model

**Status: Idea / Not implemented**

This document records a future design direction for separating active workspace data from local pseudo-cloud governance data.

**This is not implemented yet.**
**This is not cloud sync.**
**This is not enterprise cloud security.**
**This is a local-first reliability and recovery design.**

## Motivation

### Why separate?

Currently (v0.1.4), Cheerio Flow stores everything in a single directory tree:

```text
CheerioFlowData/
  projects/
  groups.json
  app-state.json
```

Backups are stored in a sibling directory:

```text
CheerioFlowBackups/
  backup-YYYYMMDD-HHMMSS/
    CheerioFlowData/
    backup-manifest.json
```

This works for basic backup and restore, but as the reliability model grows, several directories will accumulate around the storage root:

```text
SelectedParentFolder/
  CheerioFlowData/                        ← active workspace
  CheerioFlowData.before-restore-*        ← leftover rollback dirs
  CheerioFlowBackups/                     ← backup snapshots
  .restore-staging-*                      ← leftover staging dirs
```

Mixing active data, backup data, rollback artifacts, and staging directories in a flat parent folder becomes hard to reason about. As we add journals, audit logs, checksum manifests, and quarantined files, the sprawl will increase.

### The key insight

Active workspace data and governance/recovery data serve different purposes and should have different durability expectations:

| Concern | Active Plane | Governance Plane |
|---|---|---|
| **Primary purpose** | Daily editing | Recovery and audit |
| **Write frequency** | Every few seconds (autosave) | On snapshots, migrations, restores |
| **Integrity expectation** | Best-effort, repair-friendly | Must remain trustworthy |
| **Corruption impact** | Loses current unsaved work | Loses recovery capability |
| **User interaction** | Direct editing | Indirect, through controlled operations |

When these concerns share a directory tree, a bug in the active data path can accidentally corrupt backup manifests or journal entries. Conversely, a corrupted vault snapshot should not be able to overwrite active work.

## The Two Planes

### Active Plane: `CheerioFlowData`

```text
CheerioFlowData/
  .cheerio/
    storage-lock.json       ← single-writer lock
    journal.jsonl           ← operation journal
  projects/
    ungrouped/
      {project-id}.json
    groups/
      {group-id}/
        {project-id}.json
  groups.json
  app-state.json
```

**Responsibilities:**

- Store the current editable workspace.
- Accept frequent writes (autosave).
- Host the single-writer lock and operation journal.
- Be the target of restore operations.
- Be the source of snapshot/backup operations.

**Integrity expectation:** Best-effort. If corrupted, the Governance Plane should provide recovery options.

### Governance Plane: `CheerioFlowVault`

```text
CheerioFlowVault/
  policy.json               ← governance rules
  audit/
    audit-log.jsonl          ← structured event log
  snapshots/
    snapshot-YYYYMMDD-HHMMSS/
      manifest.json          ← snapshot manifest with checksums
      data/
        projects/
        groups.json
        app-state.json
  backups/
    backup-YYYYMMDD-HHMMSS/
      manifest.json
      data/
  journal/
    migration-*.json         ← migration reports
    restore-*.json           ← restore reports
  recovery/
    before-restore-*         ← preserved pre-restore states
  quarantine/
    corrupt-{timestamp}-*    ← quarantined corrupted files
```

**Responsibilities:**

- Store snapshots, backups, and recovery data.
- Host audit logs and governance policies.
- Provide recovery sources for the Active Plane.
- Quarantine corrupted files for inspection.
- Never accept direct writes from the autosave path.

**Integrity expectation:** High. The vault is the last line of defense. If the vault is corrupted, recovery capability is lost.

## Controlled Exchange

Data must only flow between the planes through explicit, controlled operations. There is no automatic synchronization.

### Active → Vault (Data → Vault)

```text
Operations that write FROM Active Plane TO Vault:
  - Create snapshot   (manual or policy-driven)
  - Create backup     (manual, pre-migration, pre-restore)
  - Create checkpoint (pre-migration, pre-restore)
  - Quarantine file   (corruption detected, move to quarantine)
```

Each of these operations:
1. Reads from `CheerioFlowData` (read-only toward source).
2. Writes to `CheerioFlowVault` (creates new files, never overwrites existing vault data).
3. Writes a manifest or journal entry.
4. Never modifies active data during the operation.

### Vault → Active (Vault → Data)

```text
Operations that write FROM Vault TO Active Plane:
  - Restore snapshot  (user-initiated, with confirmation)
  - Recover from backup
  - Import from quarantine (after manual inspection)
```

Each of these operations:
1. Reads from `CheerioFlowVault` (read-only toward source).
2. Creates a pre-restore snapshot in the vault.
3. Stages the restored data.
4. Atomically swaps into `CheerioFlowData`.
5. Supports rollback on failure.

### What does NOT happen

```text
❌ Autosave from Active Plane does NOT write to Vault.
❌ Vault snapshot updates do NOT push to Active Plane.
❌ Deleting a project does NOT delete its vault snapshots.
❌ Corrupted vault files do NOT overwrite active workspace.
❌ Active workspace corruption does NOT automatically corrupt vault.
```

## Why the Vault is Not a Sync Folder

Sync folders (Dropbox, OneDrive, Google Drive) operate on a fundamentally different model:

| Property | Sync Folder | CheerioFlowVault |
|---|---|---|
| Write trigger | Any file change | Explicit controlled operations |
| Conflict resolution | Automatic merge or "conflicted copy" | No merge — operations are atomic |
| Bidirectional | Yes — changes propagate both ways | No — strictly controlled exchange |
| Real-time | Near real-time | On-demand, operation-driven |
| Version history | Provider-managed, opaque | Application-managed, transparent |
| Corruption propagation | Yes — corrupted file syncs everywhere | No — corruption is contained |

The vault is closer to a **local versioned artifact repository** than a sync folder. It is a write-once, read-for-recovery store.

## Corruption Containment

### Scenario: Active workspace gets corrupted

```text
CheerioFlowData/projects/important-project.json ← corrupted (half-written JSON)

What happens:
1. Next load detects the bad JSON.
2. Persistence gate engages — autosave blocked.
3. User is notified of the corruption.
4. Vault snapshots remain untouched.
5. User can restore from the last known-good vault snapshot.
```

The vault is not affected by active workspace corruption because the vault is never the target of autosave.

### Scenario: A vault snapshot gets corrupted

```text
CheerioFlowVault/snapshots/snapshot-20260630/data/projects/important-project.json ← corrupted (disk error)

What happens:
1. Snapshot manifest has a checksum for that file.
2. Snapshot listing detects checksum mismatch.
3. That snapshot is marked with a warning, not deleted.
4. Other snapshots are independently verified.
5. Active workspace data is not touched.
```

The active workspace is not affected by vault corruption because restore requires explicit user action and verification.

### Scenario: Both planes are independently corrupted

```text
Even if both planes have partial corruption, they are unlikely to be corrupted in the same way.
The user can manually inspect snapshots, pick known-good files, and recover partial data.
```

## Future: Governance Layer

On top of the dual-plane model, a governance layer can enforce policies:

```json
// CheerioFlowVault/policy.json
{
  "snapshot": {
    "autoBeforeMigration": true,
    "autoBeforeRestore": true,
    "maximumCount": 20,
    "minimumFreeDiskPercent": 10
  },
  "retention": {
    "keepManualBackups": "forever",
    "keepPreMigrationSnapshots": 5,
    "keepPreRestoreSnapshots": 10
  },
  "verification": {
    "checksumAlgorithm": "sha256",
    "verifyBeforeRestore": true,
    "verifyOnListing": true
  }
}
```

Audit log example:

```jsonl
{"ts":"2026-06-30T12:00:00Z","op":"snapshot.create","id":"snapshot-20260630-120000","reason":"manual"}
{"ts":"2026-06-30T12:05:00Z","op":"migration.start","fromVersion":1,"toVersion":2}
{"ts":"2026-06-30T12:05:02Z","op":"snapshot.create","id":"snapshot-20260630-120500","reason":"pre-migration"}
{"ts":"2026-06-30T12:05:10Z","op":"migration.commit","fromVersion":1,"toVersion":2}
{"ts":"2026-06-30T12:30:00Z","op":"restore.start","snapshotId":"snapshot-20260630-120000"}
{"ts":"2026-06-30T12:30:01Z","op":"snapshot.create","id":"snapshot-20260630-123000","reason":"pre-restore"}
{"ts":"2026-06-30T12:30:05Z","op":"restore.commit","snapshotId":"snapshot-20260630-120000"}
```

## Directory Layout Summary

```text
SelectedParentFolder/
  CheerioFlowData/              ← Active Plane
    .cheerio/
      storage-lock.json
      journal.jsonl
    projects/
      ungrouped/
      groups/
    groups.json
    app-state.json
  CheerioFlowVault/             ← Governance Plane
    policy.json
    audit/
      audit-log.jsonl
    snapshots/
    backups/
    journal/
    recovery/
    quarantine/
```

## When to Implement

This design is targeted at **v0.2.1 or later**. It should NOT be implemented before the foundational layers are in place:

- **v0.1.5 (Migration):** Needed to establish the group-folder layout that the vault will snapshot.
- **v0.1.6 (Atomic Save):** Needed so that vault manifests and journal entries are written atomically.
- **v0.1.7 (Operation Journal):** Needed so that vault operations themselves are recoverable.
- **v0.1.8 (Single-writer Lock):** Needed so that vault operations don't race with another instance.
- **v0.1.9 (Manifest v2 / Checksums):** The vault's snapshot manifests depend on checksum verification.

Attempting dual-plane separation before these layers exist would create a vault that cannot guarantee its own integrity — defeating its purpose.

## Relationship to Other Features

- **Backup and restore** become operations that move data between planes.
- **Migration** writes pre- and post-migration snapshots to the vault.
- **Integrity scanning** can compare active data against the last known-good vault snapshot.
- **Repair tools** can use vault snapshots as reference data for partial recovery.

## What This Is Not

To be absolutely clear:

- ❌ Not a cloud storage backend.
- ❌ Not a sync engine.
- ❌ Not a version control system (no branching, no merging, no diff).
- ❌ Not an encrypted vault (though encryption could be layered on top later).
- ❌ Not a backup-to-cloud feature.
- ❌ Not a collaborative editing substrate.
- ❌ Not a database replication mechanism.

It is a **local-first, operation-driven, corruption-containing directory separation** for a desktop research workflow application.

---

*This is a design idea document. Implementation details will evolve as the foundational layers are built and tested. Nothing in this document is a commitment to a specific release date or feature set.*
