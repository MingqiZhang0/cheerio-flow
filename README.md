# Cheerio Flow

[English](./README.md) | [中文版](./README_CN.md)

Local-first desktop research workflow planning tool built with Tauri, React, TypeScript, Rust, React Flow, and KaTeX.

Cheerio Flow is designed for researchers, students, and technical writers who need to plan complex research processes visually: concepts, equations, assumptions, datasets, experiments, arguments, dependencies, and presentation structure can be arranged as editable nodes and arrows on a local canvas.

The project is in active development. v0.1.7 introduces snapshot manifest and SHA-256 integrity warnings, building on v0.1.6's atomic save, v0.1.5's group-folder migration, and v0.1.4's data-safety foundation.

## Current version

```text
v0.1.7 — Snapshot Manifest & Integrity Warnings
```

v0.1.7 introduces a **snapshot manifest** for active workspace files, **SHA-256 checksums**, and **warning-mode load verification**, building on the v0.1.6 Atomic Save foundation.

### v0.1.7 highlights

#### Snapshot manifest

After every successful active save, Cheerio Flow writes a snapshot manifest:

```
CheerioFlowData/.cheerio/snapshot-manifest.json
```

The manifest records each active workspace file with its role, size, and SHA-256 checksum. It covers:

- `app-state.json`
- `groups.json`
- Active project JSON files (canonical paths only)

It explicitly excludes backup files, stale quarantine files, `.tmp` files, and non-canonical project paths.

The manifest is written atomically (same write-temp → flush → sync_all → verify → rename pipeline as active data).

#### Warning-mode load verification

On successful load, Cheerio Flow verifies the snapshot manifest in **warning-mode**. Manifest issues never block access to valid active data:

| Scenario | Behavior |
|---|---|
| Manifest missing | Warning — load proceeds |
| Manifest corrupt (bad JSON) | Warning — load proceeds |
| Checksum mismatch | Warning — load proceeds |
| Size mismatch | Warning — load proceeds |
| Extra active file (disk not in manifest) | Warning — load proceeds |
| Manifest-listed file missing from disk | Warning — load proceeds |
| Active project JSON corrupt | **Blocked** — load fails |
| Duplicate project ID | **Blocked** — load fails |

The active JSON load gate still takes priority. Manifest problems warn; active data corruption still blocks.

#### Manifest write failure does not fail active save

If the manifest cannot be written (e.g. permission issue, `.cheerio` is a file instead of a directory), the active save still succeeds. The failure is surfaced as a `manifest/warning` in the Storage Console — never as **Save failed**.

#### Storage Console manifest warnings

The Storage Console (introduced in v0.1.6) now displays `manifest/warning` events for both save-time and load-time manifest issues. The Console remains read-only — no repair, retry, or recalculate buttons. No Recovery Center was added.

#### Warning message sanitization

All user-visible manifest warning messages use relative paths only. Local absolute paths are never exposed in warning text or Storage Console copy output.

#### Browse directory memory

The Browse folder picker now remembers the last manually selected outer storage root as a local UI preference (`localStorage` key: `cheerio-flow:last-browse-directory`). This does not write to workspace data or affect save/load correctness.

### v0.1.6 recap (foundation for v0.1.7)

v0.1.7 is built on the v0.1.6 Atomic Save foundation:

- **Atomic write for active JSON** — project files, `groups.json`, `app-state.json` all use write-temp → flush → sync_all → verify → rename.
- **Storage Operation Console** — read-only modal displaying in-memory storage events (Copy Log, Clear, Close, Escape).
- **Storage event buffer** — frontend ring buffer (capacity 512), not persisted.

### v0.1.5 recap

v0.1.5 introduced the **group-folder migration** engine:

- **dataVersion 2** group-folder layout.
- Dry-run + MIGRATE confirmation + backup + staging + verification + rollback.
- v1 workspaces are fully supported — no automatic migration.
- Duplicate project IDs and bad JSON block load and migration.

## What this project does

Cheerio Flow provides a local desktop workspace for building research process diagrams.

Core use cases include:

* Planning a research project structure.
* Mapping assumptions, methods, experiments, datasets, conclusions, and open problems.
* Creating visual dependency graphs between modules.
* Drafting report, paper, thesis, or presentation logic.
* Keeping project files local as JSON data.
* Backing up and restoring local project data before risky changes.
* Previewing future storage migrations before they are applied.

This is not a cloud service. Cheerio Flow is designed as a local-first desktop application.

## What v0.1.4 fixes

v0.1.4 was created to solve one central problem:

```text
Before changing the project storage layout, the application must first become safe against accidental data loss.
```

This release adds protection around several high-risk areas.

### 1. Destructive save prevention after load failure

A previous failure mode was identified:

```text
Bad project JSON
→ load failed
→ frontend state could become empty
→ autosave could persist empty projects
→ stale cleanup could delete project files
```

v0.1.4 adds a persistence gate:

```text
loadedRef + canPersistRef
```

The app now refuses to save after a failed load until a valid database has been loaded again.

The Rust save path also refuses empty project-list payloads as a defensive measure.

### 2. Read-only startup integrity scan

On startup, the app performs a read-only integrity scan.

The scan checks for issues such as:

* Project file stem and project ID mismatch.
* Duplicate project IDs.
* Invalid group references.
* Missing project references in groups.
* Inconsistent group membership metadata.

The scan does not repair data automatically.

It only reports issues so that future repair or migration tools can be built safely.

### 3. Manual full backup

v0.1.4 adds manual full backup creation.

A backup copies the current `CheerioFlowData` folder into a sibling backup directory:

```text
CheerioFlowBackups/
  backup-YYYYMMDD-HHMMSS/
    CheerioFlowData/
    backup-manifest.json
```

The backup system is conservative:

* Reads from the source data folder.
* Writes to a sibling backup folder.
* Skips symlinks.
* Skips temporary and lock files.
* Uses atomic backup directory creation to avoid timestamp collision.
* Writes a backup manifest.

### 4. Restore from full backup

v0.1.4 adds restore from backup.

Restore is protected by:

* User confirmation.
* Pre-restore backup.
* Staging directory.
* Rename-based replacement.
* Rollback on failure.
* Backup ID validation to reject path traversal.

Restore does not delete the previous data directory directly. The previous data directory is moved aside with a `before-restore` name.

### 5. Migration dry-run

v0.1.4 introduces a read-only dry-run plan for the future v0.1.5 group-folder migration.

The future target layout is expected to be:

```text
CheerioFlowData/
  projects/
    ungrouped/
      {project-id}.json
    groups/
      {group-id}/
        {project-id}.json
  groups.json
  app-state.json
```

The dry-run command does not create folders, copy files, rename files, delete files, write JSON, or modify `dataVersion`.

It only generates a migration report.

### 6. Native storage parent folder picker

v0.1.4 adds a native folder picker through the official Tauri dialog plugin.

The picker only fills the storage root input field.

It does not automatically apply, switch, save, load, restore, repair, or migrate data.

## Supported environment

Primary tested environment:

```text
Windows 11
Tauri desktop application
React + TypeScript frontend
Rust backend through Tauri
pnpm package manager
```

Recommended development requirements:

```text
Node.js LTS
pnpm
Rust stable toolchain
Tauri platform dependencies
Microsoft C++ Build Tools on Windows
WebView2 Runtime on Windows
```

Not fully validated yet:

```text
macOS production packaging
Linux production packaging
Large-scale multi-thousand-node project files
Collaborative editing
Cloud synchronization
```

Cheerio Flow is currently a local desktop prototype. Treat it as early-stage software and keep backups of important project data.

## Quick start

Install dependencies:

```bash
pnpm install
```

Run the frontend development server:

```bash
pnpm dev
```

Run the Tauri desktop development app:

```bash
pnpm desktop:dev
```

Build the frontend:

```bash
pnpm build
```

Build the desktop app:

```bash
pnpm desktop:build
```

Desktop development and desktop packaging require a working Rust/Tauri environment.

## Important warnings

* This is early-stage local-first research software.
* Always back up important project data.
* Do not manually edit project JSON files while the app is running.
* Do not use browser localStorage data as long-term storage.
* Migration dry-run is a read-only preview. Real migration requires typing MIGRATE and clicking Apply Migration.
* Do not choose `CheerioFlowData` itself as the storage parent folder. Choose its parent folder instead.
* If startup reports data integrity issues, create a backup before attempting manual repair.
* If restore fails, inspect the generated error message and the `before-restore` directory before retrying.
* v0.1.4 intentionally avoids automatic repair and automatic migration.

## Main features

