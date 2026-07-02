# Cheerio Flow v0.1.7 Manual Desktop Validation Report

## Summary

- **Date:** 2026-07-02
- **Branch:** `main`
- **Final tested commit:** `168cfd6`
- **Version:** v0.1.7
- **Scope:** Snapshot manifest generation, warning-mode load verification, Storage Console warning integration, and Browse directory memory.
- **Result:** **PASS**

Automated validation passed. Human desktop manual validation has been completed and all in-scope items (A–J, L–N, UX) pass. The full manual test record is in [docs/MANUAL_TEST_LOG_v0.1.7.md](./MANUAL_TEST_LOG_v0.1.7.md).

## Automated Validation

| Check | Result | Notes |
|---|---|---|
| `cargo fmt --check` | PASS | |
| `cargo check` | PASS | |
| `cargo test` | PASS | 86 passed |
| `pnpm exec tsc --noEmit` | PASS | |
| `pnpm build` | PASS | Vite chunk-size warning only |

## Manual Desktop Validation

Detailed test procedures, PowerShell commands, expected results, and observed results are recorded in the full manual test log:
→ **[docs/MANUAL_TEST_LOG_v0.1.7.md](./MANUAL_TEST_LOG_v0.1.7.md)**

### Human Execution Statement

All Manual Desktop Validation items were executed by the user on a real Windows desktop environment. Claude / Codex did not perform native Tauri desktop window interaction, nor did it fabricate desktop validation results. All PASS / FAIL / NOT RUN verdicts are based on actual human observations. See the manual test log for the full execution statement.

### Results Summary

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
| K | v1 legacy layout compatibility | NOT RUN | No trusted v1 flat-layout fixture available |
| L | v2 stale/tmp exclusion | PASS | |
| M | Manifest write failure does not fail save | PASS | Core behavior PASS; path-sanitization issue found and fixed via `c8f1243` |
| N | Storage Console behavior | PASS | All UI behaviors correct; Copy sanitization confirmed after `c8f1243` |
| O | Repo / stash audit | PASS | |
| UX | Browse directory memory | PASS | Browse memory fixed via `168cfd6`; localStorage key `cheerio-flow:last-browse-directory` |

### Issues Found and Resolved

1. **Save-time manifest warning exposed local absolute path** — Found in M/N. Fixed by `c8f1243` (sanitize snapshot manifest warning messages). Retest: PASS.
2. **Browse dialog did not remember last selected folder** — Found during repeated manual testing. Fixed by `168cfd6` (remember last browse directory). Retest: PASS.

## Human Manual Checklist (Quick Reference)

For full procedures and PowerShell commands, see [docs/MANUAL_TEST_LOG_v0.1.7.md](./MANUAL_TEST_LOG_v0.1.7.md).

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

→ **PASS**

### B. Existing v2 save generates manifest

1. Open an existing v2 workspace.
2. Modify a node.
3. Save.
4. Confirm `.cheerio/snapshot-manifest.json` update time changes.
5. Confirm manifest files include `app-state.json`, `groups.json`, and active project JSON.
6. Confirm Storage Console shows normal save committed.
7. Confirm no manifest warning appears.

→ **PASS**

### C. Missing manifest warning-mode load

1. Close the app and delete `.cheerio/snapshot-manifest.json`.
2. Reopen the workspace.
3. Confirm active data loads normally.
4. Confirm Load failed is not shown.
5. Confirm Storage Console shows `manifest/warning`.
6. Confirm the message indicates the manifest is missing.
7. Save once and confirm the manifest is regenerated.

→ **PASS**

### D. Corrupt manifest warning-mode load

1. Replace `snapshot-manifest.json` with invalid JSON.
2. Reopen the workspace.
3. Confirm active data loads normally.
4. Confirm Load failed is not shown.
5. Confirm Storage Console shows `manifest/warning`.
6. Save once and confirm the manifest is regenerated.

→ **PASS**

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

→ **PASS**

### F. Size mismatch warning-mode load

1. Cover with scenario E by changing active project JSON size.
2. Confirm warning text or report reflects size and/or checksum mismatch.

→ **PASS**

### G. Extra active file warning

1. Save the workspace.
2. Close the app.
3. Add an extra valid project JSON in the canonical active project directory.
4. Reopen the workspace.
5. Confirm active load succeeds.
6. Confirm Storage Console shows extra active file `manifest/warning`.
7. Confirm Load failed is not shown.

→ **PASS**

### H. Manifest-listed missing file warning

