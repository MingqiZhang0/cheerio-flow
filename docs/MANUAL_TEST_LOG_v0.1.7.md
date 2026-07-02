# Cheerio Flow v0.1.7 Manual Desktop Test Log

Complete human-executed validation record for snapshot manifest, warning-mode verification, storage console behavior, and browse directory memory.

---

## Human Execution Statement

This document records the **manual desktop validation process** for Cheerio Flow v0.1.7.

- All **Manual Desktop Validation** items were executed by the user on a real Windows desktop environment.
- Claude / Codex did **not** perform native Tauri desktop window interaction, nor did it fabricate desktop validation results.
- Codex executed automated commands (`cargo test`, `pnpm build`, `git status`, etc.) and contributed documentation, code fixes, and test coordination. It cannot substitute for human observation of Browse dialogs, Storage Console rendering, or desktop window behavior.
- All **PASS / FAIL / NOT RUN** verdicts are based on **actual operation records and observations** provided by the user.
- Item **K (v1 legacy layout compatibility)** was **not run** because no trusted v1 flat-layout fixture was available. It is recorded as **NOT RUN** — not fabricated as PASS.
- The two patches applied during this validation cycle (`c8f1243`, `168cfd6`) were fixes for issues discovered during **human desktop testing**, not speculative changes.

---

## Test Environment

- **OS:** Windows 11 Home 10.0.26200
- **Shell:** PowerShell
- **App:** Cheerio Flow
- **Version under test:** v0.1.7
- **Branch:** `main`
- **Final tested HEAD:** `168cfd6`
- **Test base directory:**

```powershell
$Base = "$env:TEMP\cheerio-flow-v017-manual"
```

When expanded, `$Base` resolves to the Windows temporary directory path (e.g. `C:\Users\<user>\AppData\Local\Temp\cheerio-flow-v017-manual`). This is a transient test directory — not project persistent data.

Throughout this document:

- `$Root` refers to the outer storage root for a given test scenario (e.g. `$Base\A_fresh`).
- `$DataRoot` refers to `$Root\CheerioFlowData`.
- `$ManifestPath` refers to `$DataRoot\.cheerio\snapshot-manifest.json`.

### Path Display Convention

Commands in this document use **variables** (`$Base`, `$Root`, `$DataRoot`, `$ManifestPath`). If an actual path appears in test output, the document notes it as a **local machine observation**, not a persistent data path. Warning messages from the application must **never** contain local absolute paths — this is a core safety requirement verified in this test cycle.

---

## General Test Conventions

1. **Each scenario uses an independent storage root.**
2. The user manually selects the **outer storage root** via the Browse dialog.
3. Cheerio Flow creates its actual data directory at **`<outer root>\CheerioFlowData`**.
4. All manifest / project file checks use:
   ```powershell
   $DataRoot = "$Root\CheerioFlowData"
   $ManifestPath = "$DataRoot\.cheerio\snapshot-manifest.json"
   ```
5. **Clear Storage Console** before starting each scenario to avoid warning confusion across workspaces.
6. **Close or avoid autosave interference** before modifying JSON / manifest / file structure.
7. **No PASS is written without real execution.**
8. **K is recorded as NOT RUN** — no trusted v1 flat-layout fixture was available. The candidate inspected was already v2 group-folder layout.
9. **Do not synthesize v1 fixtures** for the sake of a PASS — misleading test results are worse than NOT RUN.

---

## Automated Validation

Automated validation was executed by Codex. Results:

| Check | Result | Notes |
|---|---|---|
| `cargo fmt --check` | PASS | |
| `cargo check` | PASS | |
| `cargo test` | PASS | 86 passed |
| `pnpm exec tsc --noEmit` | PASS | |
| `pnpm build` | PASS | Vite chunk-size warning only |

### Known Non-blocking Automated Warning

`pnpm build` still produces a Vite chunk-size warning. This warning does **not** affect v0.1.7 manifest/safety validation and is not a regression.

---

## Manual Desktop Validation Summary

