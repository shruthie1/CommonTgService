/**
 * Shared fixture for the degraded-swap regression suite (degraded-swap.regression.spec.ts).
 * Design + scenario matrix: docs/design/2026-10-24-degraded-swap-fallback.md ("Scenario matrix").
 *
 * Real: ClientService, the clients and bufferClients collections on an in-memory REPLICA SET (so
 * the cutover transaction runs for real), BufferClientService query/ownership methods
 * (executeQuery, findOne, reassignClientId, setPrimaryInUse, markAsInactive).
 * Faked at the boundary: Telegram (setup registry, privacy formalities, connections), the SpamBot
 * probe, bot notices, users docs (in-memory map), HTTP (deployKey restart).
 *
 * The spec file owns the jest.mock() calls and passes the mocks in (see makeFixture).
 */
import { Connection, Model } from 'mongoose';
import { ClientService } from '../client.service';
import { ClientSchema } from '../schemas/client.schema';
import { BufferClientSchema } from '../../buffer-clients/schemas/buffer-client.schema';
import { BufferClientService } from '../../buffer-clients/buffer-client.service';

export const DAY = 24 * 60 * 60 * 1000;
export const CLIENT = 'sneha2';
export const MAIN = '919000913438';
export const SIBLING = 'sneha1';
export const SIBLING_MAIN = '919000910001';

export const limited = (days: number, extra: Record<string, unknown> = {}) => ({
  spamStatus: 'limited', limitedUntil: new Date(Date.now() + days * DAY), spamCheckedAt: new Date(), ...extra,
});
export const harsh = () => ({ spamStatus: 'harsh', limitedUntil: null, spamCheckedAt: new Date() });
export const deadReq = (reason = 'FROZEN_METHOD_INVALID', extra: Record<string, unknown> = {}) =>
  ({ days: 0, archiveOld: false, formalities: false, reason, ...extra });
export const limitedReq = (reason = 'SpamBot limited until 29 Oct') => ({ days: 3, archiveOld: true, formalities: true, reason });

export interface FixtureMocks {
  probe: jest.Mock;
  notice: jest.Mock;
  fetch: jest.Mock;
  connection: { getClient: jest.Mock; unregisterClient: jest.Mock };
}

/** In-process stand-in for TelegramManager's static setup registry + the Telegram calls CMS makes. */
export class FakeTelegram {
  setups = new Map<string, any>();
  setActiveClientSetup = jest.fn((d: any) => { this.setups.set(d.newMobile, d); });
  getActiveClientSetup = jest.fn((m?: string) => (m ? this.setups.get(m) : this.setups.values().next().value));
  getActiveClientSetupMobiles = jest.fn(() => [...this.setups.values()].flatMap((s) => [s.newMobile, s.existingMobile].filter(Boolean)));
  hasActiveClientSetup = jest.fn(() => this.setups.size > 0);
  clearActiveClientSetup = jest.fn((m: string) => { this.setups.delete(m); });
  updatePrivacyforDeletedAccount = jest.fn(async () => undefined);
  removeExternalLoginSessions = jest.fn(async () => undefined);
}

export type Fixture = Awaited<ReturnType<typeof makeFixture>>;

let modelSeq = 0;

