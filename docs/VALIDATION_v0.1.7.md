# Cheerio Flow v0.1.7 Manual Desktop Validation Report

## Summary

- Date: 2026-07-02
- Branch: main
- Commit: 53fb517
- Version: v0.1.7
- Scope: Snapshot manifest generation, warning-mode load verification, and Storage Console warning integration.
- Result: PARTIAL

Automated validation passed. Desktop UI manual validation was not run in this environment, so the release gate remains pending human desktop validation.

## Automated Validation

| Check | Result | Notes |
|---|---|---|
| cargo fmt --check | PASS | |
| cargo check | PASS | |
| cargo test | PASS | 86 passed |
| pnpm exec tsc --noEmit | PASS | |
| pnpm build | PASS | Vite chunk-size warning only |

## Desktop UI Manual Validation Status

Desktop UI manual validation: NOT RUN in this environment.

The project provides `desktop:dev` (`tauri dev`) and `desktop:build` (`tauri build`) scripts, but this validation pass did not perform interactive desktop UI testing. A human tester should run the checklist below on a real desktop session before release.

## Manual Desktop Validation

| ID | Scenario | Result | Notes |
|---|---|---|---|
| A | Fresh workspace / v2 happy path | NOT RUN | Requires interactive desktop UI validation. |
| B | Existing v2 save generates manifest | NOT RUN | Requires interactive desktop UI validation. |
| C | Missing manifest warning-mode load | NOT RUN | Requires interactive desktop UI validation. |
| D | Corrupt manifest warning-mode load | NOT RUN | Requires interactive desktop UI validation. |
| E | Checksum mismatch warning-mode load | NOT RUN | Requires interactive desktop UI validation. |
| F | Size mismatch warning-mode load | NOT RUN | Can be covered with E during manual validation. |
| G | Extra active file warning | NOT RUN | Requires interactive desktop UI validation. |
| H | Manifest-listed missing file warning | NOT RUN | Requires interactive desktop UI validation. |
| I | Active JSON bad still blocks load | NOT RUN | Requires interactive desktop UI validation. |
| J | Duplicate project ID still blocks load | NOT RUN | Requires interactive desktop UI validation. |
| K | v1 legacy layout compatibility | NOT RUN | Requires interactive desktop UI validation. |
| L | v2 stale quarantine exclusion | NOT RUN | Requires interactive desktop UI validation. |
| M | Manifest write failure does not fail save | NOT RUN | Requires interactive desktop UI validation. |
| N | Storage Console behavior | NOT RUN | Requires interactive desktop UI validation. |
| O | No accidental docs/stash pollution | PASS | Repository audit confirmed no README, roadmap, code, lockfile, or stash restoration changes. This validation report is the only intended docs change. |

## Human Manual Checklist

### A. Fresh workspace / v2 happy path

1. Create or choose an empty storage root.
2. Confirm the app creates the default workspace.
3. Confirm `app-state.json` exists.
4. Confirm `groups.json` exists.
5. Confirm the default project JSON exists.
6. Confirm `.cheerio/snapshot-manifest.json` exists.
7. Confirm Storage Console has no Save failed event.
8. Save and reload successfully.
9. Confirm manifest warnings are empty or no abnormal warning appears.

### B. Existing v2 save generates manifest

1. Open an existing v2 workspace.
2. Modify a node.
3. Save.
4. Confirm `.cheerio/snapshot-manifest.json` update time changes.
5. Confirm manifest files include `app-state.json`, `groups.json`, and active project JSON.
6. Confirm Storage Console shows normal save committed.
7. Confirm no manifest warning appears.

### C. Missing manifest warning-mode load

1. Close the app and delete `.cheerio/snapshot-manifest.json`.
2. Reopen the workspace.
3. Confirm active data loads normally.
4. Confirm Load failed is not shown.
5. Confirm Storage Console shows `manifest/warning`.
6. Confirm the message indicates the manifest is missing.
7. Save once and confirm the manifest is regenerated.

### D. Corrupt manifest warning-mode load

1. Replace `snapshot-manifest.json` with invalid JSON.
2. Reopen the workspace.
3. Confirm active data loads normally.
4. Confirm Load failed is not shown.
5. Confirm Storage Console shows `manifest/warning`.
6. Save once and confirm the manifest is regenerated.