| Feature                         |                Status | Notes                                         |
| ------------------------------- | --------------------: | --------------------------------------------- |
| Local desktop app               |           Implemented | Built with Tauri                              |
| Project creation                |           Implemented | Creates local project JSON                    |
| Project deletion                |           Implemented | Uses explicit delete command                  |
| Project switching               |           Implemented | Loads selected project into canvas            |
| Project metadata editing        |           Implemented | Title, category, group, pinned state          |
| Group creation/editing/deletion |           Implemented | Stored in `groups.json`                       |
| Project grouping                |           Implemented | Projects can be assigned to groups            |
| Canvas modules                  |           Implemented | Rectangle, triangle, diamond, circle, ellipse |
| Canvas arrows                   |           Implemented | Source/target direction preserved             |
| Module dragging                 |           Implemented | Arrow positions follow nodes                  |
| Module properties panel         |           Implemented | Content, type, shape, note, enabled state     |
| Arrow properties panel          |           Implemented | Type, note, enabled state, direction          |
| KaTeX rendering                 |           Implemented | Optional LaTeX rendering for module content   |
| Local JSON persistence          |           Implemented | Tauri mode writes to local files              |
| Browser fallback storage        |           Implemented | Development fallback through localStorage     |
| Manual full backup              | Implemented in v0.1.4 | Creates `CheerioFlowBackups`                  |
| Restore from backup             | Implemented in v0.1.4 | Uses staging and rollback                     |
| Startup integrity scan          | Implemented in v0.1.4 | Read-only                                     |
| Migration dry-run               | Implemented in v0.1.4 | Read-only preview                             |
| Native folder picker            | Implemented in v0.1.4 | Does not auto-switch                          |
| Storage drawer                  | Implemented in v0.1.4 | Session-only UI state                         |
| Project details panel           | Implemented in v0.1.4 | Open/close independently                      |
| CSV preview                     |       Not implemented | Planned future extension                      |
| Image asset import              |       Not implemented | Planned future extension                      |
| Presentation mode               |       Not implemented | Planned future extension                      |
| Real group-folder migration     | Implemented in v0.1.5 | Dry-run + MIGRATE confirmation + backup + staging + rollback |
| Atomic write for active JSON  | Implemented in v0.1.6 | write-temp → flush → sync_all → verify → rename              |
| Storage Operation Console     | Implemented in v0.1.6 | Read-only modal, in-memory event log                         |
| Storage event buffer          | Implemented in v0.1.6 | Frontend ring buffer, capacity 512                           |
| Snapshot manifest             | Implemented in v0.1.7 | Active workspace file inventory with SHA-256 checksums       |
| Warning-mode load verification| Implemented in v0.1.7 | Manifest issues warn; active data corruption still blocks    |
| Manifest write failure safety | Implemented in v0.1.7 | Manifest failure does not fail active save                   |
| Browse directory memory       | Implemented in v0.1.7 | localStorage UI preference, not workspace data               |

## Data Safety Architecture

Cheerio Flow treats local data safety as a first-class design goal. The diagram below shows the layered data safety architecture as of v0.1.7.

v0.1.7 adds a **snapshot manifest layer** between active save and backup/restore: after each successful active save, a manifest with SHA-256 checksums is written atomically. Load-time verification runs in warning-mode — manifest issues never block access to valid active data. v0.1.6's atomic write and Storage Console foundations remain intact.