| ID | Scenario | Result | Notes |
|---|---|---|---|
| A | Fresh workspace / v2 happy path | PASS | |
| B | Existing v2 save generates manifest | PASS | |
| C | Missing manifest warning-mode load | PASS | |
| D | Corrupt manifest warning-mode load | PASS | |
| E | Checksum mismatch warning-mode load | PASS | |
| F | Size mismatch warning-mode load | PASS | |
| G | Extra active file warning | PASS | |
| H | Manifest-listed missing file warning | PASS | |
| I | Active JSON bad still blocks load | PASS | |
| J | Duplicate project ID still blocks load | PASS | |
| K | v1 legacy layout compatibility | NOT RUN | No trusted v1 flat-layout fixture |
| L | v2 stale/tmp exclusion | PASS | |
| M | Manifest write failure does not fail save | PASS | Passed after `c8f1243` warning sanitization |
| N | Storage Console behavior | PASS | Passed after `c8f1243` warning sanitization |
| O | Repo / stash audit | PASS | |
| UX | Browse directory memory | PASS | Passed after `168cfd6` |

---

## Detailed Test Records

### A. Fresh workspace / v2 happy path

#### Purpose

Verify that opening Cheerio Flow with an empty outer storage root creates a v2 workspace with the expected directory structure and generates a valid snapshot manifest — without errors or warnings.

#### Setup / Commands

```powershell
$Base = "$env:TEMP\cheerio-flow-v017-manual"
$Root = "$Base\A_fresh"
New-Item -ItemType Directory -Path $Root | Out-Null
```

Open Cheerio Flow. Use **Browse** to select `$Root`.

#### Verification Commands

```powershell
Get-ChildItem $Root -Recurse
$DataRoot = "$Root\CheerioFlowData"
Get-Content "$DataRoot\.cheerio\snapshot-manifest.json" | ConvertFrom-Json
```

#### Expected

- `CheerioFlowData` directory is created.
- `app-state.json` exists.
- `groups.json` exists.
- `projects/ungrouped/` exists.
- A default project JSON exists under `projects/ungrouped/`.
- `.cheerio/snapshot-manifest.json` exists.
- No **Save failed** event appears.
- No **manifest/warning** event appears for the `A_fresh` workspace.

#### Observed

```
A_fresh/
  CheerioFlowData/
    .cheerio/
      snapshot-manifest.json
    projects/
      ungrouped/
        project-1782992840901148900.json
    app-state.json
    groups.json
```

Storage Console events for `A_fresh`:

```
storage-root/started
storage-root/committed
```

No `manifest/warning` was observed for `A_fresh`.

> **Note:** A `manifest/warning` event was briefly visible but belonged to a different workspace (`E:\CF_TEST\v0_1_6_fresh_parent`), not `A_fresh`. This is expected — the Storage Console accumulates events across workspaces unless manually cleared between sessions.

#### Result

**PASS**

---

### B. Existing v2 save generates manifest

#### Purpose

Verify that saving modifications to an existing v2 workspace updates the snapshot manifest (LastWriteTime changes) and that the manifest contains the correct file inventory.

#### Setup / Commands

```powershell
$Source = "$Base\A_fresh"
$Root = "$Base\B_existing_save"
Remove-Item $Root -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item $Source $Root -Recurse

$DataRoot = "$Root\CheerioFlowData"
$ManifestPath = "$DataRoot\.cheerio\snapshot-manifest.json"

Get-Item $ManifestPath | Select-Object LastWriteTime, Length
```

Open Cheerio Flow. **Browse** to `B_existing_save`. Make a small manual modification. **Save**.

#### Verification Commands

```powershell
Get-Item $ManifestPath | Select-Object LastWriteTime, Length
$Manifest = Get-Content $ManifestPath | ConvertFrom-Json
$Manifest | Select-Object manifestVersion, dataVersion, layoutKind, projectCount, groupCount
$Manifest.files | Select-Object path, role | Format-Table
```

#### Expected

- `save/started` and `save/committed` appear in Storage Console.
- No **Save failed**.
- No **manifest/warning**.
- Manifest `LastWriteTime` is updated.
- `manifestVersion` = 1.
- `dataVersion` = 2.
- `layoutKind` = `v2-group-folder`.
- `files` includes `app-state.json`, `groups.json`, and the active project JSON.

#### Observed

- `save/started` and `save/committed`: confirmed.
- No **Save failed**: confirmed.
- No **manifest/warning**: confirmed.
- Manifest `LastWriteTime` updated from `12:47:20` to `13:18:00`.
- `manifestVersion`: 1
- `dataVersion`: 2
- `layoutKind`: `v2-group-folder`
- `files` contains:
  - `app-state.json` (role: app-state)
  - `groups.json` (role: groups)
  - `projects/ungrouped/project-1782992840901148900.json` (role: project)

