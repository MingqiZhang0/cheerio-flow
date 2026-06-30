# Cheerio Flow v0.1.5 Group Folder Migration — Manual Test Report

## Document Status

- **Version:** 1.0
- **Date:** 2026-06-30
- **Scope:** Manual acceptance testing for v0.1.5 Group Folder Migration
- **Test type:** Human-operated manual testing (NOT automated CI)

---

## Test Background

v0.1.5 introduces Cheerio Flow's first formal data version migration: **dataVersion 1 → dataVersion 2 (group-folder layout)**. This is the first real structural storage migration since v0.1.4 established the Data Safety Foundation.

v0.1.4 provided a migration dry-run infrastructure but intentionally did not perform real migrations. v0.1.5 adds the actual migration engine with staging, verification, backup enforcement, before-migration preservation, and rollback capability.

Because this migration rewrites the on-disk layout of user project files, it requires thorough manual acceptance testing before any tag or release. This document records that testing.

### Key invariants under test

1. **Fresh workspace defaults to v2.** A new workspace must initialize as `dataVersion: 2` with group-folder layout.
2. **v1 load/save does not trigger migration.** Ordinary editing and autosave must never silently upgrade dataVersion.
3. **Migration requires explicit user action.** Only typing `MIGRATE` and clicking Apply should trigger migration.
4. **Migration is staged and recoverable.** Backup, staging, before-migration copy, and rollback must all work.
5. **Already-migrated workspaces are safe.** Dry-run on v2 must report "already migrated" and show planned moves = 0.
6. **Bad data is not migrated.** Corrupted workspaces must block migration and must not be altered.
7. **Stale migration UI must not mislead.** Switching workspaces must clear old migration previews.

---

## Test Environment

| Item | Value |
|---|---|
| **Application** | Cheerio Flow v0.1.5 (development build) |
| **Branch** | `v0.1.5-group-folder-migration` |
| **HEAD (final)** | `8a06381` |
| **v0.1.4 tag** | `e7f4994` (untouched) |
| **Platform** | Windows 11 Home 10.0.26200 |
| **Shell** | PowerShell 5.1 |
| **Package manager** | pnpm |
| **Rust toolchain** | stable |
| **Build type** | Tauri dev (`pnpm desktop:dev`) for manual tests; release build for closeout validation |
| **Test root** | `E:\CF_TEST\` |
| **Test data** | Temporary synthetic fixtures only — no real user data was used |
| **Test method** | All UI actions performed manually by the project owner; all disk checks via PowerShell |

---

## Git State at Test Time

### Pre-test check

```powershell
git status --short
# (no output — clean worktree)

git branch --show-current
# v0.1.5-group-folder-migration

git rev-parse --short HEAD
# f565c25 (initial) → 8a06381 (after H fix amend)

git show --no-patch --oneline v0.1.4
# e7f4994 v0.1.4: Fix backup result panel sizing
```

### Post-test final state

```text
git status --short   → (clean)
branch               → v0.1.5-group-folder-migration
HEAD                 → 8a06381
v0.1.4 tag           → e7f4994 (untouched, unmoved)
```

---

## Test Directory Layout

All tests used temporary directories under `E:\CF_TEST\`. No real user data was involved.

```text
E:\CF_TEST\
  v2_fresh_parent\          ← Test A: fresh v2 workspace
    CheerioFlowData\
      app-state.json        (dataVersion: 2)
      groups.json
      projects/
        ungrouped/
          project-xxx.json
        groups/
          group-xxx/
            project-yyy.json

  v1_legacy_parent\         ← Tests B, C, D, E, F, G: v1 → v2 migration workspace
    CheerioFlowData\        (started as dataVersion 1, migrated to 2 in Test D)
    CheerioFlowData.before-migration-*  (created by Test D)
    CheerioFlowBackups\     (created by manual backup + Test D auto-backup)

  bad_json_parent\          ← Tests H, H2: corrupted v1 workspace
    CheerioFlowData\
      app-state.json        (dataVersion: 1)
      projects/
        project-xxx.json    (one file contains "{ bad json")

  v1_h3_parent\             ← Test H3: normal v1 workspace for re-dry-run
    CheerioFlowData\
      app-state.json        (dataVersion: 1)
      projects/
        project-xxx.json    (valid JSON)
