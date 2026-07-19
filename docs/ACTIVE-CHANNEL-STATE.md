# `activeChannels` state contract

`activeChannels` is shared by CommonTgService, tg-aut, and promote-clients. It
stores one durable operator gate, one durable forbidden safety stop, and a
small set of live Telegram facts instead of several independently writable
permission snapshots.

## Persisted eligibility fields

- `canSendMsgs`: the latest capability derived from Telegram's live channel
  facts.
- `banned` / `bannedAt`: durable global/operator stop. Runtime dialog refreshes
  and hydration must never clear it.
- `private`: latest live Telegram accessibility fact. A verified sendable
  observation clears a stale `private: true` marker.
- `forbidden`: durable safety stop. Runtime refresh may assert it but does not
  clear it.
- `broadcast`: retained channel type. Promotion selection accepts groups, not
  broadcast channels.
- `lastHydrationStatus`, `lastHydrationReason`, `lastHydratedAt`, and
  `lastLiveCheckedAt`: explain the latest live observation.

`restricted`, `sendMessages`, and `sendPlain` are transient Telegram inputs.
Writers collapse them into `canSendMsgs` and `lastHydrationReason`; they are not
persisted in either `activeChannels` or the source `channels` catalog. Joining
and promotion decisions use `canSendMsgs`, `banned`, `private`, `forbidden`, and
`broadcast` only.

New source-catalog (`channels`) records default to `canSendMsgs: false`. They
become join candidates only after a verified Telegram observation writes the
derived capability.

Message moderation uses exactly two counters: `freeformDeletedCount` for
AI/custom messages and `followUpDeletedCount` for follow-ups. They are the only
stored deletion counters; no renamed aliases are accepted or emitted.

## Writer ownership

- CommonTgService `PATCH /active-channels/:channelId` is the explicit unban
  path (`banned: false`). It marks the document `needs_hydration` and keeps
  `canSendMsgs: false` until a fresh Telegram observation restores it. Setting `banned: true` also stamps
  `bannedAt`.
- CommonTgService discovery/createMultiple, tg-aut bulk refresh, and
  promote-clients bulk refresh may update identity and live metadata including
  title, username, participant count, access hash, type, `private`, and
  `canSendMsgs`.
- Runtime refresh/hydration may assert a ban but cannot write `banned: false` or
  clear `bannedAt`.
- Runtime refresh/hydration may assert `forbidden: true`, but cannot clear a
  recorded forbidden safety stop.
- There are no compatibility aliases or per-write cleanup hooks for the removed
  fields. Their historical values are removed once with the scoped manual
  migration at `tg-platform/apps/promote-clients/scripts/cleanup-active-channel-blockers.js`.

Every promotion query must combine `canSendMsgs: true` with
`banned != true`, `private != true`, `forbidden != true`, and
`broadcast != true`. A durable banned document is rejected before Telegram
hydration so a different account's live view cannot reactivate it.