#### Result

**PASS**

---

### C. Missing manifest warning-mode load

#### Purpose

Verify that deleting the snapshot manifest does **not** block workspace load, that a `manifest/warning` is emitted, and that the manifest is regenerated on the next save.

#### Setup / Commands

```powershell
$Source = "$Base\B_existing_save"
$Root = "$Base\C_missing_manifest"
Remove-Item $Root -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item $Source $Root -Recurse

$DataRoot = "$Root\CheerioFlowData"
$ManifestPath = "$DataRoot\.cheerio\snapshot-manifest.json"

Test-Path $ManifestPath
Remove-Item $ManifestPath -Force
Test-Path $ManifestPath
```

Open Cheerio Flow. **Browse** to `C_missing_manifest`. Observe Storage Console. **Save**. Verify manifest regeneration.

#### Verification Commands

```powershell
Test-Path $ManifestPath
$Manifest = Get-Content $ManifestPath | ConvertFrom-Json
$Manifest | Select-Object manifestVersion, dataVersion, layoutKind
```

#### Expected

- Active data loads normally.
- No **Load failed**.
- `storage-root/committed` appears.
- `manifest/warning` appears with message: "Snapshot manifest is missing; active data was loaded without integrity verification."
- `related` = `.cheerio/snapshot-manifest.json`.
- After save, manifest is regenerated, valid, and parseable.
- `manifestVersion` = 1, `dataVersion` = 2, `layoutKind` = `v2-group-folder`.

#### Observed

- `Test-Path` before delete: **True**
- `Test-Path` after delete: **False**
- `storage-root/committed`: confirmed.
- `manifest/warning`: confirmed.
  - Message: `Snapshot manifest is missing; active data was loaded without integrity verification.`
  - `related` = `.cheerio/snapshot-manifest.json`
- No **Load failed**: confirmed.
- After save: manifest regenerated, parseable.
- `manifestVersion`: 1
- `dataVersion`: 2
- `layoutKind`: `v2-group-folder`

#### Result

**PASS**

---

### D. Corrupt manifest warning-mode load

#### Purpose

Verify that replacing the snapshot manifest with invalid JSON does **not** block workspace load, that a `manifest/warning` is emitted, and that the manifest is regenerated on the next save.

#### Setup / Commands

```powershell
$Source = "$Base\B_existing_save"
$Root = "$Base\D_corrupt_manifest"
Remove-Item $Root -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item $Source $Root -Recurse

$DataRoot = "$Root\CheerioFlowData"
$ManifestPath = "$DataRoot\.cheerio\snapshot-manifest.json"

Set-Content $ManifestPath "{ this is not valid json"
```

Open Cheerio Flow. **Browse** to `D_corrupt_manifest`. Observe Storage Console. **Save**. Verify manifest regeneration.

#### Expected

- Active data loads normally.
- No **Load failed**.
- `storage-root/committed` appears.
- `manifest/warning` appears with message indicating the manifest could not be parsed.
- `related` = `.cheerio/snapshot-manifest.json`.
- After save, manifest is regenerated and parseable.

#### Observed

- `storage-root/committed`: confirmed.
- `manifest/warning`: confirmed.
  - Message: `Snapshot manifest could not be parsed; active data was loaded without integrity verification.`
  - `related` = `.cheerio/snapshot-manifest.json`
- No **Load failed**: confirmed.
- After save: manifest regenerated, parseable.
- `manifestVersion`: 1
- `dataVersion`: 2
- `layoutKind`: `v2-group-folder`

#### Result

**PASS**

---

### E. Checksum mismatch warning-mode load

### F. Size mismatch warning-mode load

#### Purpose

Verify that modifying an active project JSON file (while keeping it valid JSON) produces both checksum mismatch and size mismatch warnings on the next load — but does **not** block the load. Verify that saving regenerates the manifest and the warnings disappear on subsequent reload.

#### Setup / Commands