```mermaid
flowchart TD
    subgraph UX["1. Frontend UX"]
        direction LR
        UE["User edit"]
        AS["Autosave / Manual save"]
        BR["Browse storage root"]
        BM["Remember last Browse folder<br/>localStorage only"]
        SB["Status bar"]
        UE --> AS
        BM -.->|"defaultPath"| BR
        BR -.->|"stores selected outer root"| BM
        AS --> SB
    end

    subgraph LOAD["2. Load Gate"]
        direction TB
        LD["Load / Apply storage root"]
        BADJSON["Invalid active JSON"]
        DUPID["Duplicate project ID"]
        BLOCK["Block load"]
        SAFEFAIL["canPersist = false<br/>autosave disabled<br/>disk untouched"]
        LC["Load committed"]
        CAN["canPersist = true"]

        LD -->|"bad JSON"| BADJSON --> BLOCK --> SAFEFAIL
        LD -->|"duplicate ID"| DUPID --> BLOCK
        LD -->|"active data OK"| LC --> CAN
    end

    subgraph SAVE["3. Active Save — v0.1.6 Atomic Write"]
        direction LR
        SR["Save requested"]
        TMP["write .tmp"]
        SYNC["flush + sync_all"]
        VTP["verify temp"]
        REN["rename target"]
        VTF["verify target"]
        SOK["Active save committed"]

        PRESERVE["old target preserved"]
        POSTERR["error surfaced<br/>no rollback after rename"]

        SR --> TMP --> SYNC --> VTP --> REN --> VTF --> SOK
        TMP -->|"pre-rename fail"| PRESERVE
        VTP -->|"verify temp fail"| PRESERVE
        REN -->|"post-rename / target fail"| POSTERR
        VTF -->|"target verify fail"| POSTERR
    end

    subgraph LAYOUT["4. Active Data Layout"]
        direction TB
        DL["Current active layout"]
        V1["v1 flat layout<br/>projects/*.json"]
        V2["v2 group-folder layout<br/>projects/ungrouped/<br/>projects/groups/&lt;group-id&gt;/"]
        NOMIG["No silent v1 → v2 migration"]

        DL --> V1
        DL --> V2
        V1 --> NOMIG
        V2 --> NOMIG
    end

    subgraph MGEN["5A. Snapshot Manifest Generation — v0.1.7"]
        direction LR
        INV["Collect active file inventory"]
        HASH["SHA-256 + size"]
        BUILD["Build manifest in memory"]
        MWRITE["Atomic write<br/>.cheerio/snapshot-manifest.json"]
        MOK["Manifest updated"]
        MFAIL["Manifest write failed<br/>active save still OK"]

        INV --> HASH --> BUILD --> MWRITE
        MWRITE -->|"ok"| MOK
        MWRITE -->|"fail"| MFAIL
    end

    subgraph MVERIFY["5B. Snapshot Manifest Verification — v0.1.7"]
        direction TB
        WV["Warning-mode verify<br/>after successful load"]
        WOK["Manifest OK"]
        WISSUE["Manifest issue detected"]
        WLIST["missing / corrupt / invalid schema<br/>size mismatch / checksum mismatch<br/>extra active file / missing listed file<br/>dataVersion or layout mismatch"]
        WNONBLOCK["Do not block load<br/>do not repair<br/>do not auto-regenerate"]

        WV -->|"clean"| WOK
        WV -->|"issue"| WISSUE --> WLIST --> WNONBLOCK
    end

    subgraph SAFETY["6. Existing Safety Paths"]
        direction LR
        BK["Backup"]
        RS["Restore"]
        MG["Migration"]
        SQ["Stale / tmp / quarantine exclusion"]
    end

    subgraph CONSOLE["7. Storage Console — v0.1.6 / v0.1.7"]
        direction TB
        EV["load / storage-root / save events"]
        MW["manifest/warning"]
        SC["Read-only Storage Console"]
        COPY["Copy log"]
        CLEAR["Clear / Close / Esc"]
        NOFIX["No repair / retry / recalculate"]

        EV --> SC
        MW --> SC
        SC --> COPY
        SC --> CLEAR
        SC --> NOFIX
    end

    subgraph DEFER["8. Deferred — Not in v0.1.7"]
        direction LR
        D1["single-writer lock"]
        D2["Recovery Center"]
        D3[".tmp auto-cleanup"]
        D4["kill-process test"]
        D5[".chf package"]
        D6["nested workflow graph"]
    end

    UE --> AS
    AS --> SR
    LD --> LC
    CAN --> SR
    SOK --> DL
    SOK --> INV
    LC --> WV

    SOK -.-> EV
    LD -.-> EV
    LC -.-> EV
    MFAIL -.-> MW
    WISSUE -.-> MW
    BK -.-> EV
    RS -.-> EV
    MG -.-> EV
    SQ -.-> EV

    style UX fill:#ede7f6,stroke:#7c4dff
    style LOAD fill:#fff3e0,stroke:#ff9800
    style SAVE fill:#c8e6c9,stroke:#388e3c
    style LAYOUT fill:#e3f2fd,stroke:#1976d2
    style MGEN fill:#fce4ec,stroke:#e91e63
    style MVERIFY fill:#fff0f6,stroke:#c2185b
    style SAFETY fill:#e8f4f8,stroke:#5b9bd5
    style CONSOLE fill:#e8f5e9,stroke:#4caf50
    style DEFER fill:#f5f5f5,stroke:#999,stroke-dasharray: 5 5
```

### How to read this diagram

**Layer 1 (Frontend UX):**

- User edit triggers autosave (~2s debounce) or manual save, which go through the Load Gate first.
- Browse remembers the last manually selected outer storage root as a localStorage-only UI preference — not written to workspace data.

**Layer 2 (Load Gate):**

- A failed load (bad JSON or duplicate project ID) disables the persistence gate — autosave is blocked and existing files are left untouched on disk.
- A successful load opens the gate (`canPersist = true`) and triggers warning-mode manifest verification.

