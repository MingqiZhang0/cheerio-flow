# Cheerio Flow

Local-first desktop research workflow planning tool built with Tauri, React, TypeScript, Rust, React Flow, and KaTeX.

Cheerio Flow is designed for researchers, students, and technical writers who need to plan complex research processes visually: concepts, equations, assumptions, datasets, experiments, arguments, dependencies, and presentation structure can be arranged as editable nodes and arrows on a local canvas.

The project is currently in early prototype stage, but v0.1.4 establishes an important data-safety foundation before future storage migrations.

## Current version

```text
v0.1.4 — Data Safety Foundation
```

This version focuses on local data integrity, backup, restore, startup scanning, and migration preparation.

The next planned development line is:

```text
v0.1.5 — Real Group Folder Migration
```

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
* Do not rely on migration dry-run as a real migration. It is only a preview report.
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
| Real group-folder migration     |       Not implemented | Planned for v0.1.5                            |

## Data Safety Demo

Cheerio Flow treats local data safety as a first-class design goal.

v0.1.4 focuses on preventing accidental local data loss caused by failed loads, broken JSON files, unsafe saves, restore failures, or future storage migrations.

```mermaid
flowchart TD
    A[Local CheerioFlowData] --> B[Load database]

    B -->|Valid data| C[Hydrate app state]
    C --> D[Enable persistence gate]
    D --> E[Normal save allowed]

    B -->|Bad project JSON / load failure| F[Load failed]
    F --> G[Disable persistence gate]
    G --> H[Autosave blocked]
    H --> I[Existing project files preserved]

    A --> J[Read-only startup integrity scan]
    J --> K[Report warnings / blockers]
    K --> L[No automatic repair]
    L --> I

    A --> M[Manual full backup]
    M --> N[CheerioFlowBackups / backup timestamp]
    N --> O[Backup manifest]

    N --> P[Restore selected backup]
    P --> Q[Create pre-restore backup]
    Q --> R[Copy into staging directory]
    R --> S[Rename current data to before-restore]
    S --> T[Activate restored CheerioFlowData]
    T --> U[Reload database]

    R -->|Failure| V[Rollback attempted]
    S -->|Failure| V
    V --> I

    A --> W[Migration dry-run]
    W --> X[Analyze future group-folder layout]
    X --> Y[Generate report only]
    Y --> Z[No files created, moved, deleted, or rewritten]
```

The diagram above shows the intended v0.1.4 safety model:

- failed loads disable persistence instead of saving empty state;
- startup integrity scanning is read-only;
- full backup copies the active data folder before risky operations;
- restore uses pre-restore backup, staging, rename, and rollback;
- migration dry-run produces a report only and does not modify files.

## Data safety features

| Safety feature               | Description                                             |
| ---------------------------- | ------------------------------------------------------- |
| `dataVersion`                | App state records the storage format version.           |
| Load-failed persistence gate | Prevents autosave after failed load.                    |
| Empty-save rejection         | Rust save path refuses empty project-list payloads.     |
| Read-only startup scan       | Detects integrity issues without writing to disk.       |
| Manual backup                | Copies data to timestamped backup folder.               |
| Backup manifest              | Records backup metadata.                                |
| Restore confirmation         | Requires explicit user confirmation before restore.     |
| Pre-restore backup           | Creates backup before restoring another backup.         |
| Staging restore              | Restores into staging first, then renames.              |
| Rollback handling            | Attempts rollback if final replacement fails.           |
| Path traversal defense       | Backup IDs are validated before restore.                |
| Migration dry-run            | Previews future layout without modifying files.         |
| Symlink avoidance            | Backup/restore/dry-run avoid following unsafe symlinks. |

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

Current v0.1.4 data layout:

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
        {project-id}.json
      groups.json
      app-state.json
    backup-manifest.json
```

Future planned v0.1.5 group-folder layout:

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

v0.1.4 does not perform this migration.

It only provides a dry-run preview.

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

Normal save paths do not perform stale project cleanup.

Project file deletion is reserved for explicit project deletion.

## What gets changed locally

Cheerio Flow writes only to the selected local storage area.

| Local path                                         | Purpose                                          |
| -------------------------------------------------- | ------------------------------------------------ |
| `CheerioFlowData/projects/{project-id}.json`       | Individual project files.                        |
| `CheerioFlowData/groups.json`                      | Group list and project membership metadata.      |
| `CheerioFlowData/app-state.json`                   | UI/app state, including `dataVersion`.           |
| `CheerioFlowBackups/backup-*/CheerioFlowData/`     | Full backup copy of data folder.                 |
| `CheerioFlowBackups/backup-*/backup-manifest.json` | Backup metadata.                                 |
| `CheerioFlowData.before-restore-*`                 | Previous data folder moved aside during restore. |

Cheerio Flow does not require a server for these operations.

## Validation

v0.1.4 release closeout validation passed:

```text
cargo fmt
cargo check
tsc --noEmit
pnpm build
pnpm desktop:build
```

Desktop packaging produced Windows installer outputs through Tauri build.

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
* Real group-folder migration is not implemented yet.
* Browser localStorage fallback is for development convenience, not production storage.
* The app is not a collaborative editor.
* There is no cloud sync.
* There is no plugin system yet.
* Large project performance still needs further testing.
* Automatic repair is intentionally not implemented in v0.1.4.

## Roadmap

Planned directions:

### v0.1.5 — Real Group Folder Migration

Use the v0.1.4 dry-run foundation to implement the real migration:

```text
projects/{project-id}.json
→ projects/ungrouped/{project-id}.json
→ projects/groups/{group-id}/{project-id}.json
```

Required safety expectations:

* Require full backup before migration.
* Run dry-run before migration.
* Block on unresolved blockers.
* Use staging.
* Use rollback.
* Preserve `dataVersion`.
* Write migration result clearly.
* Never silently delete project files.

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

Important v0.1.4 tags:

```text
v0.1.4       Data Safety Foundation
v0.1.4-rc1   First release candidate
v0.1.4-rc2   Final release candidate with backup result panel sizing fix
```

Note:

The `v0.1.4` tag points to the release commit.

Later repository maintenance commits, such as adding `LICENSE`, may exist on `main` after the release tag. This is normal and does not change the v0.1.4 release snapshot.

## License

MIT License.

The license applies to the Cheerio Flow source code and documentation in this repository.

See `LICENSE` for details.