```powershell
$Source = "$Base\B_existing_save"
$Root = "$Base\E_checksum_size_mismatch"
Remove-Item $Root -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item $Source $Root -Recurse

$DataRoot = "$Root\CheerioFlowData"
$ManifestPath = "$DataRoot\.cheerio\snapshot-manifest.json"

$Project = Get-ChildItem "$DataRoot\projects" -Recurse -Filter *.json | Select-Object -First 1
Add-Content $Project.FullName "`n "
Get-Content $Project.FullName | ConvertFrom-Json
```

Open Cheerio Flow. **Browse** to `E_checksum_size_mismatch`. Observe Storage Console. **Save**. Reload and verify warnings are gone.

#### Expected

- The modified project JSON remains parseable (`ConvertFrom-Json` succeeds).
- Workspace loads normally.
- No **Load failed**.
- **Both** a checksum mismatch warning and a size mismatch warning appear.
- `related` points to the project file (relative path, not absolute).
- After save, the manifest is regenerated.
- On subsequent reload, no mismatch warnings appear.

#### Observed

- `ConvertFrom-Json` on modified project: **succeeded** — JSON still valid.
- Workspace loaded normally: confirmed.
- No **Load failed**: confirmed.
- Size mismatch warning: confirmed.
- Checksum mismatch warning: confirmed.
- `related` = `projects/ungrouped/project-1782992840901148900.json` (relative path, no absolute path leak).
- After save: manifest regenerated.
- After reload: no mismatch warnings.

#### Result

- **E: PASS**
- **F: PASS**

---

### G. Extra active file warning

#### Purpose

Verify that adding an extra valid project JSON file (one not listed in the manifest) to the active project directory produces a `manifest/warning` on load — but does **not** block the load. Verify warning messages do not leak local absolute paths.

#### Setup / Commands

```powershell
$Source = "$Base\B_existing_save"
$Root = "$Base\G_extra_active_file"
Remove-Item $Root -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item $Source $Root -Recurse

$DataRoot = "$Root\CheerioFlowData"
$Project = Get-ChildItem "$DataRoot\projects" -Recurse -Filter *.json | Select-Object -First 1
$Extra = Join-Path $Project.DirectoryName "manual-extra-project.json"

Copy-Item $Project.FullName $Extra

$ExtraJson = Get-Content $Extra | ConvertFrom-Json
$ExtraJson.id = "manual-extra-project-v017"
$ExtraJson.title = "Manual Extra Project"
$ExtraJson | ConvertTo-Json -Depth 20 | Set-Content $Extra
```

Open Cheerio Flow. **Browse** to `G_extra_active_file`. Observe Storage Console.

#### Expected

- Workspace loads normally.
- No **storage-root/failed**.
- No **Load failed**.
- A `projectCount` mismatch warning appears (count in manifest ≠ count on disk).
- An extra active file warning appears with message: "Active file is not listed in snapshot manifest: projects/ungrouped/manual-extra-project.json."
- `related` = `projects/ungrouped/manual-extra-project.json` (relative path).
- Warning message does **not** contain local absolute path.

#### Observed

- Workspace loaded normally: confirmed.
- No **storage-root/failed**: confirmed.
- No **Load failed**: confirmed.
- `projectCount` mismatch warning: confirmed.
- Extra active file warning: confirmed.
  - Message: `Active file is not listed in snapshot manifest: projects/ungrouped/manual-extra-project.json.`
  - `related` = `projects/ungrouped/manual-extra-project.json`
- No local absolute path in message or details: confirmed.

#### Result

**PASS**

---

### H. Manifest-listed missing file warning

#### Purpose

Verify that a manifest referencing a file that does not exist on disk produces a `manifest/warning` on load — but does **not** block the load. Verify warning messages do not leak local absolute paths.

#### Setup / Commands

```powershell
$Source = "$Base\B_existing_save"
$Root = "$Base\H_manifest_listed_missing"
Remove-Item $Root -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item $Source $Root -Recurse

$DataRoot = "$Root\CheerioFlowData"
$ManifestPath = "$DataRoot\.cheerio\snapshot-manifest.json"

$Manifest = Get-Content $ManifestPath | ConvertFrom-Json
$Manifest.files += [PSCustomObject]@{
  path = "projects/ungrouped/manifest-listed-missing-project.json"
  role = "project"
  sha256 = "0000000000000000000000000000000000000000000000000000000000000000"
  sizeBytes = 123
}