**Layer 3 (Active Save — v0.1.6 Atomic Write):**

- Save writes project JSON, `groups.json`, and `app-state.json` through Atomic Write: `.tmp` → flush → `sync_all` → verify temp → rename → verify target.
- **Pre-rename failure** preserves the old target file. **Post-rename verification failure** is detected and reported, but v0.1.6 does not implement post-rename rollback.

**Layer 4 (Active Data Layout):**

- Active data stays in its native layout: v1 flat or v2 group-folder. v1 autosave does **not** silently migrate to v2.

**Layer 5A (Snapshot Manifest Generation — v0.1.7):**

- After each successful active save: collect inventory → SHA-256 + size → build manifest → atomic write `.cheerio/snapshot-manifest.json`.
- Manifest write failure does **not** fail the active save; it surfaces as a `manifest/warning`.

**Layer 5B (Snapshot Manifest Verification — v0.1.7):**

- On successful load, manifest is verified in **warning-mode**: missing, corrupt, checksum-mismatched, size-mismatched, extra, or missing-listed files produce warnings — never load blockers.
- No repair, no auto-regenerate-on-load.

**Layer 6 (Existing Safety Paths — not rewritten in v0.1.7):**

- Backup, Restore, Migration, and Stale/tmp/quarantine exclusion remain on the v0.1.5 safety model.

**Layer 7 (Storage Console — v0.1.6/v0.1.7):**

- Read-only modal displaying load/save/storage-root events and `manifest/warning` events.
- Supports Copy log, Clear, Close, Escape. No repair/retry/recalculate functionality.

**Layer 8 (Deferred — not in v0.1.7):**

- Single-writer lock, Recovery Center, `.tmp` auto-cleanup, kill-process test, `.chf` package, nested workflow graph are **not implemented** in v0.1.7.

**Summary:** v0.1.7 adds snapshot manifest integrity observation on top of v0.1.6's atomic save foundation. It does **not** claim zero data loss, crash-proof guarantees, or hardware failure protection.

## Data safety features

| Safety feature               | Description                                             |
| ---------------------------- | ------------------------------------------------------- |
| `dataVersion`                | App state records the storage format version (1 or 2).  |
| Load-failed persistence gate | Prevents autosave after failed load.                    |
| Empty-save rejection         | Rust save path refuses empty project-list payloads.     |
| Read-only startup scan       | Detects integrity issues without writing to disk.       |
| Manual backup                | Copies data to timestamped backup folder.               |
| Backup manifest              | Records backup metadata.                                |
| Restore confirmation         | Requires explicit user confirmation before restore.     |
| Pre-restore backup           | Creates backup before restoring another backup.         |
| Staging restore              | Restores into staging first, then renames.              |
| Rollback handling            | Attempts rollback if final replacement fails.           |
| Path traversal defense       | Backup IDs and project/group IDs are validated.         |
| Migration dry-run            | Previews migration plan without modifying files.        |
| Migration staging + verify   | Writes v2 layout to staging, verifies before activation.|
| Before-migration preservation| Preserves pre-migration data as `CheerioFlowData.before-migration-*`. |
| v1/v2 classification         | Workspace layout is classified before load/save routing.|
| Duplicate project ID guard   | Two files with same `project.id` block load and migration.|
| Stale migration report guard | Old dry-run reports are cleared when switching workspaces.|
| Storage error type labels    | Distinguishes Load/Save/Restore/Migration failed in status bar.|
| Ctrl radial menu scope       | Module creation radial menu only opens over the canvas. |
| Atomic write for active JSON | write-temp → flush → sync_all → verify → rename for active saves. |
| Storage operation event buffer | In-memory ring buffer observes storage operations.    |
| Snapshot manifest             | Active workspace file inventory with SHA-256 checksums, written atomically after save. |
| Warning-mode verification     | Manifest issues warn; never block valid active data load. |
| Manifest write failure safety | Manifest failure does not fail active save; surfaced as warning. |
| Manifest path sanitization    | Warning messages use relative paths only; no local absolute paths exposed. |
| Symlink avoidance            | All file operations reject and skip symlinks.           |

## Storage model

Cheerio Flow uses a storage parent folder.

The app creates `CheerioFlowData` inside that parent folder.

For example, if the chosen storage parent folder is:

```text
C:\Users\Alice\AppData\Roaming\com.cheerioflow.desktop
```

then the actual data directory is:

```text
C:\Users\Alice\AppData\Roaming\com.cheerioflow.desktop\CheerioFlowData
```

Do not choose `CheerioFlowData` itself as the storage parent folder.