```

**Important:** The "storage parent folder" is the folder *containing* `CheerioFlowData`. For example, `E:\CF_TEST\v1_legacy_parent` is the storage parent folder, and the actual data lives at `E:\CF_TEST\v1_legacy_parent\CheerioFlowData`.

---

## Test Summary Table

| Test | Description | Result |
|---|---|---|
| **Test A** | Fresh workspace initializes as dataVersion 2 with group-folder layout | ✅ Passed |
| **Test B** | v1 load + autosave does not fake-upgrade to v2 | ✅ Passed |
| **Test C** | v1 dry-run produces correct 1 → 2 migration plan | ✅ Passed |
| **Test D** | Explicit migration applies v2 layout with backup and before-migration copy | ✅ Passed |
| **Test E** | v2 normal save preserves group-folder layout | ✅ Passed |
| **Test F** | v2 project group move rewrites canonical path safely | ✅ Passed |
| **Test G** | Already migrated v2 workspace reports no migration needed | ✅ Passed |
| **Test H** | Bad JSON / stale migration preview: bug found, fixed, and re-tested | ✅ Passed (H2 + H3) |
| **Test I** | Duplicate project ID blocker | ❌ Not yet run |
| **Test J** | Restore old backup after migration | ❌ Not yet run |

---

## Manual Testing Statement

> **All Test A-H checks in this report were performed manually by the project owner/operator.**
>
> The desktop app UI actions (opening Storage drawer, switching storage roots, typing MIGRATE, clicking Apply Migration, editing project titles and module content, waiting for autosave, closing and re-opening the app) were all performed manually.
>
> The PowerShell verification commands (reading `app-state.json`, listing project files, checking for `projects/ungrouped` and `projects/groups`, inspecting `CheerioFlowData.before-migration-*` directories and `CheerioFlowBackups` directories) were executed manually.
>
> The results were manually inspected and interpreted against the expected outcomes.
>
> Codex / Claude / ChatGPT assisted with test planning, prompt generation, code edits, and report drafting, but did **not** replace manual acceptance testing. No AI agent clicked buttons, typed confirmation strings, or verified disk state on the test machine.
>
> This document records **human-operated validation**, not automated CI coverage.

### 中文声明

```text
本报告记录的是人工验收测试，不是自动化测试报告。
所有 UI 操作、路径切换、dry-run、migration apply、PowerShell 磁盘检查均由人工执行。
AI 工具仅用于辅助制定测试流程、解释结果、修复代码和整理文档，
不替代人工测试验收。
```

---

## Test A: Fresh Workspace Defaults to dataVersion 2

### Goal

Verify that a brand-new workspace created by v0.1.5 initializes with:

```json
"dataVersion": 2
```

and uses the v2 group-folder layout:

```text
projects/ungrouped/{project-id}.json
projects/groups/{group-id}/{project-id}.json
```

### Manual operation

1. Launched v0.1.5 app via `pnpm desktop:dev`.
2. Opened Storage drawer.
3. Set storage parent folder to a previously empty directory: `E:\CF_TEST\v2_fresh_parent`.
4. Clicked **Apply Storage Path**.
5. Created a project.
6. Created a group.
7. Assigned one project to the group; left another project ungrouped.
8. Waited for autosave to complete.
9. Closed the app.
10. Manually inspected the disk with PowerShell.

### PowerShell verification

```powershell
Get-Content E:\CF_TEST\v2_fresh_parent\CheerioFlowData\app-state.json | Select-String "dataVersion"

