# Cheerio Flow v0.1.7 Release Notes

Snapshot Manifest, SHA-256 Integrity Warnings, and Storage Console Visibility

---

## GitHub Release Title

```
Cheerio Flow v0.1.7 — Snapshot Manifest & Integrity Warnings
```

---

## Summary

v0.1.7 introduces a **snapshot manifest** for active workspace files — an integrity observation layer that records what was saved, computes SHA-256 checksums, and surfaces discrepancies as Storage Console warnings without blocking access to your data.

- Generates `.cheerio/snapshot-manifest.json` atomically after every successful active save.
- Records each active workspace file with its role, size, and SHA-256 checksum.
- Verifies the manifest on load in **warning-mode** — missing, corrupt, checksum-mismatched, size-mismatched, extra, or missing-listed files are reported as warnings, never as load blockers.
- Keeps the real gates intact: invalid project JSON and duplicate project IDs still block load.
- Ensures manifest write failure does **not** fail the active save.
- Sanitizes all user-visible manifest warning messages — no local absolute paths are exposed.
- Remembers the last manually selected Browse folder as a local UI preference.

---

## Core Principle

> The snapshot manifest is an **integrity observation layer**, not a recovery system, and not a load blocker.

> 快照清单是体检报告，不是备份，也不是开门锁。

Specifically:

| Behavior | Design |
|---|---|
| Manifest missing, corrupt, or mismatched | **Warning** — load proceeds normally |
| Active project JSON corrupt | **Blocked** — load fails |
| Duplicate project ID | **Blocked** — load fails |
| Manifest write fails during save | **Warning** — active save succeeds |
| Manifest auto-repair / regeneration on load | **Not implemented** — out of scope |
| Recovery Center | **Not implemented** — out of scope |

---

## Added

1. **Snapshot manifest inventory helper** — `collect_active_file_inventory` identifies canonical active files per layout (v1 flat / v2 group-folder), excluding `.tmp`, stale quarantine, backups, and non-canonical paths.
2. **SHA-256 checksum helper** — `sha256_hex` computes lowercase hex-encoded SHA-256 over raw file bytes using the `sha2` crate.
3. **In-memory snapshot manifest builder** — `build_snapshot_manifest_in_memory` assembles a `SnapshotManifest` struct with file inventory, roles, checksums, and layout metadata.
4. **Atomic snapshot manifest writer** — `write_snapshot_manifest` uses the same atomic-write pipeline as active data (write temp → flush → sync → verify → rename).
5. **Save-time manifest generation** — after active save succeeds, the manifest is generated and written. Manifest failure downgrades to a warning; active save success is preserved.
6. **Storage Console manifest warnings** — `manifest` and `verify` operations, `warning` phase, surfaced through existing `appendStorageEvent`.
7. **Load-time warning-mode manifest verification** — runs after the existing JSON load gate; never blocks load.
8. **Manual validation report** — `docs/VALIDATION_v0.1.7.md`.
9. **Manual test log** — `docs/MANUAL_TEST_LOG_v0.1.7.md`.
10. **Browse directory memory** — `localStorage` key `cheerio-flow:last-browse-directory` records last manually selected outer storage root.

---

## Changed

- **Storage Console** now displays `manifest/warning` events for both save-time and load-time manifest issues.
- **Manifest warning events** are mapped consistently through the frontend event helper — `manifest` and `verify` operations use `warning` phase for non-fatal observations.
- **Browse dialog `defaultPath`** now uses the last manually selected outer storage root (localStorage: `cheerio-flow:last-browse-directory`), instead of deriving a default from the active storage path.
- **Save-time manifest warning messages** are sanitized — `message` and `details` no longer contain local absolute paths (fixed in `c8f1243`).

---

## Not Changed