Choose its parent folder.

## Current data layout

v0.1.7 data layout (dataVersion 2, group-folder, with snapshot manifest):

```text
CheerioFlowData/
  projects/
    ungrouped/
      {project-id}.json
    groups/
      {group-id}/
        {project-id}.json
  groups.json
  app-state.json
  .cheerio/
    snapshot-manifest.json
    stale-project-files/       (quarantined stale files after group move)
```

Legacy v1 data layout (dataVersion 1, still supported for loading and saving):

```text
CheerioFlowData/
  projects/
    {project-id}.json
  groups.json
  app-state.json
```

Backup layout:

```text
CheerioFlowBackups/
  backup-YYYYMMDD-HHMMSS/
    CheerioFlowData/
      projects/
        ...
      groups.json
      app-state.json
    backup-manifest.json
```

Before-migration preservation (created by v1 → v2 migration):

```text
CheerioFlowData.before-migration-YYYYMMDD-HHMMSS/
  projects/
    ...
  groups.json
  app-state.json
```

v0.1.5 performs this migration only through explicit user action (dry-run + MIGRATE confirmation).

## Backup and restore

### Create backup

Use the app UI:

```text
Storage → Backup → Create Full Backup
```

A backup is created under:

```text
CheerioFlowBackups/
  backup-YYYYMMDD-HHMMSS/
```

The backup contains:

```text
CheerioFlowData/
backup-manifest.json
```

### Restore backup

Use the app UI:

```text
Storage → Restore
```

Restore is intentionally conservative.

It performs:

```text
selected backup
→ pre-restore backup
→ staging copy
→ rename current CheerioFlowData to before-restore directory
→ rename staging CheerioFlowData to active CheerioFlowData
→ reload database
```

If restore fails during replacement, the app attempts rollback.

### Restore warning

Restore is a powerful operation.

Before restoring, make sure:

* You know which backup you selected.
* You have enough disk space.
* The app is not being modified by another process.
* The backup is from a compatible Cheerio Flow version.

## Migration dry-run

v0.1.4 includes a dry-run planner for the future group-folder migration.

The dry-run checks:

* Project files.
* Project IDs.
* Group IDs.
* Group membership references.
* Target path collisions.
* Unsafe path segments.
* Duplicate IDs.
* Broken or unreadable JSON files.

The dry-run produces:

* Planned operations.
* Warnings.
* Blockers.
* Source data version.
* Target data version.
* Summary counts.

It does not write anything to disk.

## Repository layout

```text
.
├── README.md
├── LICENSE
├── package.json
├── pnpm-lock.yaml
├── index.html
├── src/
│   ├── App.tsx
│   ├── integrity.ts
│   ├── storage.ts
│   ├── types.ts
│   ├── utils.ts
│   └── styles.css
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       └── lib.rs
└── ...
```

Main files:

| File                        | Role                                                                        |
| --------------------------- | --------------------------------------------------------------------------- |
| `src/App.tsx`               | Main UI, project list, canvas, modules, arrows, panels, backup/restore UI.  |
| `src/types.ts`              | TypeScript data model for projects, groups, modules, arrows, and app state. |
| `src/storage.ts`            | Tauri command wrapper and browser fallback storage.                         |
| `src/integrity.ts`          | Read-only integrity scan logic.                                             |
| `src/utils.ts`              | ID, time, default project/group/module helpers.                             |
| `src/styles.css`            | Application layout and visual styling.                                      |
| `src-tauri/src/lib.rs`      | Rust backend for local storage, backup, restore, and migration dry-run.     |
| `src-tauri/tauri.conf.json` | Tauri application configuration.                                            |
| `package.json`              | Frontend and Tauri scripts.                                                 |
| `LICENSE`                   | MIT License.                                                                |

## Tauri commands

The Rust backend provides local filesystem operations through Tauri commands.

Important command categories:

| Category               | Role                                                    |
| ---------------------- | ------------------------------------------------------- |
| Database load/save     | Load and save local project database.                   |
| Storage root switching | Switch the storage parent folder and reload data.       |
| Project deletion       | Explicitly delete a project file.                       |
| Backup creation        | Create full timestamped backup.                         |
| Backup listing         | List existing backups read-only.                        |
| Restore                | Restore selected full backup with staging and rollback. |
| Migration dry-run      | Generate read-only migration preview.                   |
| Migration apply        | Execute group-folder migration with staging and rollback.|

Normal save paths do not perform stale project cleanup.

Project file deletion is reserved for explicit project deletion.

