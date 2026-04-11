# Relationship Scoring & User Schema Refactor

## Goal

Detect which Telegram accounts have close personal relationships (girlfriend, best friend) by scoring per-chat interaction patterns. Provide two endpoints: rank users by relationship quality, and view a specific user's relationships. Support on-demand recompute.

## Schema Redesign

### Current problems
- Flat fields (photoCount, ownVideoCount, etc.) mixed with identity fields
- `calls.chats[]` is an unbounded array embedded in the user doc
- `score` is a single opaque number with no freshness tracking
- No place for relationship data

### New User schema

```
User {
  // --- Identity (from Telegram) ---
  mobile: string             (required, unique)
  session: string            (required, unique)
  tgId: string               (required, unique)
  firstName: string
  lastName: string | null
  username: string | null
  gender: string | null

  // --- Account state ---
  twoFA: boolean             (default: false)
  expired: boolean           (default: false)
  password: string | null

  // --- Operational flags ---
  starred: boolean           (default: false)
  demoGiven: boolean

  // --- Account-level stats ---
  stats: {
    channels: number
    personalChats: number
    totalChats: number
    contacts: number
    msgs: number
    photoCount: number
    videoCount: number
    movieCount: number
    ownPhotoCount: number
    otherPhotoCount: number
    ownVideoCount: number
    otherVideoCount: number
    lastActive: string
  }

  // --- Call summary (account-level) ---
  calls: {
    totalCalls: number
    outgoing: number
    incoming: number
    video: number
    audio: number
  }
  // NOTE: calls.chats[] removed from here — per-chat data lives in relationships.top

  // --- Relationship scoring ---
  relationships: {
    score: number                    // overall relationship quality for this account
    bestScore: number                // max(top[].score) — indexed for ranking query
    computedAt: Date | null          // when last computed
    top: [{                          // top 5 relationships, sorted by score desc
      chatId: string
      name: string
      username: string | null
      phone: string | null
      messages: number
      mediaCount: number
      voiceCount: number
      intimateMessageCount: number   // count of messages matching intimate keywords
      calls: {
        total: number
        incoming: number
        videoCalls: number
        avgDuration: number
        totalDuration: number
      }
      commonChats: number            // shared groups count
      isMutualContact: boolean
      lastMessageDate: string | null
      score: number                  // per-relationship score
    }]
  }
}
```

### Migration strategy

Existing flat fields (`photoCount`, `channels`, `calls`, etc.) move under `stats` and `calls`. Migration:

1. Schema file updated with new structure
2. CreateUserDto, UpdateUserDto, SearchUserDto updated to match
3. A one-time migration script moves existing docs: `{ $rename: { photoCount: "stats.photoCount", ... } }` and `{ $unset: { "calls.chats": "" } }`
4. All consumers updated — see impact list below

### Consumer impact (18 files)

**CommonTgService-local:**
| File | Fields accessed | Change needed |
|------|----------------|---------------|
| `users/schemas/user.schema.ts` | all | Restructure schema |
| `users/dto/create-user.dto.ts` | all | Restructure to match schema |
| `users/dto/update-user.dto.ts` | inherits | Auto-updated via PartialType |
| `users/dto/search-user.dto.ts` | filter fields | Prefix with `stats.` where needed |
| `users/users.service.ts` | score, calls.totalCalls, photoCount, videoCount | Update query paths |
| `users/users.controller.ts` | DTOs | Updated via DTO changes |
| `TgSignup/tg-signup.service.ts` | all fields on create | Update to nested structure |
| `buffer-clients/buffer-client.service.ts` | channels, lastActive, totalChats | These are on buffer/promote schema, NOT user — no change needed |
| `promote-clients/promote-client.service.ts` | channels, lastActive, totalChats | Same — buffer/promote schema, not user |
| `shared/base-client.service.ts` | channels (buffer docs) | Buffer schema, not user — verify |
| `shared/warmup-phases.ts` | channels (buffer docs) | Buffer schema, not user — verify |
| `clients/client.service.ts` | channels (buffer query) | Buffer schema, not user |
| `Telegram/Telegram.controller.ts` | API response docs | Update Swagger schemas |
| `Telegram/manager/chat-operations.ts` | Returns stats for population | Return shape stays same; consumer maps to new paths |

**my-tg-local (dashboard):**
| File | Fields accessed | Change needed |
|------|----------------|---------------|
| `types/api.ts` | User type definition | Update to nested structure |
| `components/UserProfileView.tsx` | msgs, totalChats, personalChats, channels, contacts, lastActive | Prefix with `stats.` |
| `components/UserSelector.tsx` | ownPhotoCount, otherPhotoCount, calls, movieCount, contacts | Prefix with `stats.` / update calls path |
| `components/ChatExplorer.tsx` | calls.totalCalls, calls.incoming etc | Update calls path |

