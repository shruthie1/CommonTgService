# CMS event-manager → CRUD-only (clientId schema) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip the execution loop from CommonTgService's `event-manager` module so it becomes a pure CRUD/data layer over the `events` collection, and migrate its schema/DTOs/ladder builder from `profile` to `clientId`.

**Architecture:** `event-manager.service.ts` currently both stores events AND runs a `setInterval` execution loop that HTTP-calls `profile.repl`. Remove the loop entirely (execution moves to tg-platform `@tg/events`). Keep only CRUD + the ladder builder. Rename the `profile` field to `clientId` in schema, DTOs, and ladder.

**Tech Stack:** NestJS, Mongoose, Jest, TypeScript. Repo: `Projects/local/CommonTgService` (published as the `common-tg-service` npm package consumed by ums-nst).

## Global Constraints

- Work directly on **main/master** of this `Projects/local/*` repo — no feature branches.
- Schema field is **`clientId`** (string), never `profile`/`dbcoll`.
- Collection stays **`events`**.
- Keep class names `EventManagerModule`/`EventManagerService`/`EventManagerController` (ums-nst imports them from the package).
- Test runner: `npx jest <path>`.
- After loop removal: `EventManagerService` no longer implements `OnModuleInit`/`OnModuleDestroy`, has no `setInterval`, and does not import `fetchWithTimeout`, `sleep`, or `ClientService`.
- `getEventById` keeps its existing Mongoose id-lookup (single-tenant side-project; the abl-platform tenant-isolation rule does not apply here).

---

### Task 1: Migrate the Mongoose schema `profile` → `clientId`

**Files:** Modify `src/components/event-manager/schemas/event.schema.ts`

**Interfaces produced:** `Event` class with `clientId: string` (required), `chatId`, `time`, `type`, `payload`, `attempts` (default 0); `EventDocument`; `EventSchema`.

- [ ] Step 1: In the `Event` class, replace the `profile` prop with:
```ts
  @Prop({ required: true })
  clientId: string;
```
and update the `attempts` comment to note execution now lives in `@tg/events`.
- [ ] Step 2: Typecheck — `cd /Users/SaiKumar.Shetty/Documents/Projects/local/CommonTgService && npx tsc --noEmit` → expect errors ONLY in `event-manager.service.ts`/`controller` (fixed later), none in the schema file.
- [ ] Step 3: Commit — `git add src/components/event-manager/schemas/event.schema.ts && git commit -m "refactor(event-manager): schema field profile -> clientId"`

---

### Task 2: Migrate the DTOs `profile` → `clientId`

**Files:** Modify `dto/create-event.dto.ts`, `dto/schedule-events.dto.ts`

**Interfaces produced:** `CreateEventDto { chatId; time; type; clientId; payload? }`, `ScheduleEventsDto { chatId; clientId; type? }`.

- [ ] Step 1: In `create-event.dto.ts` replace the `profile` property with `@ApiProperty({}) clientId: string;`.
- [ ] Step 2: In `schedule-events.dto.ts` replace the `profile` property with `@ApiProperty({}) clientId: string;`.
- [ ] Step 3: Commit — `git add src/components/event-manager/dto/ && git commit -m "refactor(event-manager): DTO field profile -> clientId"`

---

### Task 3: Rewrite the service as CRUD-only with clientId

**Files:** Modify `src/components/event-manager/event-manager.service.ts` (full rewrite)

**Interfaces produced:** `EventManagerService` — `create`, `createMultiple`, `deleteMultiple`, `getEvents`, `getEventById`, `schedulePaidEvents(chatId, clientId, type?)`. No lifecycle hooks, no `ClientService`, no `fetchWithTimeout`/`sleep`, no `setInterval`.

- [ ] Step 1: Replace the entire file. Key changes vs current:
  - Imports: drop `OnModuleInit, OnModuleDestroy, forwardRef, Inject`, drop `ClientService`, drop `fetchWithTimeout, sleep` (keep `Logger`).
  - Constructor: only `@InjectModel(Event.name) eventModel`.
  - Remove `onModuleInit`, `onModuleDestroy`, `startEventExecution`, `intervalId`, `isProcessing`.
  - `create`/`createMultiple`: validate/log on `clientId` instead of `profile`.
  - `schedulePaidEvents(chatId, clientId, type='1')`: dup-check `getEvents({ chatId, clientId })`; build the SAME type '1'/'2'/else ladder arrays that are ALREADY in this file (the pre-edit `event-manager.service.ts` lines ~99-165 — recover from `git show HEAD:src/components/event-manager/event-manager.service.ts` if needed). Apply a mechanical rename in every event object and every message template: `profile` key → `clientId`, and `${profile}` in the `ZomCall.netlify.app/${profile}/${chatId}` URLs → `${clientId}`. Do NOT change offsets or message text. All three branches ('1', '2', else). Return `{ message: \`scheduled events for ${clientId} | Chatid: ${chatId}\` }`.
  - `getEventById(id)`: keep the existing `this.eventModel` id lookup + `.lean()` unchanged.
