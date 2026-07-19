# Projects Workspace Rules

## Canonical workspace

Make all repository changes only under:

`/Users/SaiKumar.Shetty/Documents/Projects/local/<repo>`

Sibling repositories under `/Users/SaiKumar.Shetty/Documents/Projects/<repo>` are read-only
references/mirrors. Do not edit, format, build, install packages, commit, reset, or generate files
there unless the user explicitly overrides this rule for a specific operation.

- Preserve all existing uncommitted changes in local repositories.
- Run edits, builds, tests that generate files, commits, and pushes from `Projects/local`.
- A commit in a local repository triggers the user's existing outer-mirror synchronization.
  Never manually duplicate committed changes into an outer mirror.
- If a repository exists only outside `Projects/local`, stop and ask how its canonical local copy
  should be established before changing it.

## Live Telegram operations

The Telegram fleet runs on VMs managed by PM2, not Kubernetes. Do not use `kubectl` for
`tg-platform`, `tg-aut`, `promote-clients`, `CommonTgService`, or related Telegram services unless
the user explicitly requests an ABL/Kubernetes environment.

Read these references before any live health, log, API, SSH, PM2, database, deployment, or restart
operation. Do not duplicate their operational details in this file:

- `/Users/SaiKumar.Shetty/Documents/Projects/local/docs/DEPLOYMENT-TOPOLOGY.md`
  — service/client to branch, VM, and port mapping.
- `/Users/SaiKumar.Shetty/Documents/Projects/local/docs/FLEET-DEBUGGING-RUNBOOK.md`
  — SSH procedure, PM2 commands, log locations, configuration/Mongo discovery, deployment safety,
  and debugging flow.

Treat Telegram sessions as non-renewable. Use one-process canaries, verify logs and health, and
never restart the whole fleet at once. Do not print secrets, connection strings, sessions, or full
environment dumps in tool output or responses.

## Code and architecture references

Validate behavior against current code first; documentation describes intent and operational risk.
Load only the references relevant to the task:

- Common lifecycle and schedulers:
  `CommonTgService/docs/END-TO-END-LIFECYCLE.md`
- Session-survival constraints:
  `tg-platform/apps/promote-clients/docs/SESSION-SURVIVAL-PLAN.md`
- Promotion runtime:
  `tg-platform/apps/promote-clients/docs/functionality/promotion-engine.md`
- Promotion service architecture:
  `tg-platform/apps/promote-clients/docs/architecture/high-level-flow.md`
- Shared-state/storage contract:
  `tg-platform/apps/promote-clients/docs/functionality/data-and-storage.md`
- Shared promotion audit checklist:
  `tg-prom-helper/docs/channel-message-promotions-functional-audit-checklist.md`
- Repeated audit stop rule:
  `tg-prom-helper/docs/channel-message-promotions-audit-monitor.md`

`tg-platform` contains the active tg-aut and promote-clients applications plus shared packages.
`CommonTgService` owns lifecycle/orchestration APIs and shared Mongo schemas. `tg-prom-helper` is a
shared library. Treat changes to shared Mongo collections, runtime configuration, Telegram session
handling, channel state, promotion attribution, and account selection as cross-repository changes.

## Review requirements

1. Inspect current code, readers, writers, defaults, filters, upserts, and old-document behavior in
   every affected local repository.
2. For shared library changes, verify exports and every consumer.
3. For Telegram-touching changes, review connection behavior, pacing, retry volume, session
   revocation risk, and shutdown/restart behavior before implementation.
4. For promotion/conversion changes, verify outbound writes and downstream user/conversation state.
5. Report documentation mismatches and update references when behavior intentionally changes.
6. Never infer that an outer mirror is newer or canonical merely because it contains uncommitted
   files; compare it read-only against the local worktree.

## Workspace skill

For a cross-repository review, read and follow:

`/Users/SaiKumar.Shetty/Documents/Projects/local/skills/review-changes.md`