export async function makeFixture(connection: Connection, mocks: FixtureMocks) {
  modelSeq += 1;
  const clientModel: Model<any> = connection.model(`DsClient${modelSeq}`, ClientSchema, 'clients');
  const bufferModel: Model<any> = connection.model(`DsBuffer${modelSeq}`, BufferClientSchema, 'bufferClients');
  await clientModel.collection.deleteMany({});
  await bufferModel.collection.deleteMany({});
  await connection.collection('promoteClients').deleteMany({});
  await bufferModel.syncIndexes(); // the partial unique { clientId, inUse:true } index is part of the contract

  // One users doc per mobile, or an array (several docs for one mobile, e.g. a partial expiry).
  const users = new Map<string, any>();
  const docsOf = (mobile: string): any[] => { const u = users.get(mobile); return u ? (Array.isArray(u) ? u : [u]) : []; };
  const tg = new FakeTelegram();
  const removeExternalLoginSessions = jest.fn();
  mocks.connection.getClient.mockImplementation(async () => ({ getMe: async () => ({ username: 'tguser' }), removeExternalLoginSessions }));
  mocks.connection.unregisterClient.mockResolvedValue(undefined);
  mocks.fetch.mockResolvedValue({ ok: true });
  mocks.probe.mockImplementation(async (mobile: string) => defaultProbe(await bufferModel.findOne({ mobile }).lean()));

  // Real BufferClientService methods on the real collection; writes that would fan out elsewhere
  // (createOrUpdate / update) are plain $set upserts so the test can read the result back.
  const buffer: any = Object.create(BufferClientService.prototype);
  buffer.bufferClientModel = bufferModel;
  buffer.logger = { info: jest.fn(), log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  buffer.botsService = { sendMessageByCategory: jest.fn(async () => true) };
  buffer.createOrUpdate = jest.fn(async (mobile: string, dto: Record<string, unknown>) =>
    bufferModel.findOneAndUpdate({ mobile }, { $set: { ...dto, mobile } }, { upsert: true, returnDocument: 'after' }).lean());
  buffer.update = jest.fn(async (mobile: string, dto: Record<string, unknown>) =>
    bufferModel.findOneAndUpdate({ mobile }, { $set: dto }, { returnDocument: 'after' }).lean());
  buffer.getOrEnsureDistinctUsersBackupSession = jest.fn(async (mobile: string, active: string) => {
    const user = docsOf(mobile)[0];
    if (!user) return null;
    return user.session && user.session !== active ? user : null;
  });
  for (const m of ['executeQuery', 'findOne', 'reassignClientId', 'setPrimaryInUse', 'markAsInactive']) jest.spyOn(buffer, m);

  const usersService = {
    findByMobileAnyStatus: jest.fn(async (mobile: string) => docsOf(mobile)),
    search: jest.fn(async ({ mobile }: { mobile: string }) => docsOf(mobile)),
    update: jest.fn(),
    expireAccount: jest.fn(async (mobile: string, reason: string) => {
      for (const doc of docsOf(mobile)) doc.expired = true;
      await bufferModel.updateOne({ mobile }, { $set: { status: 'inactive', inUse: false, message: reason } });
    }),
  };

  const svc: any = new ClientService(clientModel as any, tg as any, buffer, usersService as any);
  // fx.svc is reassigned by restart(); rows always go through fx.svc.
  svc.isInitialized = true;
  jest.spyOn(svc, 'performPostUpdateTasks').mockImplementation(() => undefined);

  const fx = {
    svc, clientModel, bufferModel, users, tg, buffer, usersService, mocks, connection, removeExternalLoginSessions,
    notices: () => mocks.notice.mock.calls.map(([, input]: any[]) => input),
    titles: () => mocks.notice.mock.calls.map(([, input]: any[]) => input.title as string),
    count: (title: string) => mocks.notice.mock.calls.filter(([, input]: any[]) => input.title === title).length,

    /** A buffer that passes every tier-1 rule; `extra` moves it into another tier / exclusion. */
    async addBuffer(mobile: string, extra: Record<string, unknown> = {}, user: Record<string, unknown> | null = {}) {
      await bufferModel.collection.insertOne({
        tgId: `tg-${mobile}`, mobile, session: `s-${mobile}`, clientId: CLIENT, availableDate: '2026-01-01',
        channels: 250, status: 'active', inUse: false, warmupPhase: 'session_rotated',
        createdAt: new Date(Date.now() - 40 * DAY), enrolledAt: new Date(Date.now() - 40 * DAY), ...extra,
      });
      if (user) users.set(mobile, { mobile, tgId: `tg-${mobile}`, session: `backup-${mobile}`, expired: false, twoFA: true, ...user });
    },

    /** A client doc plus (by default) its in-use main buffer row and a live users doc. */
    async addClient(
      clientId: string,
      mobile: string,
      extra: Record<string, unknown> = {},
      opts: { mainBuffer?: Record<string, unknown> | null; mainUser?: Record<string, unknown> | null } = {},
    ) {
      await clientModel.collection.insertOne({
        clientId, mobile, session: `main-${mobile}`, username: `u_${clientId}`, name: clientId, dbcoll: 'sneha',
        repl: 'http://repl', promoteRepl: 'http://prepl', channelLink: 'x', link: 'x', password: 'p', product: 'p',
        qrId: 'q', gpayId: 'g', deployKey: '', ...extra,
      });
      if (opts.mainBuffer !== null) {
        await fx.addBuffer(mobile, { clientId, inUse: true, session: `main-${mobile}`, ...(opts.mainBuffer || {}) }, opts.mainUser === null ? null : (opts.mainUser || {}));
      } else if (opts.mainUser !== null) {
        users.set(mobile, { mobile, tgId: `tg-${mobile}`, session: `backup-${mobile}`, expired: false, twoFA: true, ...(opts.mainUser || {}) });
      }
      svc.clientsMap.clear();
    },

    /** The default world: CLIENT (sneha2) on MAIN, persona dbcoll 'sneha'. */
    async world(extra: Record<string, unknown> = {}, opts: Parameters<typeof fx.addClient>[3] = {}) {
      await fx.addClient(CLIENT, MAIN, extra, opts);
    },

    async client(clientId = CLIENT) {
      return clientModel.findOne({ clientId }).lean<any>();
    },
    async buf(mobile: string) {
      return bufferModel.findOne({ mobile }).lean<any>();
    },
    /** A CMS restart: a fresh ClientService (empty in-memory maps) on the same collections and fakes. */
    restart() {
      const next: any = new ClientService(clientModel as any, tg as any, buffer, usersService as any);
      next.isInitialized = true;
      jest.spyOn(next, 'performPostUpdateTasks').mockImplementation(() => undefined);
      fx.svc = next;
      return next;
    },
    /** Simulate another process / a human writing clients.<id> directly (and the cache noticing). */
    async writeClient(clientId: string, set: Record<string, unknown>) {
      await clientModel.updateOne({ clientId }, { $set: set });
      svc.clientsMap.clear();
    },
  };
  return fx;
}

/**
 * A fake clock on the whole Date object (Date.now AND new Date()), via jest modern fake timers with
 * every timer API left real (Mongo driver, setTimeout in probes). Time stands still until advance().
 */
export function fakeClock() {
  const t0 = Date.now();
  let offset = 0;
  jest.useFakeTimers({
    now: t0,
    doNotFake: [
      'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame',
      'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval',
      'setTimeout', 'clearTimeout',
    ],
  });
  return {
    advance(ms: number) { offset += ms; jest.setSystemTime(t0 + offset); },
    get offset() { return offset; },
    restore() { jest.useRealTimers(); },
  };
}

/** SpamBot answer that matches what the buffer row already says (limited -> limited, harsh -> harsh, else free). */
export function defaultProbe(doc: any) {
  if (doc?.spamStatus === 'limited' && doc.limitedUntil) return { status: 'limited', limitedUntil: new Date(doc.limitedUntil) };
  if (doc?.spamStatus === 'harsh') return { status: 'harsh', limitedUntil: null };
  return { status: 'free', limitedUntil: null };
}

export const probeAs = (status: 'free' | 'limited' | 'harsh', days = 5) =>
  ({ status, limitedUntil: status === 'limited' ? new Date(Date.now() + days * DAY) : null });