- [ ] Step 2: Typecheck — `npx tsc --noEmit` (will still error on controller line 36 until Task 4 — expected).
- [ ] Step 3: Commit — `git add src/components/event-manager/event-manager.service.ts && git commit -m "refactor(event-manager): remove execution loop, CRUD-only, clientId"`

---

### Task 4: Update the controller to pass clientId

**Files:** Modify `src/components/event-manager/event-manager.controller.ts:36`

- [ ] Step 1: Change `this.eventManagerService.schedulePaidEvents(dto.chatId, dto.profile, dto.type)` → `...(dto.chatId, dto.clientId, dto.type)`.
- [ ] Step 2: Full typecheck — `npx tsc --noEmit` → PASS.
- [ ] Step 3: Commit — `git add src/components/event-manager/event-manager.controller.ts && git commit -m "refactor(event-manager): controller passes clientId"`

---

### Task 5: Drop ClientModule wiring from the module

**Files:** Modify `src/components/event-manager/event-manager.module.ts`

**Interfaces produced:** `EventManagerModule` importing only `MongooseModule.forFeature([{ name: Event.name, schema: EventSchema }])`, providing/exporting `EventManagerService`. No `ClientModule`/`forwardRef`.

- [ ] Step 1: Remove the `ClientModule` import and `forwardRef(() => ClientModule)` from `imports`.
- [ ] Step 2: Typecheck — `npx tsc --noEmit` → PASS.
- [ ] Step 3: Commit — `git add src/components/event-manager/event-manager.module.ts && git commit -m "refactor(event-manager): drop ClientModule dependency"`

---

### Task 6: Update unit tests to clientId + no-loop

**Files:** Modify `src/components/event-manager/__tests__/event-manager.service.spec.ts` and `event-manager.controller.spec.ts`

- [ ] Step 1: Read both specs to learn the mocking style: `sed -n '1,60p' src/components/event-manager/__tests__/event-manager.service.spec.ts`.
- [ ] Step 2: In the service spec: remove any `ClientService` provider; provide a mocked model via `getModelToken(Event.name)`; assert `schedulePaidEvents('chat1','kavya1','1')` calls `insertMany` once with every inserted event having `clientId === 'kavya1'` and NO `profile` key; assert dup-check returns the "already exists" message and skips insert; assert `deleteMultiple` calls `deleteMany({ chatId })`. Remove any test referencing `startEventExecution`/`setInterval`/`fetchWithTimeout`.
- [ ] Step 3: Run — `npx jest src/components/event-manager/__tests__/event-manager.service.spec.ts` → PASS.
- [ ] Step 4: Fix + run the controller spec (update `profile`→`clientId`, drop ClientService) — `npx jest src/components/event-manager/__tests__/event-manager.controller.spec.ts` → PASS.
- [ ] Step 5: Commit — `git add src/components/event-manager/__tests__/ && git commit -m "test(event-manager): clientId CRUD-only, drop loop tests"`

---

### Task 7: Full verify + package export + publish note

- [ ] Step 1: `npx tsc --noEmit && npx jest src/components/event-manager` → both PASS.
- [ ] Step 2: Ensure the package entrypoint exports the module: `grep -rn "event-manager" src/index.ts src/components/index.ts 2>/dev/null`. The built `common-tg-service` already re-exports `event-manager` via `components/index`; confirm it still does after changes.
- [ ] Step 3: Publish reminder — bump version and publish `common-tg-service` (or point ums-nst at the local build) so the ums-nst plan can import the updated CRUD-only `EventManagerModule`. Record the published version in the ums-nst plan Global Constraints.

---

## Cutover notes (cross-plan)

- This plan REMOVES CMS's execution loop → nothing executes until tg-platform `@tg/events` ships. Deploy the tg-platform executor first/simultaneously (see master sequencing in the tg-platform plan).
- Clear the `events` collection at cutover so stale `profile`-keyed docs don't linger (clientId queries ignore them anyway).