$Manifest | ConvertTo-Json -Depth 10 | Set-Content $ManifestPath
Get-Content $ManifestPath | ConvertFrom-Json
```

Open Cheerio Flow. **Browse** to `H_manifest_listed_missing`. Observe Storage Console.

#### Expected

- Manifest JSON is still legal and parseable.
- Workspace loads normally.
- No **Load failed**.
- Warning emitted: "Snapshot manifest references a file that is missing: projects/ungrouped/manifest-listed-missing-project.json."
- `related` = `projects/ungrouped/manifest-listed-missing-project.json` (relative path).
- Warning message does **not** contain local absolute path.

#### Observed

- Manifest JSON parseable: confirmed.
- Workspace loaded normally: confirmed.
- No **Load failed**: confirmed.
- Warning: `Snapshot manifest references a file that is missing: projects/ungrouped/manifest-listed-missing-project.json.`
- `related` = `projects/ungrouped/manifest-listed-missing-project.json`
- No local absolute path in message: confirmed.

#### Result

**PASS**

---

### I. Active JSON bad still blocks load

#### Purpose

Verify that a corrupt active project JSON still **blocks** workspace load — the pre-existing JSON parse gate takes priority over manifest verification. Verify the failure is not disguised as a `manifest/warning`.

#### Setup / Commands

```powershell
$Source = "$Base\B_existing_save"
$Root = "$Base\I_bad_active_json"
Remove-Item $Root -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item $Source $Root -Recurse

$DataRoot = "$Root\CheerioFlowData"
$Project = Get-ChildItem "$DataRoot\projects" -Recurse -Filter *.json | Select-Object -First 1