**Key insight:** `channels`, `lastActive`, `totalChats` on buffer-client and promote-client services reference their OWN schemas (bufferClients/promoteClients collections), not the User schema. Only 6 files in CommonTgService + 4 dashboard files actually need changes for the User schema refactor.

## Relationship Scoring Engine

### Data collection — `computeRelationshipScore(mobile)`

One method that:

1. **Get connection** — `connectionManager.getClient(mobile)`, track if pre-existing
2. **Fetch top peers** — `contacts.GetTopPeers({ correspondents: true, phoneCalls: true })` — 1 API call, returns Telegram's server-side ranking
3. **Fetch top private chats** — `telegramClient.getTopPrivateChats(30, false)` — gets per-chat messages, media, calls
4. **For top 10 chats, fetch additional signals:**
   - `messages.GetSearchCounters(peer, [Photos, Video, Voice])` — fast media counts (1 call per chat)
   - `messages.GetCommonChats(userId)` — shared groups (1 call per chat)
   - **Intimate keyword search** — `messages.Search(peer, q=keyword, limit=1)` returns `.total` match count without fetching messages. Keywords are grouped into batches of related terms to reduce API calls (e.g., search "love" covers "love you", "i love", "my love"). ~5-6 searches per chat instead of 15.
   - Mutual contact status from `getContacts()` result (1 call total, cached across all chats)
5. **Score each chat** using the formula below
6. **Store top 5** in `relationships.top`, best score in `relationships.bestScore`
7. **Update account-level stats** and `calls` from the data already fetched
8. **Cleanup** — `unregisterClient` only if we created the connection

### Intimate keywords array

```typescript
const INTIMATE_KEYWORDS = [
  'love', 'luv', 'lub',
  'kiss', 'kisses',
  'hug', 'hugs',
  'miss you', 'missing you',
  'baby', 'babe', 'bae',
  'darling', 'sweetheart', 'jaan', 'jaanu',
  'good night', 'good morning',
  'i love you', 'ily',
];
```

Stored as a module-level constant. Easy to expand later.

**Search strategy:** Rather than 15 individual searches per chat, group into ~6 root-term searches. Telegram's `messages.Search` does substring matching, so searching "love" catches "love you", "i love", "my love" etc. The groups:
1. `"love"` — catches love, luv (separate search), lub
2. `"kiss"` — catches kiss, kisses  
3. `"hug"` — catches hug, hugs
4. `"miss you"` — catches miss you, missing you
5. `"baby"` — catches baby, babe (separate for bae)
6. `"good morning"` + `"good night"` — daily ritual signals
7. `"jaan"` — catches jaan, jaanu

For each search, `messages.Search(peer, q=keyword, limit=1)` returns `.total` — the match count without fetching message content. Sum across all searches = `intimateMessageCount`.

### Scoring formula

```typescript
function scoreRelationship(chat: RelationshipCandidate): number {
  const {
    messages, mediaCount, voiceCount, intimateMessageCount,
    calls, commonChats, isMutualContact, lastMessageDate
  } = chat;

  // Base signals
  const msgScore = Math.min(messages, 3000) * 1.0;
  const mediaScore = Math.min(mediaCount, 300) * 3.0;
  const voiceScore = Math.min(voiceCount, 100) * 4.0;

  // Call signals — incoming and video weighted heavily
  const callScore =
    calls.incoming * 8.0 +
    (calls.total - calls.incoming) * 3.0 +  // outgoing
    calls.videoCalls * 12.0 +
    Math.min(calls.totalDuration, 36000) * 0.02 +  // cap at 10hrs
    Math.min(calls.avgDuration, 1800) * 0.1;        // cap at 30min

  // Intimate language — HEAVY weight, result count matters
  const intimateScore = Math.min(intimateMessageCount, 500) * 10.0;

  // Social graph
  const mutualScore = isMutualContact ? 50 : 0;
  const commonChatScore = Math.min(commonChats, 10) * 15.0;

  // Recency bonus (0-100, decays over 90 days)
  const daysSinceLastMessage = lastMessageDate
    ? (Date.now() - new Date(lastMessageDate).getTime()) / (1000 * 60 * 60 * 24)
    : 999;
  const recencyBonus = daysSinceLastMessage <= 90
    ? 100 * (1 - daysSinceLastMessage / 90)
    : 0;

  return msgScore + mediaScore + voiceScore + callScore
       + intimateScore + mutualScore + commonChatScore + recencyBonus;
}
```

