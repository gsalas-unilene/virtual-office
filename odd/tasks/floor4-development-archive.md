# Fourth-floor development archive and branch cleanup

## Goal
Preserve the complete researched/modeling history in a dedicated repository folder, carry that archive onto local `main`, then remove every local branch except `main` without deleting the untracked project files or existing model assets.

## Scope and safety
- Archive folder: `archive/floor4-development/`.
- Include `README.md` as the closeout summary/index and `floor4-model-ledger.md` as a snapshot of the existing detailed task ledger.
- Preserve `odd/tasks/floor4-model.md`, Engram topic `odd/floor4-model/tasks`, source files, and checkpoint binaries at their current paths; reference them from the archive instead of duplicating large binaries.
- Keep `main`. Delete only other local branches after confirming their work is reachable from `main`.
- Do not run `git clean`, reset, or stage unrelated untracked application files. No remote is configured.
- Preserve `plano_oficina.pdf`, all checkpoint pairs, `src/office-plan.json`, and `public/models/office.glb` in their current locations.
- User authorized the local archive, merge to `main`, and deletion of non-main branches.

## Tasks
- [x] Create the archive README and task-ledger snapshot with researched dimensions/orientation, completed and provisional work, source/checkpoint inventory, verification evidence/limits, commit history, and native review closure.
  - Evidence: `archive/floor4-development/README.md` records the nonblocking cardinal-label advisory, native abandonment, untracked-file limits, and project status; `floor4-model-ledger.md` is verified byte-for-byte as a header plus the 20,753-byte source ledger.
- [x] Commit the archive work unit on the current feature branch and fast-forward local `main`.
  - Evidence: commit `d3c88c3` (`docs(floor4): archive reconstruction progress`) is now on `main` by fast-forward; no untracked files were staged.
- [x] Delete every non-main local branch and verify only `main` remains; leave all untracked project files untouched.
  - Evidence: `git branch -d feature/floor4-restart feature/floor4-north-openings` deleted both refs after `main` contained archive commit `d3c88c3`; final read-only verification found only local `main` at `d3c88c37e10c331f72fdf38fbd5895f69ddffba2` and no remote. Existing untracked project/app/checkpoint/PDF files remain in the worktree and were not staged or deleted.

## Acceptance
- `archive/floor4-development/README.md` is readable, accurate, and includes the closure reconciliation; `floor4-model-ledger.md` preserves the detailed project ledger; both point to the source and artifact locations.
- The archive commit is reachable from `main`.
- `main` remains checked out and is the sole local branch after cleanup.
- No source/model/checkpoint/public-asset contents are changed or deleted by this archival task.

## Verification
- Compare branch tips before deletion; all unique commits must be reachable from `main`.
- Verify the final branch list/status and archive commit on `main`.
- No tests are applicable to this documentation/ref cleanup; do not claim model or rendering validation.