1. Construct a manifest that lists a file that does not exist.
2. Keep active workspace JSON loadable.
3. Reopen the workspace.
4. Confirm Load failed is not shown.
5. Confirm Storage Console shows missing listed file `manifest/warning`.

→ **PASS**

### I. Active JSON bad still blocks load

1. Close the app.
2. Corrupt an active project JSON with invalid JSON.
3. Reopen the workspace.
4. Confirm Load failed is shown.
5. Confirm active JSON corruption is not presented as a manifest warning.
6. Confirm autosave does not overwrite the bad file.

→ **PASS**

### J. Duplicate project ID still blocks load

1. Create two active project JSON files with the same project id.
2. Reopen the workspace.
3. Confirm Load failed is shown.
4. Confirm the app does not enter the normal workspace.
5. Confirm autosave does not overwrite files.

→ **PASS**

### K. v1 legacy layout compatibility

→ **NOT RUN** — No trusted v1 flat-layout fixture available. Tracked as follow-up.

### L. v2 stale quarantine exclusion

1. Create a v2 workspace.
2. Trigger a project move from the old canonical path to a new group path.
3. Save.
4. Confirm stale/quarantine files are not included in the manifest.
5. Confirm the manifest records only active canonical project paths.

→ **PASS**

### M. Manifest write failure does not fail save

1. Make `.cheerio` a regular file, or use another stable way to make manifest write fail.
2. Modify a project and save.
3. Confirm active JSON save succeeds.
4. Confirm Save committed is shown.
5. Confirm Save failed is not shown.
6. Confirm Storage Console shows `manifest/warning`.

→ **PASS** after `c8f1243` (warning messages sanitized — no local absolute paths).

### N. Storage Console behavior

1. Confirm manifest warning rows are readable.
2. Confirm Copy console includes `manifest/warning`.
3. Confirm Clear console works.
4. Confirm Close console works.
5. Confirm warnings do not show repair, retry, or recalculate buttons.
6. Confirm warnings do not open Recovery Center.

→ **PASS** after `c8f1243` (Copy content sanitized).

### O. No accidental docs/stash pollution

1. Confirm `git status --short` is clean after the validation report commit.
2. Confirm `README.md`, `README_CN.md`, and `docs/ROADMAP_LONG_TERM.md` were not modified.
3. Confirm the long-term roadmap stash was not restored.

→ **PASS**

### UX. Browse directory memory

1. Browse dialog remembers last manually selected outer storage root.
2. localStorage key: `cheerio-flow:last-browse-directory`.
3. Does not write to workspace data or snapshot manifest.
4. Survives app restart.

→ **PASS** after `168cfd6`.

## Core Safety Semantics Verified

| Semantic | Status |
|---|---|
| Manifest missing/corrupt/mismatch does not block active workspace load. | PASS |
| Active JSON corruption still blocks load. | PASS |
| Duplicate project ID still blocks load. | PASS |
| Manifest write failure does not fail active save. | PASS |
| Manifest warnings are visible in Storage Console. | PASS |
| Warning-mode manifest issues do not trigger repair/retry/recalculate UI. | PASS |
| No Recovery Center was introduced. | PASS |
| Save-time manifest warning messages are sanitized after `c8f1243`. | PASS |
| Browse directory memory is local UI preference only after `168cfd6`. | PASS |

## Known Non-blocking Warnings

- `pnpm build` reports the existing Vite chunk-size warning: some chunks are larger than 500 kB after minification.
- K (v1 legacy layout compatibility) remains NOT RUN — no trusted v1 flat-layout fixture was available. Tracked as follow-up.

## Release Gate Decision

**PASS for v0.1.7 manifest/safety release scope.**

All in-scope manual desktop tests have been executed and passed. Two issues found during human validation were fixed (`c8f1243`, `168cfd6`) and re-tested. v0.1.7 can proceed to release prep.

> v1 legacy layout compatibility (K) is tracked as a follow-up validation item. It does not block v0.1.7.

## Notes

- Snapshot manifest verification is warning-mode only.
- Snapshot manifest is not backup.
- Active JSON load failure remains a blocker.
- Snapshot manifest mismatch does not block load.
- Missing, corrupt, invalid schema, checksum mismatch, size mismatch, extra active file, manifest-listed missing file, and layout/dataVersion mismatch are surfaced as warnings.
- Manifest warnings are surfaced through Storage Console `manifest/warning` events.
- Warning messages and details are sanitized — no local absolute paths.
- Full manual test procedures in [docs/MANUAL_TEST_LOG_v0.1.7.md](./MANUAL_TEST_LOG_v0.1.7.md).