### E. Checksum mismatch warning-mode load

1. Save the workspace so a manifest exists.
2. Close the app.
3. Edit an active project JSON while keeping it valid JSON.
4. Reopen the workspace.
5. Confirm active data loads normally.
6. Confirm Load failed is not shown.
7. Confirm Storage Console shows checksum mismatch `manifest/warning`.
8. Save once and confirm the manifest updates.
9. Reopen again and confirm the mismatch warning no longer appears.

### F. Size mismatch warning-mode load

1. Cover with scenario E by changing active project JSON size.
2. Confirm warning text or report reflects size and/or checksum mismatch.

### G. Extra active file warning

1. Save the workspace.
2. Close the app.
3. Add an extra valid project JSON in the canonical active project directory.
4. Reopen the workspace.
5. Confirm active load succeeds.
6. Confirm Storage Console shows extra active file `manifest/warning`.
7. Confirm Load failed is not shown.

### H. Manifest-listed missing file warning

1. Construct a manifest that lists a file that does not exist.
2. Keep active workspace JSON loadable.
3. Reopen the workspace.
4. Confirm Load failed is not shown.
5. Confirm Storage Console shows missing listed file `manifest/warning`.

### I. Active JSON bad still blocks load

1. Close the app.
2. Corrupt an active project JSON with invalid JSON.
3. Reopen the workspace.
4. Confirm Load failed is shown.
5. Confirm active JSON corruption is not presented as a manifest warning.
6. Confirm autosave does not overwrite the bad file.

### J. Duplicate project ID still blocks load

1. Create two active project JSON files with the same project id.
2. Reopen the workspace.
3. Confirm Load failed is shown.
4. Confirm the app does not enter the normal workspace.
5. Confirm autosave does not overwrite files.

### K. v1 legacy layout compatibility

1. Use a v1 flat `projects/*.json` layout.
2. Open the workspace.
3. Save.
4. Confirm manifest `dataVersion == 1`.
5. Confirm `layoutKind == v1-flat`.
6. Confirm `projects/ungrouped` is not automatically created.
7. Confirm `projects/groups` is not automatically created.
8. Confirm no automatic migration occurs.
9. Confirm Save failed is not shown.

### L. v2 stale quarantine exclusion

1. Create a v2 workspace.
2. Trigger a project move from the old canonical path to a new group path.
3. Save.
4. Confirm stale/quarantine files are not included in the manifest.
5. Confirm the manifest records only active canonical project paths.

### M. Manifest write failure does not fail save

1. Make `.cheerio` a regular file, or use another stable way to make manifest write fail.
2. Modify a project and save.
3. Confirm active JSON save succeeds.
4. Confirm Save committed is shown.
5. Confirm Save failed is not shown.
6. Confirm Storage Console shows `manifest/warning`.

### N. Storage Console behavior

1. Confirm manifest warning rows are readable.
2. Confirm Copy console includes `manifest/warning`.
3. Confirm Clear console works.
4. Confirm Close console works.
5. Confirm warnings do not show repair, retry, or recalculate buttons.
6. Confirm warnings do not open Recovery Center.

### O. No accidental docs/stash pollution

1. Confirm `git status --short` is clean after the validation report commit.
2. Confirm `README.md`, `README_CN.md`, and `docs/ROADMAP_LONG_TERM.md` were not modified.
3. Confirm the long-term roadmap stash was not restored.

## Known Non-blocking Warnings

- `pnpm build` reports the existing Vite chunk-size warning: some chunks are larger than 500 kB after minification.

## Blockers

- No automated validation blockers.
- Manual desktop validation is pending.

## Release Gate Decision

- PARTIAL: automated validation passed, manual desktop validation pending.

## Notes

- Snapshot manifest verification is warning-mode only.
- Snapshot manifest is not backup.
- Active JSON load failure remains a blocker.
- Snapshot manifest mismatch does not block load.
- Missing, corrupt, invalid schema, checksum mismatch, size mismatch, extra active file, manifest-listed missing file, and layout/dataVersion mismatch are surfaced as warnings.
- Manifest warnings are surfaced through Storage Console `manifest/warning` events.