Weight rationale:
- `intimateMessageCount × 10` is the heaviest per-unit weight — a chat with 100 "love" messages gets 1000 points, outweighing pure volume
- `videoCalls × 12` next — video calling someone is strong intimacy
- `incoming calls × 8` — they reach out to you
- `voiceCount × 4` — voice messages are more personal than text
- `mediaCount × 3` — photo/video sharing
- `messages × 1` — baseline, capped at 3000 to prevent high-volume chats from dominating
- `commonChats × 15` — shared groups indicate real-world connection
- `mutualContact` — flat 50 bonus, being saved as a contact is meaningful

### Account-level score

`relationships.score` = sum of top 3 relationship scores, normalized. This represents "how relationship-rich is this account overall."

`relationships.bestScore` = `top[0].score` — the single best relationship. Indexed for the ranking query.

## API Endpoints

### 1. `GET /user/top-relationships`

Returns users ranked by `relationships.bestScore`. Pre-computed, no Telegram connection.

Query params: `page`, `limit`, `minScore`, `gender`, `excludeTwoFA`, `excludeExpired`

Response:
```json
{
  "users": [
    {
      "mobile": "...",
      "tgId": "...",
      "firstName": "...",
      "relationships": { "bestScore": 4500, "computedAt": "...", "top": [...] }
    }
  ],
  "total": 150,
  "page": 1,
  "limit": 20,
  "totalPages": 8
}
```

### 2. `GET /user/:mobile/relationships`

Returns relationship details for a specific user. Pre-computed, no Telegram connection.

Response:
```json
{
  "mobile": "...",
  "firstName": "...",
  "relationships": {
    "score": 8500,
    "bestScore": 4500,
    "computedAt": "2026-04-11T...",
    "top": [
      {
        "chatId": "123456",
        "name": "Priya",
        "messages": 2450,
        "mediaCount": 89,
        "voiceCount": 34,
        "intimateMessageCount": 156,
        "calls": { "total": 45, "incoming": 28, "videoCalls": 12, "avgDuration": 480, "totalDuration": 21600 },
        "commonChats": 3,
        "isMutualContact": true,
        "lastMessageDate": "2026-04-10T...",
        "score": 4500
      }
    ]
  }
}
```

### 3. `POST /user/recompute-score/:mobile`

Triggers live `computeRelationshipScore(mobile)`. Takes 30-60s. Returns updated relationships.

### Auth key safety

- `computeRelationshipScore` checks `connectionManager.isClientConnected(mobile)` before connecting
- If already connected (warmup/promote using it), reuses that connection and does NOT unregister after
- If we create the connection, we unregister in `finally`
- Sequential processing — never two recomputes for the same mobile concurrently (cooldown map)

## Performance budget

Per-user recompute:
- `GetTopPeers`: 1 call, <1s
- `getTopPrivateChats(30)`: ~15-20 calls, 30-60s
- Per top-10 chat: `GetSearchCounters` (1) + `GetCommonChats` (1) + intimate keyword searches (~8) = ~10 calls × 10 = 100 calls
- `getContacts()`: 1 call (cached, used for all chats)
- Total: ~120 API calls, ~60-90s per user

At signup, this runs in a `setTimeout` so it doesn't block the response. For recompute, the endpoint returns when done.

## Files to change

**Phase 1 — Schema + DTOs + Service:**
1. `users/schemas/user.schema.ts` — restructure
2. `users/dto/create-user.dto.ts` — restructure
3. `users/dto/update-user.dto.ts` — auto-updates
4. `users/dto/search-user.dto.ts` — update field paths
5. `users/users.service.ts` — new methods, update queries
6. `users/users.controller.ts` — new endpoints, clean up existing

**Phase 2 — Consumers:**
7. `TgSignup/tg-signup.service.ts` — update CreateUserDto construction
8. `Telegram/manager/chat-operations.ts` — no change (returns raw data, consumer maps)
9. `users/__tests__/users.service.spec.ts` — update test

**Phase 3 — Dashboard:**
10. `my-tg-local/src/types/api.ts` — update User type
11. `my-tg-local/src/components/UserProfileView.tsx` — prefix `stats.`
12. `my-tg-local/src/components/UserSelector.tsx` — prefix `stats.`
13. `my-tg-local/src/components/ChatExplorer.tsx` — update calls path

**Phase 4 — Migration script:**
14. One-time MongoDB migration to rename fields in existing documents