Get-ChildItem E:\CF_TEST\v2_fresh_parent\CheerioFlowData\projects -Recurse -Filter *.json | Select-Object FullName
```

### Observed result

```json
"dataVersion": 2
```

Project file paths:

```text
E:\CF_TEST\v2_fresh_parent\CheerioFlowData\projects\groups\group-1782832570061-eivrdw\project-1782832568397-aorc9z.json
E:\CF_TEST\v2_fresh_parent\CheerioFlowData\projects\ungrouped\project-1782832556296332000.json
```

### Early failure (fixed before final closeout)

The first run of Test A failed. The new workspace was incorrectly initialized as `dataVersion: 1` with a flat `projects/*.json` layout.

**Root cause:** `set_storage_root` and `switch_storage_root` were copying the current in-memory payload (which included `dataVersion: 1` from the previously loaded workspace) into the new directory. Additionally, the `NewEmptyWorkspace` classification path was not writing the v2 layout correctly.

**Fix:**
- `set_storage_root` / `switch_storage_root` no longer write the current memory payload to the new directory — they delegate to `load_database_from_paths` for initialization.
- `classify_data_root` returns `NewEmptyWorkspace` for missing `app-state.json` with no project files.
- `NewEmptyWorkspace` bootstraps using `AppState::default()` which uses `current_data_version()` (value: 2).
- Default project is written using `v2_project_path`.

After the fix, Test A was re-run and passed as recorded above.

### Conclusion

```text
Test A passed (after fix).
Fresh workspace correctly initializes as dataVersion 2 and uses group-folder layout.
```

---

## Test B: v1 Load + Autosave Does Not Fake-Upgrade

### Goal

Verify that a v1 legacy workspace loaded by v0.1.5 retains `dataVersion: 1` and flat project layout through normal edit/autosave cycles. Migration must only occur via explicit user action.

### Preparing the v1 legacy fixture

Since no standalone v0.1.4 installation was available, a valid v1 fixture was manually constructed by reverse-engineering from the v2 test data produced in Test A.

```powershell
# Clean target
Remove-Item E:\CF_TEST\v1_legacy_parent\CheerioFlowData -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path E:\CF_TEST\v1_legacy_parent\CheerioFlowData\projects -Force

# Copy metadata files
Copy-Item E:\CF_TEST\v2_fresh_parent\CheerioFlowData\groups.json E:\CF_TEST\v1_legacy_parent\CheerioFlowData\groups.json
Copy-Item E:\CF_TEST\v2_fresh_parent\CheerioFlowData\app-state.json E:\CF_TEST\v1_legacy_parent\CheerioFlowData\app-state.json

# Flatten project files from v2 group folders into v1 flat projects/
Get-ChildItem E:\CF_TEST\v2_fresh_parent\CheerioFlowData\projects -Recurse -Filter *.json | ForEach-Object {
    Copy-Item $_.FullName (Join-Path E:\CF_TEST\v1_legacy_parent\CheerioFlowData\projects $_.Name)
}

# Rewrite dataVersion from 2 to 1
(Get-Content E:\CF_TEST\v1_legacy_parent\CheerioFlowData\app-state.json -Raw) `
  -replace '"dataVersion"\s*:\s*2', '"dataVersion": 1' |
  Set-Content E:\CF_TEST\v1_legacy_parent\CheerioFlowData\app-state.json -Encoding UTF8
```

### Pre-test fixture verification

```powershell
Get-Content E:\CF_TEST\v1_legacy_parent\CheerioFlowData\app-state.json | Select-String "dataVersion"
# "dataVersion": 1

Get-ChildItem E:\CF_TEST\v1_legacy_parent\CheerioFlowData\projects -Filter *.json | Select-Object FullName
# E:\CF_TEST\v1_legacy_parent\CheerioFlowData\projects\project-1782832556296332000.json
# E:\CF_TEST\v1_legacy_parent\CheerioFlowData\projects\project-1782832568397-aorc9z.json

Test-Path E:\CF_TEST\v1_legacy_parent\CheerioFlowData\projects\ungrouped
# False

Test-Path E:\CF_TEST\v1_legacy_parent\CheerioFlowData\projects\groups
# False
```

Fixture confirmed: `dataVersion: 1`, two project JSON files directly under `projects/`, no v2 subdirectories.

### Manual operation

1. Launched v0.1.5 app.
2. Opened Storage drawer.
3. Set storage parent folder to: `E:\CF_TEST\v1_legacy_parent`.
4. Clicked **Switch and Reload**.
5. Verified that projects, groups, modules, and arrows display correctly in the UI.
6. Edited one project title (changed text in the top bar).
7. Edited one module content (double-clicked a module, changed text in properties panel).
8. Waited ~3 seconds for autosave. Confirmed save status showed "saved".
9. Closed the app.
10. Ran PowerShell verification.

### PowerShell verification

```powershell
Get-Content E:\CF_TEST\v1_legacy_parent\CheerioFlowData\app-state.json | Select-String "dataVersion"

Get-ChildItem E:\CF_TEST\v1_legacy_parent\CheerioFlowData\projects -Filter *.json | Select-Object FullName

Test-Path E:\CF_TEST\v1_legacy_parent\CheerioFlowData\projects\ungrouped
Test-Path E:\CF_TEST\v1_legacy_parent\CheerioFlowData\projects\groups
```

### Observed result

| Check | Expected | Actual | Status |
|---|---|---|---|
| `dataVersion` | 1 | 1 | ✅ |
| Project file count | 2 | 2 | ✅ |
| Project file location | `projects/{id}.json` (flat) | `projects/{id}.json` (flat) | ✅ |
| `projects/ungrouped` exists | False | False | ✅ |
| `projects/groups` exists | False | False | ✅ |
| `app-state.json` saved | mtime updated | mtime updated (16:29 → 16:41) | ✅ |
| `propertiesSidebarCollapsed` | changed (user interaction) | false → true | ✅ |

### Conclusion

```text
Test B passed.
v1 load + autosave does not fake-upgrade to v2.
dataVersion remained 1, flat project layout was preserved,
and no v2 group-folder directories were created.
```

---

## Test C: v1 Dry-Run Produces Correct Migration Plan

### Goal

Verify that running a migration dry-run on a v1 workspace produces an accurate read-only migration plan with `dataVersion 1 → 2`, and that dry-run creates no files or directories on disk.

### Manual operation

1. Used the v1 workspace from Test B: `E:\CF_TEST\v1_legacy_parent`.
2. Opened Storage drawer.
3. Under **Migration dry-run**, clicked **Preview group-folder migration**.
4. Observed the dry-run report in the UI.

### Observed UI output

```text
Migration preview found no blocking issues.
This is a dry-run report only.
dataVersion: 1 -> 2
No folders were created.
Project files: 2
Grouped: 1
Ungrouped: 1
Groups: 1
Planned moves: 2
Blockers: 0
Warnings: 0

Planned operations:
  createDirectory: (new directory) -> projects/ungrouped [planned]
  moveProjectFile: projects/project-1782832556296332000.json -> projects/ungrouped/project-1782832556296332000.json [planned]
  createDirectory: (new directory) -> projects/groups/group-1782832570061-eivrdw [planned]
  moveProjectFile: projects/project-1782832568397-aorc9z.json -> projects/groups/group-1782832570061-eivrdw/project-1782832568397-aorc9z.json [planned]
```

### Disk verification after dry-run

```powershell
# dataVersion still 1, projects still flat, no v2 directories created
Get-Content E:\CF_TEST\v1_legacy_parent\CheerioFlowData\app-state.json | Select-String "dataVersion"
# "dataVersion": 1

Test-Path E:\CF_TEST\v1_legacy_parent\CheerioFlowData\projects\ungrouped
# False

Test-Path E:\CF_TEST\v1_legacy_parent\CheerioFlowData\projects\groups
# False
```

### Conclusion

```text
Test C passed.
Dry-run correctly produced a v1 -> v2 migration plan with 0 blockers and 0 warnings.
No folders or files were created on disk during dry-run.
```

---

## Test D: Explicit Migration Apply Converts v1 to v2

### Goal

Verify that after the user types `MIGRATE` and clicks **Apply Migration**, the migration engine:

1. Creates a full backup.
2. Stages the v2 layout.
3. Verifies the staged layout.
4. Atomically activates it (rename-based).
5. Preserves the old `CheerioFlowData` as `CheerioFlowData.before-migration-*`.
6. Updates `app-state.json` `dataVersion` to 2.
7. Moves project files to `projects/ungrouped/` and `projects/groups/{group-id}/`.
8. Reloads successfully.

### Manual operation

1. After Test C dry-run confirmed 0 blockers.
2. Typed `MIGRATE` in the confirmation input field.
3. Clicked **Apply Migration**.
4. Observed migration progress in the UI.
5. After migration completed, verified the UI showed migrated project count and dataVersion.
6. Closed the app.
7. Ran PowerShell verification.

### PowerShell verification

```powershell
Get-Content E:\CF_TEST\v1_legacy_parent\CheerioFlowData\app-state.json | Select-String "dataVersion"

Get-ChildItem E:\CF_TEST\v1_legacy_parent\CheerioFlowData\projects -Recurse -Filter *.json | Select-Object FullName

Get-ChildItem E:\CF_TEST\v1_legacy_parent -Directory | Where-Object {$_.Name -like "CheerioFlowData.before-migration*"}

Get-ChildItem E:\CF_TEST\v1_legacy_parent\CheerioFlowBackups -Directory
```

### Observed result

**dataVersion:**

```json
"dataVersion": 2
```

**Project file paths (v2 group-folder layout):**

```text
E:\CF_TEST\v1_legacy_parent\CheerioFlowData\projects\groups\group-1782832570061-eivrdw\project-1782832568397-aorc9z.json
E:\CF_TEST\v1_legacy_parent\CheerioFlowData\projects\ungrouped\project-1782832556296332000.json
```

**Before-migration directory:**

```text
E:\CF_TEST\v1_legacy_parent\CheerioFlowData.before-migration-20260630-164511
```

**Backup directories:**

```text
E:\CF_TEST\v1_legacy_parent\CheerioFlowBackups\backup-20260630-164422
E:\CF_TEST\v1_legacy_parent\CheerioFlowBackups\backup-20260630-164511
```

**Note on backup count:** Two backup directories were present because one was created manually before Test D and the second was created automatically by the migration engine. This is expected behavior and not an anomaly.

### UI confirmation

```text
Migration applied and reloaded
Backup: E:\CF_TEST\v1_legacy_parent\CheerioFlowBackups\backup-20260630-164511
Before migration: E:\CF_TEST\v1_legacy_parent\CheerioFlowData.before-migration-20260630-164511
Migrated 2 of 2 project files to dataVersion 2.
```

### Conclusion

```text
Test D passed.
Explicit migration successfully converted v1 flat layout to v2 group-folder layout,
created backup, preserved before-migration copy, and reloaded correctly.
```

---

## Test E: v2 Normal Save Preserves Group-Folder Layout

### Goal

Verify that after migration, ordinary editing and autosave on the v2 workspace preserves the group-folder layout and does not revert to flat `projects/*.json`.

### Manual operation

1. Opened the app with the migrated workspace: `E:\CF_TEST\v1_legacy_parent`.
2. Edited a project title.
3. Edited module content.
4. Waited for autosave.
5. Closed and re-opened the app to confirm changes persisted.
6. Ran PowerShell verification.

### PowerShell verification

```powershell
Get-Content E:\CF_TEST\v1_legacy_parent\CheerioFlowData\app-state.json | Select-String "dataVersion"

# v2 layout — project files under subdirectories:
Get-ChildItem E:\CF_TEST\v1_legacy_parent\CheerioFlowData\projects -Recurse -Filter *.json | Select-Object FullName

# Flat layout — should be empty:
Get-ChildItem E:\CF_TEST\v1_legacy_parent\CheerioFlowData\projects -Filter *.json | Select-Object FullName
```

### Observed result

| Check | Expected | Actual |
|---|---|---|
| `dataVersion` | 2 | 2 |
| Project files under `projects/ungrouped/` and `projects/groups/` | Present | Present |
| Top-level `projects/*.json` files | None | None |

### Conclusion

```text
Test E passed.
v2 normal save preserved group-folder layout and did not recreate flat project files.
```

---

## Test F: v2 Project Group Move — Canonical Path Safety

### Goal

Verify that when a project's group assignment changes in a v2 workspace:

1. The project JSON is saved to the new canonical path.
2. The old non-canonical file is not silently deleted.
3. The old file is conservatively relocated to `.cheerio/stale-project-files/`.
4. After reload, no projects are lost or duplicated.

### Manual operation

1. Opened the migrated v2 workspace: `E:\CF_TEST\v1_legacy_parent`.
2. In Project Details panel, changed the group assignment of one project:
   - Moved the grouped project to "Ungrouped".
3. Waited for autosave.
4. Changed the group assignment again:
   - Moved the now-ungrouped project back into a group.
5. Waited for autosave.
6. Closed and re-opened the app.
7. Verified UI still shows exactly 2 projects (no duplicates).
8. Ran PowerShell verification.

### PowerShell verification

```powershell
Get-ChildItem E:\CF_TEST\v1_legacy_parent\CheerioFlowData\projects -Recurse -Filter *.json | Select-Object FullName

Get-ChildItem E:\CF_TEST\v1_legacy_parent\CheerioFlowData\.cheerio -Recurse -ErrorAction SilentlyContinue | Select-Object FullName
```

### Observed result

**Current canonical project paths:**

```text
E:\CF_TEST\v1_legacy_parent\CheerioFlowData\projects\groups\group-1782832570061-eivrdw\project-1782832556296332000.json
E:\CF_TEST\v1_legacy_parent\CheerioFlowData\projects\ungrouped\project-1782832568397-aorc9z.json
```

**Stale project files (quarantined):**

```text
E:\CF_TEST\v1_legacy_parent\CheerioFlowData\.cheerio\stale-project-files\20260630-165028\...
E:\CF_TEST\v1_legacy_parent\CheerioFlowData\.cheerio\stale-project-files\20260630-165032\...
```

**UI verification after reload:** Both projects present. No duplicates. No errors.

### Conclusion

```text
Test F passed.
v2 project group move rewrote canonical paths safely.
Old non-canonical files were relocated to .cheerio/stale-project-files
rather than being silently deleted. Reload confirmed no data loss.
```

---

## Test G: Already Migrated v2 Workspace — No Repeat Migration

### Goal

Verify that running a migration dry-run on an already-migrated v2 workspace correctly reports "already migrated" and shows planned moves = 0.

### Manual operation

1. Opened the migrated workspace: `E:\CF_TEST\v1_legacy_parent` (now at dataVersion 2 after Test D).
2. Opened Storage drawer.
3. Clicked **Preview group-folder migration**.
4. Observed the dry-run report.

### Observed UI output

```text
This workspace is already migrated to the group-folder layout.
This is a dry-run report only.
dataVersion: 2 -> 2
No folders were created.
Project files: 2
Grouped: 1
Ungrouped: 1
Groups: 1
Planned moves: 0
Blockers: 0
Warnings: 0

Already migrated
No migration is needed for dataVersion 2.
```

### Conclusion

```text
Test G passed.
Already migrated v2 workspace correctly reported no migration needed
with planned moves = 0. No double-migration risk.
```

---

## Test H: Bad JSON / Stale Migration Preview

Test H is recorded in two phases:

- **H-original:** Discovery of the stale migration preview bug.
- **H-fixed (H2 + H3):** Verification after the fix was applied.

---

### H-original: Bug Discovery

#### Goal

Verify that a v1 workspace with corrupted project JSON is not migrated, and that switching workspaces correctly clears old migration UI state.

#### Preparing the bad JSON fixture

A bad JSON v1 workspace was constructed from the `before-migration` copy retained by Test D:

```powershell
$src = Get-ChildItem E:\CF_TEST\v1_legacy_parent -Directory |
  Where-Object {$_.Name -like "CheerioFlowData.before-migration*"} |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

Remove-Item E:\CF_TEST\bad_json_parent\CheerioFlowData -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item E:\CF_TEST\bad_json_parent\CheerioFlowBackups -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item E:\CF_TEST\bad_json_parent\CheerioFlowData.before-migration-* -Recurse -Force -ErrorAction SilentlyContinue

New-Item -ItemType Directory -Path E:\CF_TEST\bad_json_parent -Force | Out-Null
Copy-Item $src.FullName E:\CF_TEST\bad_json_parent\CheerioFlowData -Recurse

# Corrupt one project file
$badProject = Get-ChildItem E:\CF_TEST\bad_json_parent\CheerioFlowData\projects -Filter *.json | Select-Object -First 1
Set-Content $badProject.FullName "{ bad json" -Encoding UTF8
```

Fixture verified: `dataVersion: 1`, flat `projects/`, one file contains `{ bad json`.

#### Manual operation

1. Opened the migrated v2 workspace: `E:\CF_TEST\v1_legacy_parent`.
2. Ran Dry-run — saw `dataVersion: 2 -> 2, Already migrated`.
3. Without restarting, switched to: `E:\CF_TEST\bad_json_parent`.
4. Observed the UI.

#### Observed UI result

The app correctly handled the bad JSON at the backend level:

```text
dataVersion remained 1.
Flat projects/ layout was preserved.
projects/ungrouped and projects/groups were not created.
```

However, the **UI still displayed the old migration report** from the previous workspace:

```text
This workspace is already migrated to the group-folder layout.
dataVersion: 2 -> 2
Already migrated
No migration is needed for dataVersion 2.
```

This was a **safety UX bug**: the stale migration preview could mislead the user into thinking the current (bad) workspace had already been migrated, or into attempting an Apply on a workspace the report did not belong to.

#### Disk verification

```powershell
Get-Content E:\CF_TEST\bad_json_parent\CheerioFlowData\app-state.json | Select-String "dataVersion"
# "dataVersion": 1

Get-ChildItem E:\CF_TEST\bad_json_parent\CheerioFlowData\projects -Filter *.json | Select-Object FullName
# (two flat project files)

Test-Path E:\CF_TEST\bad_json_parent\CheerioFlowData\projects\ungrouped
# False

Test-Path E:\CF_TEST\bad_json_parent\CheerioFlowData\projects\groups
# False
```

**Backend data safety was not compromised.** The stale report was a frontend-only UX defect.

#### Severity assessment

```text
H-original exposed a stale migration preview UI bug.
This was classified as a safety UX bug, not a backend migration data-loss bug.
Impact: user confusion / potential mis-click on stale Apply.
No data was corrupted, migrated, or lost.
```

---

### H Fix: Summary of Code Changes

A single file was modified: `src/App.tsx`.

**Changes applied:**

| Change | Purpose |
|---|---|
| Added `invalidateMigrationState` callback | Clears all migration UI state (dry-run report, apply report, confirmation, errors) |
| Added `loadedStorageRoot` state | Tracks the storage root of the currently loaded workspace |
| Added `migrationDryRunContext` state | Records which workspace a dry-run report was generated for |
| Added `normalizeWorkspacePath` helper | Normalizes paths for case-insensitive comparison |
| Added `isCurrentMigrationReport` guard | Returns `true` only if the dry-run report matches the currently loaded workspace |
| Added `currentMigrationDryRunReport` rendered variable | UI only renders migration report if `isCurrentMigrationReport` returns `true` |
| Added `migrationCanRunDryRun` guard | Dry-run button disabled when load failed or storage operation is in progress |
| Added `migrationCanApply` guard | Apply button disabled unless dry-run is current, MIGRATE is typed, and no blockers |
| Added hard guard in `handleApplyGroupFolderMigration` | Apply handler independently re-validates workspace context before proceeding |
| Wired `invalidateMigrationState` into all state transitions | Storage input change, browse, switch, load failure, restore, migration start/failure |

**`invalidateMigrationState` clears:**

- `migrationDryRunStatus`, `migrationDryRunReport`, `migrationDryRunContext`, `migrationDryRunError`
- `migrationApplyStatus`, `migrationApplyReport`, `migrationApplyError`
- `migrationConfirmation`

**Triggered by:**

- Storage root input value differing from `loadedStorageRoot`
- Browse folder picker selecting a different folder
- `applyStorageRoot` start and failure
- `hydrateLoadedData` success
- `loadDatabase` failure
- Restore start, failure, and reload failure
- Dry-run start and failure
- Migration apply start, success, failure, and reload failure

**Apply Migration internal hard guards:**

- `isCurrentMigrationReport` must return `true`
- `loadedRef.current && canPersistRef.current` must be `true`
- No active storage operation (`migrationApplyStatus`, `restoreStatus`, `saveStatus` must be idle)
- If stale, shows: "Run dry-run again for the current workspace."

---

### H2: Bad JSON Workspace — Fixed Retest

#### Goal

Re-verify that after the H fix:
1. Switching from a v2 workspace to a bad JSON workspace clears the old migration report.
2. The bad JSON workspace shows an appropriate error message.
3. No migration artifacts are created on disk.

#### Manual operation

1. Opened the migrated v2 workspace: `E:\CF_TEST\v1_legacy_parent`.
2. Ran Dry-run — saw `dataVersion: 2 -> 2, Already migrated`.
3. Without restarting, switched to: `E:\CF_TEST\bad_json_parent`.
4. Observed the UI.
5. Ran PowerShell verification.

#### Observed UI result

```text
The old "dataVersion: 2 -> 2 / Already migrated" report disappeared immediately.
Apply Migration button is disabled / not shown.
MIGRATE confirmation input is cleared / not present.
Migration UI section shows:
  "Load failed. Fix or restore the workspace before running migration dry-run."
Bottom status bar shows:
  "Data directory: unavailable"
  "Failed to parse JSON ..."
```

**Minor UX observation:**

> The bottom status bar displayed "Save failed / Failed to parse JSON". This wording does not affect the H2 conclusion, but in a future version the load-failure scenario could be labeled more precisely as "Load failed / Storage load failed" rather than "Save failed".

#### PowerShell disk verification

```powershell
Get-Content E:\CF_TEST\bad_json_parent\CheerioFlowData\app-state.json | Select-String "dataVersion"
# "dataVersion": 1

Get-ChildItem E:\CF_TEST\bad_json_parent\CheerioFlowData\projects -Filter *.json | Select-Object FullName
# E:\CF_TEST\bad_json_parent\CheerioFlowData\projects\project-1782832556296332000.json
# E:\CF_TEST\bad_json_parent\CheerioFlowData\projects\project-1782832568397-aorc9z.json

Test-Path E:\CF_TEST\bad_json_parent\CheerioFlowData\projects\ungrouped
# False

Test-Path E:\CF_TEST\bad_json_parent\CheerioFlowData\projects\groups
# False

Get-ChildItem E:\CF_TEST\bad_json_parent -Directory | Where-Object {$_.Name -like "CheerioFlowData.before-migration*"}
# (no output)

Get-ChildItem E:\CF_TEST\bad_json_parent\CheerioFlowBackups -Directory -ErrorAction SilentlyContinue
# (no output)
```

#### Conclusion

```text
H2 passed.
Bad JSON workspace stayed dataVersion 1 with flat project layout.
No migration artifacts (before-migration, backup, ungrouped, groups) were created.
Stale 2 -> 2 "already migrated" report disappeared immediately.
```

---

### H3: Switch Back to Normal v1 — Stale Report Does Not Reappear

#### Goal

Verify that after viewing a bad JSON workspace, switching back to a valid v1 workspace does not auto-resurrect stale migration reports. A fresh dry-run must be manually triggered to get a current report.

#### Preparing the H3 v1 fixture

A clean v1 workspace was constructed from the same `before-migration` copy:

```powershell
Remove-Item E:\CF_TEST\v1_h3_parent\CheerioFlowData -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item E:\CF_TEST\v1_h3_parent\CheerioFlowBackups -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item E:\CF_TEST\v1_h3_parent\CheerioFlowData.before-migration-* -Recurse -Force -ErrorAction SilentlyContinue

New-Item -ItemType Directory -Path E:\CF_TEST\v1_h3_parent -Force | Out-Null
Copy-Item $src.FullName E:\CF_TEST\v1_h3_parent\CheerioFlowData -Recurse
```

Pre-test check:

```powershell
Get-Content E:\CF_TEST\v1_h3_parent\CheerioFlowData\app-state.json | Select-String "dataVersion"
# "dataVersion": 1

Get-ChildItem E:\CF_TEST\v1_h3_parent\CheerioFlowData\projects -Filter *.json | Select-Object FullName
# (two flat project JSON files)

Test-Path E:\CF_TEST\v1_h3_parent\CheerioFlowData\projects\ungrouped
# False

Test-Path E:\CF_TEST\v1_h3_parent\CheerioFlowData\projects\groups
# False
```

#### Manual operation

1. Without restarting the app (still on `bad_json_parent` from H2).
2. Switched to: `E:\CF_TEST\v1_h3_parent`.
3. Clicked **Switch and Reload**.
4. Observed: no old migration report appeared automatically.
5. Clicked **Preview group-folder migration** (fresh dry-run).
6. Observed the new report.

#### Observed UI result

**Immediately after switching:**

```text
No stale report appeared.
Apply Migration not available.
MIGRATE input not visible.
Dry-run prompt: "Run dry-run to preview migration for the current workspace."
```

**After clicking Preview group-folder migration:**

```text
Migration preview found no blocking issues.
This is a dry-run report only.
dataVersion: 1 -> 2
No folders were created.
Project files: 2
Grouped: 1
Ungrouped: 1
Groups: 1
Planned moves: 2
Blockers: 0
Warnings: 0

Planned operations:
  createDirectory: (new directory) -> projects/ungrouped [planned]
  moveProjectFile: projects/project-1782832556296332000.json -> projects/ungrouped/project-1782832556296332000.json [planned]
  createDirectory: (new directory) -> projects/groups/group-1782832570061-eivrdw [planned]
  moveProjectFile: projects/project-1782832568397-aorc9z.json -> projects/groups/group-1782832570061-eivrdw/project-1782832568397-aorc9z.json [planned]
```

#### PowerShell disk verification

```powershell
Get-Content E:\CF_TEST\v1_h3_parent\CheerioFlowData\app-state.json | Select-String "dataVersion"
# "dataVersion": 1

Get-ChildItem E:\CF_TEST\v1_h3_parent\CheerioFlowData\projects -Filter *.json | Select-Object FullName
# (two flat project JSON files)

Test-Path E:\CF_TEST\v1_h3_parent\CheerioFlowData\projects\ungrouped
# False

Test-Path E:\CF_TEST\v1_h3_parent\CheerioFlowData\projects\groups
# False

Get-ChildItem E:\CF_TEST\v1_h3_parent -Directory | Where-Object {$_.Name -like "CheerioFlowData.before-migration*"}
# (no output)

Get-ChildItem E:\CF_TEST\v1_h3_parent\CheerioFlowBackups -Directory -ErrorAction SilentlyContinue
# (no output)
```

#### Conclusion

```text
H3 passed.
Switching back to a normal v1 workspace did not resurrect stale reports.
Dry-run had to be manually triggered again and correctly showed dataVersion 1 -> 2.
Dry-run remained read-only — no files or directories were created on disk.
```

---

## Tests Not Yet Run

### Test I — Duplicate Project ID Blocker

**Status:** ❌ Not yet run.

**Planned scenario:** Create a v1 workspace where two project JSON files have the same `"id"` field (or where `groups.json` contains duplicate project IDs). Run dry-run. Expected: the dry-run must report blockers (duplicate project IDs) and block migration apply.

**Why not yet run:** Tests A-H focused on the happy path, error path (bad JSON), and stale UI cleanup. The duplicate-ID blocker path exercises a different branch of the migration engine's validation logic.

**Recommended:** Run Test I after this report is committed and reviewed.

### Test J — Restore Old Backup After Migration

**Status:** ❌ Not yet run.

**Planned scenario:** After a v1 → v2 migration (Test D), restore a v1 backup (created before migration). Expected: the restored v1 workspace should load correctly as v1 with flat layout, and the app should not confuse it with the migrated v2 workspace.

**Why not yet run:** Restore-from-backup tests involve additional complexity (managing multiple backup directories, verifying the app correctly handles the post-restore dataVersion). Tests A-H already verified the core migration engine behavior.

**Recommended:** Run Test J after Test I, before final v0.1.5 tag.

---

## Closeout Validation

After the H fix was applied to `src/App.tsx`, the following validation commands were executed:

```powershell
cd E:\科研流程规划

# Frontend
git diff --check              # ✅ No whitespace errors
pnpm exec tsc --noEmit        # ✅ Passed
pnpm build                    # ✅ Passed

# Rust
cd src-tauri
cargo fmt                     # ✅ Passed
cargo fmt --check             # ✅ Passed
cargo check                   # ✅ Passed
cargo test                    # ✅ 12 passed, 0 failed
cd ..

# Desktop packaging
pnpm desktop:build            # ✅ MSI + NSIS installers produced
```

### Final commit

```text
git add src/App.tsx
git commit --amend --no-edit

HEAD: 8a06381
Message: v0.1.5: Add group folder migration
```

### Final git state

```text
git status --short   → (clean)
branch               → v0.1.5-group-folder-migration
HEAD                 → 8a06381
v0.1.4 tag           → e7f4994 (untouched)
```

---

## Scope of Changes in v0.1.5

The amended commit `8a06381` contains the following files:

| File | Change type |
|---|---|
| `src-tauri/src/lib.rs` | Rust backend: classification engine, v1/v2 load/save paths, migration engine, 12 unit tests |
| `src/App.tsx` | Frontend: migration UI, stale report invalidation, storage-root-aware guards (H fix) |
| `src/storage.ts` | `applyGroupFolderMigration` Tauri command wrapper |
| `src/types.ts` | `MigrationApplyReport` TypeScript type |
| `src/utils.ts` | `dataVersion` default updated |
| `package.json` | Version number |

Only `src/App.tsx` was modified in the final H fix amend. All other files were part of the original v0.1.5 commit.

---

## Recommendations

1. **Run Test I and Test J** before tagging v0.1.5. These cover additional safety paths not exercised by Tests A-H.
2. **Consider UX wording improvement** for load-failure scenarios. The bottom bar currently shows "Save failed" even when the root cause is a load failure. A future version could display "Load failed" or "Storage load failed" for load errors.
3. **Do not tag v0.1.5** until Test I, Test J, and final review are complete.
4. **Do not merge to main** until the tag decision is made.

---

## Terminology

| Term | Definition |
|---|---|
| **Flat layout (v1)** | `projects/{project-id}.json` — all project files in a single flat directory |
| **Group-folder layout (v2)** | `projects/ungrouped/{id}.json` and `projects/groups/{gid}/{id}.json` |
| **Storage parent folder** | The user-selected directory that *contains* `CheerioFlowData` |
| **Dry-run** | Read-only preview of migration — no files created, moved, or deleted |
| **Staging** | Writing migration results to a temporary directory before atomically swapping |
| **Canonical path** | The expected file path for a project based on its `groupId` and `dataVersion` |
| **Stale project files** | Project JSON files at non-canonical paths, moved to `.cheerio/stale-project-files/` |
| **Before-migration** | `CheerioFlowData.before-migration-*` — the pre-migration data directory preserved by rename |
| **Persistence gate** | `loadedRef` + `canPersistRef` — blocks autosave after failed load |
| **Stale migration report** | A dry-run or apply report from a previous workspace still displayed after switching |

---

*This manual test report was authored by the project owner with AI-assisted drafting support. All test operations, observations, and conclusions were produced through human judgment. This document serves as an audit record for the v0.1.5 release process.*