- **No backup/restore/migration behavior changed.**
- **No Recovery Center added.**
- **No repair/retry/recalculate flow added.**
- **No auto-regenerate-on-load behavior added.**
- **No checksum blocker added.** Manifest mismatch is never a load blocker.
- **No `.chf` package changes.**
- **No nested graph changes.**
- **No workspace data format changes** beyond the creation of `.cheerio/snapshot-manifest.json`.
- **Browse memory** is a local UI preference only — it is not written to workspace data and does not affect save/load correctness.

---

## Validation

See [docs/VALIDATION_v0.1.7.md](./VALIDATION_v0.1.7.md) and [docs/MANUAL_TEST_LOG_v0.1.7.md](./MANUAL_TEST_LOG_v0.1.7.md) for full details.

### Automated

| Check | Result | Notes |
|---|---|---|
| `cargo fmt --check` | PASS | |
| `cargo check` | PASS | |
| `cargo test` | PASS | 86 passed |
| `pnpm exec tsc --noEmit` | PASS | |
| `pnpm build` | PASS | Vite chunk-size warning only |

### Manual Desktop

All manual desktop tests were executed by the user on a real Windows desktop environment. Codex did not perform or fabricate native Tauri window interactions.

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
| K | v1 legacy layout compatibility | **NOT RUN** |
| L | v2 stale/tmp exclusion | PASS |
| M | Manifest write failure does not fail save | PASS |
| N | Storage Console behavior | PASS |
| O | Repo / stash audit | PASS |
| UX | Browse directory memory | PASS |

---

## Issues Found and Resolved

1. **Save-time manifest warning exposed local absolute path** — found during M/N manual testing. Warning `message` and `details` included full local paths. Fixed by `c8f1243`. Retested: PASS.
2. **Browse dialog did not remember last selected folder** — found during repeated manual Browse testing. Fixed by `168cfd6`. Retested: PASS.

---

## Known Non-blocking Warnings

1. **Vite chunk-size warning** during `pnpm build`. Non-blocking. Does not affect v0.1.7 manifest/safety validation.
2. **v1 legacy flat-layout compatibility** (scenario K) was not manually validated — no trusted v1 flat-layout fixture was available. The inspected candidate was already v2 group-folder layout. This is tracked as a follow-up validation item and does **not** block v0.1.7.

---

## Follow-up Items

1. Validate v1 legacy flat-layout with a trusted fixture when one becomes available.
2. Consider single-writer workspace lock for a future release (e.g. v0.1.8).
3. Consider Recovery Center in a later release — explicitly out of scope for v0.1.7.
4. Continue avoiding any auto-repair behavior until explicitly designed, reviewed, and validated.

---

## Release Gate

**PASS.** v0.1.7 can proceed to release tagging after final maintainer review.

---

## GitHub Release Body Draft

Copy the content below directly into the GitHub release description.

---

**Title:** `Cheerio Flow v0.1.7 — Snapshot Manifest & Integrity Warnings`

**Body:**

```text
Cheerio Flow v0.1.7 introduces snapshot manifest support for active
workspace integrity observation.

Highlights:

- Generates .cheerio/snapshot-manifest.json after successful active saves.
- Records active workspace files with roles, sizes, and SHA-256 checksums.
- Writes snapshot manifests atomically.
- Verifies manifests on load in warning-mode.
- Reports missing, corrupt, size-mismatched, checksum-mismatched, extra,
  and missing-listed files as Storage Console warnings.
- Keeps active JSON corruption and duplicate project IDs as blocking load
  errors.
- Ensures manifest write failure does not fail active save.
- Sanitizes user-visible manifest warnings so local absolute paths are
  not exposed.
- Remembers the last manually selected Browse directory as a local UI
  preference.

Validation:

- Rust checks: PASS
- TypeScript checks: PASS
- Production build: PASS (known Vite chunk-size warning only)
- Manual desktop validation: completed by the user
  - A–J: PASS
  - K: NOT RUN (no trusted v1 flat-layout fixture)
  - L–O: PASS
  - Browse UX: PASS

Core safety rule:
Manifest problems warn. Active data corruption still blocks.
```