Set-Content $Project.FullName "{ this is broken project json"
Get-Content $Project.FullName
```

Open Cheerio Flow. **Browse** to `I_bad_active_json`. Observe Storage Console. Re-check the file on disk.

#### Expected

- `storage-root/failed` appears.
- A parse JSON error appears.
- The app does **not** enter normal workspace.
- The error is **not** disguised as `manifest/warning`.
- Autosave does **not** overwrite the corrupt file.
- The file on disk still contains `{ this is broken project json`.

#### Observed

- `storage-root/failed`: confirmed.
- Parse JSON error: confirmed.
- App did not enter normal workspace: confirmed.
- Not disguised as `manifest/warning`: confirmed. The error is a genuine load failure, not a warning-mode manifest event.
- Autosave did not overwrite: confirmed.
- File on disk still `{ this is broken project json`: confirmed.

#### Result

**PASS**

---

### J. Duplicate project ID still blocks load

#### Purpose

Verify that two active project JSON files sharing the same project ID still **block** workspace load — the duplicate-ID gate takes priority over manifest verification. Verify the failure is not disguised as a `manifest/warning`.

#### Setup / Commands

```powershell
$Source = "$Base\B_existing_save"
$Root = "$Base\J_duplicate_project_id"
Remove-Item $Root -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item $Source $Root -Recurse

$DataRoot = "$Root\CheerioFlowData"
$Project = Get-ChildItem "$DataRoot\projects" -Recurse -Filter *.json | Select-Object -First 1
$Duplicate = Join-Path $Project.DirectoryName "duplicate-project-id.json"

Copy-Item $Project.FullName $Duplicate
```

Open Cheerio Flow. **Browse** to `J_duplicate_project_id`. Observe Storage Console. Re-check files on disk.

#### Expected

- `storage-root/failed` appears.
- Error message: "Duplicate project id project-1782992840901148900 found at projects/ungrouped/duplicate-project-id.json and projects/ungrouped/project-1782992840901148900.json".
- The app does **not** enter normal workspace.
- The error is **not** disguised as `manifest/warning`.
- The duplicate file still exists on disk.

#### Observed

- `storage-root/failed`: confirmed.
- Error: `Duplicate project id project-1782992840901148900 found at projects/ungrouped/duplicate-project-id.json and projects/ungrouped/project-1782992840901148900.json`
- App did not enter normal workspace: confirmed.
- Not disguised as `manifest/warning`: confirmed.
- Duplicate file still on disk: confirmed.

#### Result

**PASS**

---

### K. v1 legacy layout compatibility

#### Purpose

Verify that v1 flat-layout (`projects/*.json`) workspaces load correctly, generate a manifest with `dataVersion: 1` and `layoutKind: v1-flat`, and do not auto-migrate.

#### Candidate Inspection

```powershell
$Candidate = "E:\CF_TEST\v0_1_6_fresh_parent\CheerioFlowData"

Test-Path $Candidate
Get-ChildItem $Candidate
Get-ChildItem "$Candidate\projects" -Recurse
Test-Path "$Candidate\projects\ungrouped"
Test-Path "$Candidate\projects\groups"
```

#### Observed

- Candidate `E:\CF_TEST\v0_1_6_fresh_parent\CheerioFlowData` exists: **True**
- `projects/ungrouped` exists: **True**
- `projects/groups` exists: **True**
- This workspace is **already v2 group-folder layout**, not v1 flat layout.

#### Decision

**NOT RUN**

No trusted v1 flat-layout workspace fixture was available. The inspected candidate was already v2. Synthesizing a v1 fixture for the sake of a PASS would produce misleading results and potentially mask real compatibility issues.

This item is tracked as a follow-up validation task. It does **not** block the v0.1.7 manifest/safety release scope.

#### Result

**NOT RUN** — pending availability of a trusted v1 flat-layout fixture.

---

### L. v2 stale/tmp exclusion

#### Purpose

Verify that `.tmp` files and stale/quarantine files are **excluded** from the snapshot manifest inventory.

#### Setup / Commands

A pre-existing v2 workspace copy was used, which contained a stale-like file at:

```
projects/groups/group-1782905452620-mijoh6/.fake-stale-project.json.tmp
```

```powershell
$Source = "E:\CF_TEST\v0_1_6_fresh_parent"
$Root = "$Base\L_stale_quarantine"
Remove-Item $Root -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item $Source $Root -Recurse

$DataRoot = "$Root\CheerioFlowData"
$ManifestPath = "$DataRoot\.cheerio\snapshot-manifest.json"
```

> **Note:** The source directory did not have a `snapshot-manifest.json`. A `manifest/warning` for missing manifest on load is **expected** for this scenario.

Open Cheerio Flow. **Browse** to `L_stale_quarantine`. **Save**. Verify manifest contents.

#### Verification Commands

```powershell
$Manifest = Get-Content $ManifestPath | ConvertFrom-Json
$Manifest | Select-Object manifestVersion, dataVersion, layoutKind
$Manifest.files | Select-Object path, role | Format-Table

# Verify no .tmp / stale / quarantine / before-* entries
$Manifest.files | Where-Object {
  $_.path -like "*.tmp" -or
  $_.path -like "*stale*" -or
  $_.path -like "*quarantine*" -or
  $_.path -like "*before*"
} | Select-Object path, role

$Manifest.files | Where-Object {
  $_.path -like "*fake-stale*"
} | Select-Object path, role
```

#### Expected

- `storage-root/committed` appears (with expected `manifest/warning` for missing manifest, since source has no manifest).
- `save/committed` appears.
- Manifest is generated with `manifestVersion: 1`, `dataVersion: 2`, `layoutKind: v2-group-folder`.
- `files` contains only active canonical paths: `app-state.json`, `groups.json`, and the active project JSON.
- Filtering for `.tmp`, `stale`, `quarantine`, `before*` patterns produces **no output**.
- The `.fake-stale-project.json.tmp` file is **not** listed in the manifest.

#### Observed

- `storage-root/committed`: confirmed.
- `manifest/warning` (missing manifest): confirmed — expected, source had no manifest.
- `save/committed`: confirmed.
- Manifest generated: `manifestVersion`: 1, `dataVersion`: 2, `layoutKind`: `v2-group-folder`.
- Manifest `files` contains:
  - `app-state.json`
  - `groups.json`
  - `projects/groups/group-1782905452620-mijoh6/project-1782901432307202600.json`
- Filter for `.tmp` / `stale` / `quarantine` / `before*`: **no output**.
- Filter for `fake-stale`: **no output**.

#### Result

**PASS**

---

### M. Manifest write failure does not fail save

#### Purpose

Verify that when the manifest cannot be written (e.g. `.cheerio` is a regular file, not a directory), the active save still succeeds and the failure is surfaced as a `manifest/warning` — not as **Save failed**.

#### Initial Manual Test (before `c8f1243`)

##### Setup

```powershell
$Source = "$Base\B_existing_save"
$Root = "$Base\M_manifest_write_failure"
Remove-Item $Root -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item $Source $Root -Recurse

$DataRoot = "$Root\CheerioFlowData"

Remove-Item "$DataRoot\.cheerio" -Recurse -Force
Set-Content "$DataRoot\.cheerio" "this is a file, not a directory"
```

Open Cheerio Flow. **Browse** to `M_manifest_write_failure`. **Save**. Observe Storage Console.

##### Observed

- Workspace loaded normally: confirmed.
- `save/committed`: confirmed.
- No **Save failed**: confirmed.
- `manifest/warning` appeared: confirmed.
- Active project JSON remained valid and parseable: confirmed.

##### Issue Found

The `manifest/warning` **message and details contained a local absolute path** (the full `data_root` or `manifest_dir` path on the test machine). This is a path-sanitization regression — warning messages should use relative paths only.

##### Verdict

**Core behavior: PASS** — manifest write failure correctly does not fail the active save.
**Path sanitization: FAIL** — warning messages leaked local absolute paths.

#### Patch Applied

```
c8f1243 fix: sanitize snapshot manifest warning messages
```

#### Retest After Patch

```powershell
$Source = "$Base\B_existing_save"
$Root = "$Base\M_manifest_write_failure_sanitized"
Remove-Item $Root -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item $Source $Root -Recurse

$DataRoot = "$Root\CheerioFlowData"

Remove-Item "$DataRoot\.cheerio" -Recurse -Force
Set-Content "$DataRoot\.cheerio" "this is a file, not a directory"
```

Open Cheerio Flow. **Browse** to `M_manifest_write_failure_sanitized`. **Save**. Observe Storage Console.

##### Retest Observed

- `storage-root/committed`: confirmed.
- Load-time `manifest/warning` (missing manifest): confirmed — expected, `.cheerio` is a file, not a directory.
- `save/started`: confirmed.
- `save/committed`: confirmed.
- `manifest/warning` (save-time):
  - Message: `Snapshot manifest was not updated, but active data was saved. Check local storage permissions or the .cheerio path.`
  - `related` = `.cheerio/snapshot-manifest.json`
  - Details: sanitized message, **no local absolute path**.
- No `C:\Users\...` or full `data_root` / `manifest_dir` path in message or details.
- Active project JSON still parseable: confirmed.

#### Result

**PASS** after `c8f1243`

---

### N. Storage Console behavior

#### Purpose

Verify that the Storage Console correctly displays manifest warnings, supports Copy/Clear/Close, does **not** show repair/retry/recalculate buttons, and does **not** open a Recovery Center.

#### Test Items

1. Warning rows are **readable** (operation, phase, severity visible).
2. **Copy** copies console content.
3. **Clear** clears the console.
4. **Close** closes the console.
5. No **repair** button.
6. No **retry** button.
7. No **recalculate** button.
8. No **Recovery Center**.

#### Initial Manual Test (before `c8f1243`)

All Storage Console UI behaviors (display, Copy, Clear, Close) worked correctly. However, **Copy** content included the save-time manifest warning message and details, which contained **local absolute paths** (same issue as item M).

#### Retest After `c8f1243`

- Warning rows readable (`manifest`, `warning`, `warning` severity): confirmed.
- Copy: confirmed — content copied, warning messages and details are now **sanitized** (no local absolute paths).
- `relatedPath` still correct (relative paths preserved).
- Clear: confirmed.
- Close: confirmed.
- No repair button: confirmed.
- No retry button: confirmed.
- No recalculate button: confirmed.
- No Recovery Center: confirmed.

#### Result

**PASS** after `c8f1243`

---

### O. Repo / stash audit

#### Purpose

Verify the repository is clean, no unintended code/docs modifications are present, and the long-term roadmap stash has not been restored.

#### Commands

```powershell
git status --short
git rev-parse --short HEAD
git stash list
```

#### Observed

- `git status --short`: **no output** (clean working tree).
- `HEAD` at initial check: `67f819e`.
- `HEAD` after patches: `168cfd6`.
- `stash@{0}: On main: wip long-term roadmap docs` — stash present but **not restored**.

#### Result

**PASS**

---

### UX. Browse directory memory

#### Purpose

Verify that the Browse dialog **remembers the last manually selected folder** across repeated opens and across app restarts.

#### Issue Found During Manual Testing

The Browse dialog did **not** remember the last manually selected outer storage root. Instead, it opened from a location near the current active storage path. This does not affect data safety, but it degrades the experience during repeated manual testing and daily use.

#### Patch Applied

```
168cfd6 fix: remember last browse directory
```

#### Implementation Semantics

- **localStorage key:** `cheerio-flow:last-browse-directory`
- Records the **user's manually selected outer storage root** (not `CheerioFlowData` internal paths).
- Does **not** update when the user cancels the Browse dialog.
- On storage-root apply failure, the user's selected folder is still recorded (does not change active storage root / apply failure semantics).
- Does **not** write to workspace data.
- Does **not** write to snapshot manifest.
- Does **not** affect save/load correctness.

#### Manual Quick Tests (1–6)

1. **Browse → select `A_fresh`** — success. Workspace opens normally.
2. **Click Browse again** — dialog opens from `A_fresh` (or nearby), **not** from `CheerioFlowData`.
3. **Browse → select `B_existing_save`** — success. Workspace opens normally.
4. **Click Browse again** — dialog remembers `B_existing_save` (or nearby).
5. **Restart app → click Browse** — dialog still remembers the last selected location.
6. **Browse memory is local UI preference only** — workspace data and snapshot manifest are unaffected.

#### Result

**PASS** after `168cfd6`

---

## Core Safety Semantics Verified

| Semantic | Status |
|---|---|
| Manifest missing/corrupt/mismatch does **not** block active workspace load. | PASS |
| Active JSON corruption **still blocks** load. | PASS |
| Duplicate project ID **still blocks** load. | PASS |
| Manifest write failure does **not** fail active save. | PASS |
| Manifest warnings are visible in Storage Console. | PASS |
| Warning-mode manifest issues do **not** trigger repair/retry/recalculate UI. | PASS |
| No Recovery Center was introduced. | PASS |
| Save-time manifest warning messages are sanitized (no local absolute paths). | PASS after `c8f1243` |
| Browse directory memory is local UI preference only. | PASS after `168cfd6` |

---

## Issues Found and Resolved During Manual Validation

### 1. Save-time manifest warning exposed local absolute path

**Found in:** M (Manifest write failure), N (Storage Console Copy)

**Initial behavior:**
- Active save succeeded.
- `manifest/warning` appeared.
- Warning `message` and `details` included the local absolute path (e.g. `C:\Users\...\AppData\Local\Temp\...`).

**Fix:**
```
c8f1243 fix: sanitize snapshot manifest warning messages
```

**Retest result:** PASS
- Warning `message` sanitized — no local absolute paths.
- Warning `details` sanitized — no local absolute paths.
- `relatedPath` remains relative (correct).

---

### 2. Browse dialog did not remember last selected folder

**Found in:** Repeated manual Browse UX testing across scenarios A–N.

**Fix:**
```
168cfd6 fix: remember last browse directory
```

**Retest result:** PASS
- Browse remembers last selected outer storage root.
- localStorage key: `cheerio-flow:last-browse-directory`.
- Does not write to workspace data.

---

## Known Non-blocking Warnings / Pending Items

1. **Vite chunk-size warning during `pnpm build`.**
   - Non-blocking.
   - Does not affect v0.1.7 manifest/safety validation.

2. **K. v1 legacy layout compatibility remains NOT RUN.**
   - No trusted v1 flat-layout fixture was available.
   - The inspected candidate was already v2 group-folder layout.
   - This should be validated later when a real v1 fixture is available.
   - This does **not** block v0.1.7 manifest/safety release scope.

---

## Release Gate Decision

**PASS for v0.1.7 manifest/safety release scope.**

All in-scope manual desktop tests (A–J, L–N, UX) have been executed and passed.

Two issues were found and resolved during manual validation:
1. Manifest warning path sanitization (`c8f1243`).
2. Browse directory memory (`168cfd6`).

Both patches were re-tested and confirmed PASS.

v0.1.7 can proceed to release prep after this report is committed.

> **Note:** v1 legacy layout compatibility (K) remains pending until a trusted v1 flat-layout fixture is available. This is tracked as a follow-up validation item and was **not** forced synthetically.

---

## Commit Information

- **Starting HEAD:** `67f819e`
- **Final tested HEAD:** `168cfd6`
- **Code modified:** No (documentation only)
- **Stash restored:** No
- **Working tree:** Clean

---

*Test log completed 2026-07-02.*
*All manual desktop observations provided by human tester. Documentation and coordination by Codex.*