## What gets changed locally

Cheerio Flow writes only to the selected local storage area.

| Local path                                               | Purpose                                          |
| -------------------------------------------------------- | ------------------------------------------------ |
| `CheerioFlowData/projects/ungrouped/{id}.json`           | Ungrouped project files (v2 layout).             |
| `CheerioFlowData/projects/groups/{gid}/{id}.json`        | Grouped project files (v2 layout).               |
| `CheerioFlowData/projects/{project-id}.json`             | Legacy v1 flat project files (still supported).  |
| `CheerioFlowData/groups.json`                            | Group list and project membership metadata.      |
| `CheerioFlowData/app-state.json`                         | UI/app state, including `dataVersion`.           |
| `CheerioFlowData/.cheerio/snapshot-manifest.json`        | Snapshot manifest — active file inventory with SHA-256 checksums. |
| `CheerioFlowData/.cheerio/stale-project-files/`          | Quarantined stale project files after group move.|
| `CheerioFlowBackups/backup-*/CheerioFlowData/`           | Full backup copy of data folder.                 |
| `CheerioFlowBackups/backup-*/backup-manifest.json`       | Backup metadata.                                 |
| `CheerioFlowData.before-migration-*`                     | Pre-migration data preserved by migration.       |
| `CheerioFlowData.before-restore-*`                       | Previous data folder moved aside during restore. |

Cheerio Flow does not require a server for these operations.

## Validation

### v0.1.7 validation

Automated validation:

```text
cargo fmt --check             # PASS
cargo check                   # PASS
cargo test                    # 86 passed, 0 failed
pnpm exec tsc --noEmit        # PASS
pnpm build                    # PASS (existing Vite chunk-size warning only)
```

Manual desktop validation was completed by the user on a real Windows desktop environment. Claude / Codex did not perform or fabricate native Tauri window interactions.

| ID | Scenario | Result |
|---|---|---|
| A | Fresh workspace / v2 happy path | PASS |
| B | Existing v2 save generates manifest | PASS |
| C | Missing manifest warning-mode load | PASS |
| D | Corrupt manifest warning-mode load | PASS |
| E | Checksum mismatch warning-mode load | PASS |
| F | Size mismatch warning-mode load | PASS |
| G | Extra active file warning | PASS |
| H | Manifest-listed missing file warning | PASS |
| I | Active JSON bad still blocks load | PASS |
| J | Duplicate project ID still blocks load | PASS |
| K | v1 legacy layout compatibility | NOT RUN (no trusted v1 fixture) |
| L | v2 stale/tmp exclusion | PASS |
| M | Manifest write failure does not fail save | PASS |
| N | Storage Console behavior | PASS |
| O | Repo / stash audit | PASS |
| UX | Browse directory memory | PASS |

Two issues were found and resolved during manual testing:

- Save-time manifest warning exposed local absolute path — fixed in `c8f1243`.
- Browse dialog did not remember last selected folder — fixed in `168cfd6`.

Full reports:
- `docs/VALIDATION_v0.1.7.md`
- `docs/MANUAL_TEST_LOG_v0.1.7.md`
- `docs/RELEASE_NOTES_v0.1.7.md`

### v0.1.5 validation

Build validation passed:

```text
git diff --check              # No whitespace errors
pnpm exec tsc --noEmit        # Passed
pnpm build                    # Passed
cargo fmt --check             # Passed
cargo check                   # Passed
cargo test                    # 12 passed, 0 failed
pnpm desktop:build            # MSI + NSIS installers produced
```

Desktop packaging produced Windows installer outputs through Tauri build.

Manual acceptance testing — Test A-J all passed. These are human-operated manual tests, not automated CI:

- **Test A:** Fresh workspace initializes as `dataVersion: 2` with group-folder layout.
- **Test B:** v1 load + autosave does not fake-upgrade to v2.
- **Test C:** v1 dry-run produces correct 1 → 2 migration plan.
- **Test D:** Explicit migration applies v2 layout with backup and before-migration copy.
- **Test E:** v2 normal save preserves group-folder layout.
- **Test F:** v2 project group move rewrites canonical path safely.
- **Test G:** Already migrated v2 workspace reports no migration needed.
- **Test H:** Bad JSON / stale migration preview — bug found, fixed, and re-tested.
- **Test I:** Duplicate project ID blocks migration and leaves disk unchanged.
- **Test J:** Restore old v1 backup after migration returns to v1 without auto-migrate.

Post A-J manual findings fixed and verified:

- Ctrl radial menu scoped to canvas only.
- Load failures shown as Load failed, not Save failed (storage error type labels).

v0.1.5-rc1 smoke test passed.

Final read-only review found no P0/P1 blockers.

Full manual test report: `docs/MANUAL_TEST_REPORT_v0.1.5_GROUP_FOLDER_MIGRATION.md`

### v0.1.4 validation

v0.1.4 release closeout validation passed (same build checks as above).

v0.1.4 safety validation covered:

* Load failure does not trigger destructive empty save.
* Bad project JSON does not cause project file deletion.
* Backup creation is read-only toward source data.
* Backup directory allocation avoids timestamp collision.
* Restore uses pre-restore backup, staging, rename, and rollback.
* Migration dry-run remains read-only.
* Native folder picker does not automatically switch storage root.
* Storage drawer state remains session-only.
* Project Details panel does not alter project persistence.
* Backup result panel sizing and wrapping were fixed in the final release candidate.

## Known limitations

Current limitations:

* CSV import and data-table preview are not implemented.
* Image node asset import is not implemented.
* Presentation mode is not implemented.
* Browser localStorage fallback is for development convenience, not production storage.
* The app is not a collaborative editor.
* There is no cloud sync.
* There is no plugin system yet.
* Large project performance still needs further testing.
* Automatic repair is intentionally not implemented in v0.1.4.
* v0.1.7 does **not** include: single-writer workspace lock, Recovery Center, repair/retry/recalculate functionality, auto-regenerate-on-load, auto-repair, persistent operation log, automatic stale `.tmp` cleanup, directory fsync hardening, post-rename rollback, kill-process save interruption validation, or end-to-end encryption.
* v1 legacy flat-layout compatibility (scenario K) was not manually validated — no trusted v1 flat-layout fixture was available.
* Backup, restore, migration, and quarantine remain on the v0.1.5 safety model and were not rewritten in v0.1.7.
* Snapshot manifest is an integrity observation layer — it is not a backup, not a restore system, not a load blocker, and not a repair mechanism.

## Roadmap

Planned directions:

### v0.1.7 — Snapshot Manifest & Integrity Warnings ✅

Completed. Introduced snapshot manifest with SHA-256 checksums, warning-mode load verification, and manifest/warning events in Storage Console. Manual desktop validation passed (A–J, L–O, UX PASS; K NOT RUN — no trusted v1 flat-layout fixture). See the Current version section above for details.

### v0.1.6 — Atomic Save & Storage Operation Console ✅

Completed. Introduced atomic write for all active JSON files and a read-only Storage Operation Console.

### Future features

Possible future extensions:

* CSV import and preview.
* Image node import and asset management.
* Presentation / meeting mode.
* Export to image or PDF.
* Project templates.
* Search across modules.
* Versioned project history.
* More node types for academic writing and experiment tracking.
* Better diagnostics and repair tools.

## Future Data Reliability

Cheerio Flow has evolved from the v0.1.4 Data Safety Foundation through v0.1.5 Group Folder Migration and v0.1.6 Atomic Save to v0.1.7 Snapshot Manifest — improving local-first active data integrity observability under tested desktop scenarios.

See:

- `docs/DATA_RELIABILITY_ROADMAP.md`
- `docs/IDEAS_DUAL_PLANE_LOCAL_DATA_MODEL.md`

## Development notes

This project was developed with AI-assisted coding support.

All critical data-safety logic was manually reviewed through iterative engineering checks, including:

* Frontend persistence gating.
* Rust save-path hardening.
* Backup behavior.
* Restore behavior.
* Migration dry-run behavior.
* Sidebar and storage UI behavior.

AI assistance was used for implementation support, review prompts, and release organization. The repository contents should still be treated as source code requiring normal human review, testing, and version control discipline.

## Git tags

Release tags:

```text
v0.1.7       Snapshot Manifest & Integrity Warnings
v0.1.6       Atomic Save & Storage Operation Console
v0.1.5       Group Folder Migration
v0.1.5-rc1   Group Folder Migration release candidate
v0.1.4       Data Safety Foundation
v0.1.4-rc2   Final release candidate with backup result panel sizing fix
v0.1.4-rc1   First release candidate
```

Note:

Each `vX.Y.Z` tag points to its release commit.

Later repository maintenance commits, such as adding `LICENSE` or updating documentation, may exist on `main` or on the release branch after the release tag. This is normal and does not change the release snapshot.

## License

MIT License.

The license applies to the Cheerio Flow source code and documentation in this repository.

See `LICENSE` for details.
