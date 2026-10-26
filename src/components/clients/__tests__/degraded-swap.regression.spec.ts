/**
 * Degraded-swap regression suite. One row per scenario; IDs (DS-nn) match the "Scenario matrix"
 * table in docs/design/2026-10-24-degraded-swap-fallback.md. To add a scenario: add a row here
 * (id, name, setup, run, expect) and the same id + name to the doc table.
 *
 * Fixture (real ClientService + replica-set Mongo, Telegram/SpamBot/notices faked): ./degraded-swap.fixtures.ts
 */
jest.mock('../../../utils/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn() }));
jest.mock('../../../utils/bot-notice', () => ({ sendBotNotice: jest.fn(() => Promise.resolve({ sent: true })) }));
jest.mock('../../Telegram/utils/connection-manager', () => ({
  connectionManager: { getClient: jest.fn(), unregisterClient: jest.fn(), hasClient: jest.fn(() => false), getClientState: jest.fn() },
}));
jest.mock('telegram/Helpers', () => ({ ...jest.requireActual('telegram/Helpers'), sleep: jest.fn(() => Promise.resolve()) }));
const mockProbe = jest.fn();
jest.mock('../../Telegram/utils/spambot-probe', () => ({
  ...jest.requireActual('../../Telegram/utils/spambot-probe'),
  probeSpamBot: (...a: any[]) => mockProbe(...a),
}));

import * as fs from 'fs';
import * as path from 'path';
import { ConflictException, ValidationPipe } from '@nestjs/common';
import { SetupClientQueryDto } from '../dto/setup-client.dto';
import { fetchWithTimeout } from '../../../utils/fetchWithTimeout';
import { sendBotNotice } from '../../../utils/bot-notice';
import { connectionManager } from '../../Telegram/utils/connection-manager';
import { ClientHelperUtils } from '../../shared/client-helper.utils';
import { startMongo, stopMongo, MongoTestContext } from '../../__tests__/api-test-helpers';
import { ClientService } from '../client.service';
import {
  DEAD_MAIN_HANDOFF_WAIT_MS, isDeadSwapReason, MAIN_SPAM_STATUS_FRESH_MS, parseDegradedSwapTiers, passRetryDelayMs, PASS_MAX_ATTEMPTS,
  POOL_REFILL_MAX_PER_RUN, RESCUE_MAX_PER_RUN, swapPoolFingerprint, SWAP_LEASE_RENEW_MS, SWAP_LEASE_TTL_MS, SWAP_REPORT_GRACE_MS, UPGRADE_MAX_PER_RUN,
} from '../degraded-swap';
import {
  CLIENT, DAY, MAIN, SIBLING, SIBLING_MAIN, FakeTelegram, Fixture, deadReq, defaultProbe, fakeClock, harsh, limited, limitedReq, makeFixture, probeAs,
} from './degraded-swap.fixtures';

type Out = any;
interface Row {
  id: string;
  name: string;
  setup?: (fx: Fixture) => Promise<void> | void;
  run: (fx: Fixture) => Promise<Out>;
  expect: (out: Out, fx: Fixture) => Promise<void> | void;
  env?: Record<string, string>;
}

const T3 = '919000915704';
const T1 = '919000911111';
const setup = (fx: Fixture, req: any = deadReq()) => fx.svc.setupClient(CLIENT, req);
const maintain = (fx: Fixture) => fx.svc.runSwapMaintenance();
const sibling = async (fx: Fixture, spares: string[], extra: (m: string) => Record<string, unknown> = () => ({}), user: (m: string) => Record<string, unknown> = () => ({})) => {
  await fx.addClient(SIBLING, SIBLING_MAIN, { dbcoll: 'Sneha' });
  for (const m of spares) await fx.addBuffer(m, { clientId: SIBLING, ...extra(m) }, user(m));
};
const swappedTo = (mobile: string, marker: number | null) => async (out: Out, fx: Fixture) => {
  expect(out).toMatchObject({ status: 'swapped', swapped: true, newMobile: mobile });
  const client = await fx.client();
  expect(client.mobile).toBe(mobile);
  if (marker === null) {
    expect(out.degradedTier).toBeUndefined();
    expect(client.degraded).toBeUndefined();
  } else {
    expect(out.degradedTier).toBe(marker);
    expect(client.degraded).toMatchObject({ tier: marker });
  }
  expect((await fx.buf(mobile)).inUse).toBe(true);
};
const noSwap = (probes?: number) => async (out: Out, fx: Fixture) => {
  expect(out.swapped).toBe(false);
  expect((await fx.client()).mobile).toBe(MAIN);
  if (probes !== undefined) expect(mockProbe).toHaveBeenCalledTimes(probes);
};
/** Dead main, nothing anywhere: run the job (9 h apart, past any gap) until the rescue episode stops. */
const driveToStop = async (fx: Fixture, clock: ReturnType<typeof fakeClock>) => {
  const seen: Array<{ status: string; attempts?: number }> = [];
  for (let i = 0; i < 12; i++) {
    const row = (await maintain(fx)).rescue[0];
    seen.push({ status: row.status, attempts: row.attempts });
    if (row.status === 'stopped') break;
    clock.advance(9 * 60 * 60_000);
  }
  return seen;
};
/** clients.deadMain as tg-aut's dead /setupClient writes it (default: an hour ago, past the 35-min handoff wait). */
const deadMain = (mobile = MAIN, reason = 'FROZEN_METHOD_INVALID', agoMs = 60 * 60_000) => ({ mobile, reason, at: new Date(Date.now() - agoMs) });
/** The main's users docs + pool row after expireAccount (what the reporting dead setupClient leaves on no_candidate). */
const RETIRED = { mainUser: { expired: true }, mainBuffer: { status: 'inactive', inUse: false, message: '[DEAD] FROZEN_METHOD_INVALID' } };
/** Dead main (live-session evidence) already retired, nothing anywhere. */
const deadWorld = (fx: Fixture) => fx.world({ deadMain: deadMain() }, RETIRED);
const T2 = '919000912222';
/** P1/P2 world: a dead main reported 40 min ago (rescue is due), T1 and T2 free tier-1 buffers. */
const lateWorld = async (fx: Fixture) => {
  await fx.world({ deadMain: deadMain(MAIN, 'FROZEN_METHOD_INVALID', 40 * 60_000) }, RETIRED);
  await fx.addBuffer(T1);
  await fx.addBuffer(T2, { availableDate: '2026-01-02' });
};
const STOP_TEXT = `${CLIENT} stuck on dead main, rescue stopped after 6 tries, will retry when the pool changes`;
const degradedState = (tier: number, extra: Record<string, unknown> = {}) =>
  ({ tier, since: new Date(Date.now() - DAY), reason: 'FROZEN_METHOD_INVALID', fromMobile: '919000900000', limitedUntil: null, ...extra });

const DEAD_CODES = ['FROZEN_METHOD_INVALID', 'FROZEN_PARTICIPANT_MISSING', 'USER_DEACTIVATED', 'USER_DEACTIVATED_BAN',
  'SESSION_REVOKED', 'AUTH_KEY_UNREGISTERED', 'AUTH_KEY_DUPLICATED', 'PHONE_NUMBER_BANNED'];
const NOT_DEAD: Array<[string, string]> = [
  ['DS-11', 'SpamBot limited until 29 Oct'], ['DS-12', 'SpamBot harsh limit (indefinite)'], ['DS-13', 'PEER_FLOOD'],
  ['DS-14', 'FLOOD_WAIT_120'], ['DS-15', 'ECONNRESET network error'], ['DS-16', 'Request timed out'],
  ['DS-17', 'INPUT_USER_DEACTIVATED'], ['DS-18', 'INPUT_USER_DEACTIVATED: USER_DEACTIVATED'],
  ['DS-19', 'Promotion health check failed: failStreak=9'], ['DS-20', 'unknown'], ['DS-21', 'SESSION_EXPIRED'],
];

const rows: Row[] = [
  // ── 1. Triggers ──────────────────────────────────────────────────────────────────────────────
  ...DEAD_CODES.map((code, i): Row => ({
    id: `DS-0${i + 1}`,
    name: `dead reason ${code} -> degraded tiers allowed (tier-3 swap)`,
    setup: async (fx) => { await fx.world(); await fx.addBuffer(T3, limited(5)); },
    run: (fx) => setup(fx, deadReq(`RPCError: ${code} (401)`)),
    expect: swappedTo(T3, 3),
  })),
  { id: 'DS-09', name: 'isDeadSwapReason: every dead code, case-insensitive, token match', run: async () => null,
    expect: () => {
      for (const code of DEAD_CODES) expect([isDeadSwapReason(code), isDeadSwapReason(code.toLowerCase())]).toEqual([true, true]);
      expect(isDeadSwapReason('XFROZEN_METHOD_INVALID')).toBe(false);
    } },
  { id: 'DS-10', name: 'DEAD_MAIN_RESCUE is dead (rescue pass); DEGRADED_UPGRADE / POOL_REFILL are not', run: async () => null,
    expect: () => {
      expect(isDeadSwapReason('DEAD_MAIN_RESCUE: users expired')).toBe(true);
      expect(isDeadSwapReason('DEGRADED_UPGRADE')).toBe(false);
      expect(isDeadSwapReason('POOL_REFILL')).toBe(false);
    } },
  ...NOT_DEAD.map(([id, reason]): Row => ({
    id,
    name: `not dead: "${reason}" -> never degraded (no probe, no swap)`,
    setup: async (fx) => { await fx.world(); await fx.addBuffer(T3, limited(5)); await fx.addBuffer('919000960001', harsh()); },
    run: (fx) => setup(fx, deadReq(reason)),
    expect: async (out, fx) => { await noSwap(0)(out, fx); expect(out.status).toBe('no_candidate'); expect(out.degradedTier).toBeUndefined(); },
  })),
  { id: 'DS-22', name: 'pinned ?mobile= never falls back to degraded tiers',
    setup: async (fx) => { await fx.world(); await fx.addBuffer(T3, limited(5)); },
    run: (fx) => setup(fx, deadReq('FROZEN_METHOD_INVALID', { mobile: T3 })),
    expect: noSwap(0) },

  // ── 2. Tier selection ─────────────────────────────────────────────────────────────────────────
  { id: 'DS-23', name: 'tier 1 available -> tier 1 used, no marker, degraded tiers not scanned',
    setup: async (fx) => { await fx.world(); await fx.addBuffer(T1); await fx.addBuffer(T3, limited(5)); },
    run: (fx) => setup(fx), expect: swappedTo(T1, null) },
  { id: 'DS-24', name: 'sibling with 3 usable spares lends one (keeps 2); clientId reassigned; NO marker (meets tier-1 rules)',
    setup: async (fx) => { await fx.world(); await sibling(fx, ['919000920001', '919000920002', '919000920003']); await fx.addBuffer(T3, limited(5)); },
    run: (fx) => setup(fx),
    expect: async (out, fx) => {
      await swappedTo('919000920001', null)(out, fx);
      expect((await fx.buf('919000920001')).clientId).toBe(CLIENT);
      expect(fx.count('Buffer borrowed')).toBe(1);
      expect(fx.count('Degraded swap')).toBe(0);
    } },
  ...[2, 1, 0].map((n, i): Row => ({
    id: `DS-2${5 + i}`,
    name: `sibling with ${n} usable spare(s) never lends -> tier 3`,
    setup: async (fx) => { await fx.world(); await sibling(fx, ['919000920001', '919000920002'].slice(0, n)); await fx.addBuffer(T3, limited(5)); },
    run: (fx) => setup(fx), expect: swappedTo(T3, 3),
  })),
  ...([
    ['DS-28', 'expired users doc', () => ({ expired: true })],
    ['DS-29', 'no 2FA', () => ({ twoFA: false })],
    ['DS-30', 'no distinct backup session', (m: string) => ({ session: `s-${m}` })],
  ] as Array<[string, string, (m: string) => Record<string, unknown>]>).map(([id, label, user]): Row => ({
    id,
    name: `sibling spare with ${label} is not counted (3 rows, 2 usable) -> no lend, tier 3`,
    setup: async (fx) => {
      await fx.world();
      await sibling(fx, ['919000920001', '919000920002', '919000920003'], () => ({}), (m) => (m.endsWith('3') ? user(m) : {}));
      await fx.addBuffer(T3, limited(5));
    },
    run: (fx) => setup(fx), expect: swappedTo(T3, 3),
  })),
  { id: 'DS-31', name: 'another persona (different dbcoll) never lends',
    setup: async (fx) => {
      await fx.world(); await fx.addClient('kavya1', '919000930001', { dbcoll: 'kavya' });
      for (const m of ['919000940001', '919000940002', '919000940003', '919000940004']) await fx.addBuffer(m, { clientId: 'kavya1' });
    },
    run: (fx) => setup(fx), expect: async (out, fx) => { await noSwap(0)(out, fx); expect(out.status).toBe('no_candidate'); } },
  { id: 'DS-32', name: 'tier 3 order: limitedUntil asc, channels desc, createdAt asc',
    setup: async (fx) => {
      await fx.world();
      const until = new Date(Date.now() + 3 * DAY);
      await fx.addBuffer('919000950009', limited(9));
      await fx.addBuffer('919000950031', { ...limited(3), limitedUntil: until, channels: 210, createdAt: new Date(Date.now() - 60 * DAY) });
      await fx.addBuffer('919000950032', { ...limited(3), limitedUntil: until, channels: 400, createdAt: new Date(Date.now() - 20 * DAY) });
      await fx.addBuffer('919000950033', { ...limited(3), limitedUntil: until, channels: 400, createdAt: new Date(Date.now() - 50 * DAY) });
    },
    run: (fx) => setup(fx), expect: swappedTo('919000950033', 3) },
  { id: 'DS-33', name: 'tier 4 only when tier 3 is empty; harsh accepted there, critical notice',
    setup: async (fx) => { await fx.world(); await fx.addBuffer('919000960001', harsh()); },
    run: (fx) => setup(fx),
    expect: async (out, fx) => {
      await swappedTo('919000960001', 4)(out, fx);
      expect(fx.notices().find((n: any) => n.title === 'Degraded swap').severity).toBe('critical');
    } },
  { id: 'DS-34', name: 'tier 3 beats tier 4', setup: async (fx) => { await fx.world(); await fx.addBuffer('919000960001', harsh()); await fx.addBuffer(T3, limited(5)); },
    run: (fx) => setup(fx), expect: swappedTo(T3, 3) },
  { id: 'DS-35', name: 'DEGRADED_SWAP_TIERS=none -> old behaviour (no_candidate)', env: { DEGRADED_SWAP_TIERS: 'none' },
    setup: async (fx) => { await fx.world(); await fx.addBuffer(T3, limited(5)); },
    run: (fx) => setup(fx), expect: noSwap(0) },
  { id: 'DS-36', name: 'DEGRADED_SWAP_TIERS=3 -> sibling never consulted, tier 3 used', env: { DEGRADED_SWAP_TIERS: '3' },
    setup: async (fx) => { await fx.world(); await sibling(fx, ['919000920001', '919000920002', '919000920003']); await fx.addBuffer(T3, limited(5)); },
    run: (fx) => setup(fx), expect: swappedTo(T3, 3) },
  { id: 'DS-37', name: 'DEGRADED_SWAP_TIERS=2,4 -> tier-3 buffer ignored, tier 4 used', env: { DEGRADED_SWAP_TIERS: '2,4' },
    setup: async (fx) => { await fx.world(); await fx.addBuffer(T3, limited(5)); await fx.addBuffer('919000960001', harsh()); },
    run: (fx) => setup(fx), expect: swappedTo('919000960001', 4) },
  { id: 'DS-38', name: 'DEGRADED_SWAP_TIERS garbage ("2;3") fails closed', env: { DEGRADED_SWAP_TIERS: '2;3' },
    setup: async (fx) => { await fx.world(); await fx.addBuffer(T3, limited(5)); },
    run: (fx) => setup(fx),
    expect: async (out, fx) => { await noSwap(0)(out, fx); expect(parseDegradedSwapTiers('2;3')).toEqual([]); expect(parseDegradedSwapTiers('')).toEqual([2, 3, 4]); } },
  ...([
    ['DS-39', 'warming: enrolled', { warmupPhase: 'enrolled' }],
    ['DS-40', 'warming: settling', { warmupPhase: 'settling' }],
    ['DS-41', 'warming: identity', { warmupPhase: 'identity' }],
    ['DS-42', 'warming: growing', { warmupPhase: 'growing' }],
    ['DS-43', 'warming: maturing', { warmupPhase: 'maturing' }],
    ['DS-44', 'ready but not session_rotated', { warmupPhase: 'ready' }],
    ['DS-45', 'channels < 200', { channels: 199 }],
    ['DS-46', 'status inactive', { status: 'inactive' }],
    ['DS-47', 'inUse', { inUse: true, clientId: 'other9' }],
    ['DS-48', 'users doc expired', {}, { expired: true }],
    ['DS-49', 'users doc without 2FA', {}, { twoFA: false }],
    ['DS-50', 'other dbcoll pool (other clientId)', { clientId: 'kavya1' }],
  ] as Array<[string, string, Record<string, unknown>, Record<string, unknown>?]>).map(([id, label, extra, user]): Row => ({
    id,
    name: `exclusion: ${label} -> never swapped in (any tier)`,
    setup: async (fx) => {
      await fx.world();
      await fx.addBuffer('919000970001', { ...limited(3), ...extra }, user || {});
      await fx.addBuffer('919000970002', { ...harsh(), ...extra, ...(extra.inUse ? { clientId: 'other8' } : {}) }, user || {});
    },
    run: (fx) => setup(fx), expect: noSwap(0),
  })),
  { id: 'DS-51', name: 'exclusion: promote pool rows are never consulted',
    setup: async (fx) => {
      await fx.world();
      await fx.connection.collection('promoteClients').insertOne({ mobile: '919000980001', clientId: CLIENT, status: 'active', warmupPhase: 'session_rotated', channels: 400, ...limited(2) });
    },
    run: (fx) => setup(fx), expect: noSwap(0) },
  { id: 'DS-52', name: 'exclusion: a mobile in another client\'s active setup (D3)',
    setup: async (fx) => { await fx.world(); await fx.addBuffer(T3, limited(5)); fx.tg.setups.set(T3, { clientId: SIBLING, newMobile: T3, existingMobile: SIBLING_MAIN }); },
    run: (fx) => setup(fx), expect: noSwap(0) },
  { id: 'DS-53', name: 'exclusion: another client\'s current main (D3)',
    setup: async (fx) => { await fx.world(); await fx.addBuffer(T3, limited(5)); await fx.addClient(SIBLING, T3, {}, { mainBuffer: null, mainUser: null }); },
    run: (fx) => setup(fx), expect: noSwap(0) },
  { id: 'DS-54', name: 'exclusion: the dead main itself',
    setup: async (fx) => { await fx.world({}, { mainBuffer: { inUse: false, ...limited(3) } }); },
    run: (fx) => setup(fx), expect: noSwap(0) },

  // ── 3. Probe outcomes ─────────────────────────────────────────────────────────────────────────
  { id: 'DS-55', name: 'T3 probe limited -> accepted, marker 3 with the PROBED limitedUntil',
    setup: async (fx) => { await fx.world(); await fx.addBuffer(T3, limited(5)); mockProbe.mockResolvedValueOnce(probeAs('limited', 7)); },
    run: (fx) => setup(fx),
    expect: async (out, fx) => {
      await swappedTo(T3, 3)(out, fx);
      const until = new Date((await fx.client()).degraded.limitedUntil).getTime();
      expect(Math.abs(until - (Date.now() + 7 * DAY))).toBeLessThan(60_000);
    } },
  { id: 'DS-56', name: 'T3 probe harsh -> rejected, next candidate', setup: async (fx) => {
    await fx.world(); await fx.addBuffer('919000950001', limited(2)); await fx.addBuffer('919000950002', limited(4));
    mockProbe.mockResolvedValueOnce(probeAs('harsh'));
  }, run: (fx) => setup(fx), expect: swappedTo('919000950002', 3) },
  { id: 'DS-57', name: 'T3 probe free -> accepted with NO marker (D2)',
    setup: async (fx) => { await fx.world(); await fx.addBuffer(T3, limited(5)); mockProbe.mockResolvedValueOnce(probeAs('free')); },
    run: (fx) => setup(fx), expect: swappedTo(T3, null) },
  { id: 'DS-58', name: 'T4 probe limited -> marker 3, not 4 (D2)',
    setup: async (fx) => { await fx.world(); await fx.addBuffer('919000960001', harsh()); mockProbe.mockResolvedValueOnce(probeAs('limited', 2)); },
    run: (fx) => setup(fx), expect: swappedTo('919000960001', 3) },
  { id: 'DS-59', name: 'T4 probe free -> no marker (D2)',
    setup: async (fx) => { await fx.world(); await fx.addBuffer('919000960001', harsh()); mockProbe.mockResolvedValueOnce(probeAs('free')); },
    run: (fx) => setup(fx), expect: swappedTo('919000960001', null) },
  ...([
    ['DS-60', 'unrecognised reply mentioning a frozen account', { status: 'unknown', limitedUntil: null, replyText: 'Your account was frozen for violating the Terms' }],
    ['DS-61', 'connect failure (dead session)', { status: 'unknown', limitedUntil: null, connectFailed: true, error: 'AUTH_KEY_UNREGISTERED' }],
    ['DS-62', 'send failure FROZEN_METHOD_INVALID', { status: 'unknown', limitedUntil: null, sendFailed: true, error: 'FROZEN_METHOD_INVALID' }],
  ] as Array<[string, string, any]>).map(([id, label, first]): Row => ({
    id,
    name: `probe ${label} -> rejected, falls through to the next candidate`,
    setup: async (fx) => { await fx.world(); await fx.addBuffer('919000950001', limited(2)); await fx.addBuffer('919000950002', limited(4)); mockProbe.mockResolvedValueOnce(first); },
    run: (fx) => setup(fx), expect: swappedTo('919000950002', 3),
  })),
  { id: 'DS-63', name: 'T2 sibling spare probed limited -> rejected, next sibling spare',
    setup: async (fx) => {
      await fx.world(); await sibling(fx, ['919000920001', '919000920002', '919000920003', '919000920004']);
      mockProbe.mockResolvedValueOnce(probeAs('limited', 2));
    },
    run: (fx) => setup(fx), expect: swappedTo('919000920002', null) },
  { id: 'DS-64', name: 'degraded probe budget exhausted -> no_candidate + moreCandidatesPending',
    setup: async (fx) => {
      await fx.world();
      for (const m of ['919000950001', '919000950002', '919000950003', '919000950004']) await fx.addBuffer(m, limited(2));
      mockProbe.mockResolvedValue(probeAs('harsh'));
    },
    run: (fx) => setup(fx), expect: async (out, fx) => { await noSwap(3)(out, fx); expect(out).toMatchObject({ status: 'no_candidate', moreCandidatesPending: true }); } },
  { id: 'DS-65', name: 'all candidates rejected for an already-degraded client -> no_candidate + degraded:true',
    setup: async (fx) => {
      await fx.world({ degraded: degradedState(3) }); await fx.addBuffer(T3, limited(5));
      mockProbe.mockResolvedValue({ status: 'unknown', limitedUntil: null, connectFailed: true, error: 'AUTH_KEY_UNREGISTERED' });
    },
    run: (fx) => setup(fx), expect: async (out, fx) => { await noSwap(1)(out, fx); expect(out).toMatchObject({ status: 'no_candidate', degraded: true }); } },
  { id: 'DS-66', name: 'tier-1 probes pending -> degraded tiers wait for the retry',
    setup: async (fx) => {
      await fx.world();
      for (const m of ['919000911111', '919000911112', '919000911113', '919000911114']) await fx.addBuffer(m);
      await fx.addBuffer(T3, limited(5));
      mockProbe.mockResolvedValue(probeAs('limited', 1));
    },
    run: (fx) => setup(fx), expect: async (out, fx) => { await noSwap(3)(out, fx); expect(out.moreCandidatesPending).toBe(true); } },

  // ── 4. Marker ─────────────────────────────────────────────────────────────────────────────────
  { id: 'DS-67', name: 'degraded cutover stamps the full marker through the real transaction',
    setup: async (fx) => { await fx.world(); await fx.addBuffer(T3, limited(5)); },
    run: (fx) => setup(fx),
    expect: async (_out, fx) => {
      expect((await fx.client()).degraded).toMatchObject({ tier: 3, reason: 'FROZEN_METHOD_INVALID', fromMobile: MAIN, since: expect.any(Date), limitedUntil: expect.any(Date) });
    } },
  { id: 'DS-68', name: 'a tier-1 swap clears an existing marker ("Degraded cleared")',
    setup: async (fx) => { await fx.world({ degraded: degradedState(3) }); await fx.addBuffer(T1); },
    run: (fx) => setup(fx),
    expect: async (out, fx) => { await swappedTo(T1, null)(out, fx); expect(fx.count('Degraded cleared')).toBe(1); } },
  { id: 'DS-69', name: 'manual update() that changes mobile clears the marker (D5)',
    setup: async (fx) => { await fx.world({ degraded: degradedState(3) }); },
    run: (fx) => fx.svc.update(CLIENT, { mobile: '919000999999' }),
    expect: async (_out, fx) => { const c = await fx.client(); expect(c.mobile).toBe('919000999999'); expect(c.degraded).toBeUndefined(); } },
  { id: 'DS-70', name: 'manual update() that keeps the mobile keeps the marker',
    setup: async (fx) => { await fx.world({ degraded: degradedState(3) }); },
    run: (fx) => fx.svc.update(CLIENT, { mobile: MAIN, name: 'Renamed' }),
    expect: async (_out, fx) => { expect((await fx.client()).degraded).toMatchObject({ tier: 3 }); } },
  { id: 'DS-71', name: 'masked endpoints (maskedCls, maskedCls/:id, /maskedCls, portalData.client) never leak the marker; shape identical to pre-change',
    setup: async (fx) => { await fx.world({ degraded: degradedState(3, { fromMobile: MAIN }) }); },
    run: async (fx) => ({
      all: await fx.svc.findAllMasked(), one: await fx.svc.findOneMasked(CLIENT), obj: await fx.svc.findAllMaskedObject(),
    }),
    expect: async (out, fx) => {
      const raw = { ...(await fx.client()) };
      delete raw._id; delete raw.updatedAt;
      const { session, mobile, password, degraded, ...preChangeShape } = raw; // what the old code returned for a client without the field
      void session; void mobile; void password; void degraded;
      expect(out.all[0]).toEqual(expect.objectContaining(preChangeShape));
      expect(Object.keys(out.all[0]).sort()).toEqual(Object.keys(preChangeShape).filter((k) => k in out.all[0]).sort());
      for (const v of [out.all[0], out.one, out.obj[CLIENT]]) {
        expect(v).not.toHaveProperty('degraded');
        expect(JSON.stringify(v)).not.toContain(MAIN);
      }
    } },

  // ── 5. Swap-maintenance job (rescue / upgrade / refill) ────────────────────────────────────────
  { id: 'DS-72', name: 'upgrade: degraded T3 + tier-1 appears -> swapped up, marker cleared, old account returned with availableDate held to limitedUntil (real archive path, D9)',
    setup: async (fx) => {
      await fx.world({ degraded: degradedState(3) }, { mainBuffer: limited(6) });
      await fx.addBuffer(T1);
    },
    run: (fx) => maintain(fx),
    expect: async (out, fx) => {
      expect(out.upgrade).toEqual([expect.objectContaining({ clientId: CLIENT, fromTier: 3, status: 'swapped', newMobile: T1 })]);
      await swappedTo(T1, null)({ status: 'swapped', swapped: true, newMobile: T1 }, fx);
      const old = await fx.buf(MAIN);
      expect(old).toMatchObject({ inUse: false, status: 'active', clientId: CLIENT, spamStatus: 'limited' });
      expect(old.availableDate).toBe(ClientHelperUtils.toDateString(new Date(old.limitedUntil).getTime()));
      expect(fx.tg.updatePrivacyforDeletedAccount).toHaveBeenCalledWith(MAIN); // formalities ran (Telegram boundary)
      expect(fx.usersService.expireAccount).not.toHaveBeenCalled();
      expect(fx.count('Degraded cleared')).toBe(1);
    } },
  { id: 'DS-73', name: 'upgrade: T3 whose limit has expired -> marker cleared, no swap (D2)',
    setup: async (fx) => {
      await fx.world({ degraded: degradedState(3, { limitedUntil: new Date(Date.now() - DAY) }) }, { mainBuffer: limited(-1) });
      await fx.addBuffer(T1);
    },
    run: (fx) => maintain(fx),
    expect: async (out, fx) => {
      expect(out.upgrade).toEqual([{ clientId: CLIENT, fromTier: 3, status: 'cleared' }]);
      const c = await fx.client(); expect(c.mobile).toBe(MAIN); expect(c.degraded).toBeUndefined();
      expect(mockProbe).not.toHaveBeenCalled();
    } },
  { id: 'DS-74', name: 'upgrade: legacy T2 marker on an account meeting tier-1 rules -> cleared, NOT swapped to another free one (D2)',
    setup: async (fx) => { await fx.world({ degraded: degradedState(2) }); await fx.addBuffer(T1); },
    run: (fx) => maintain(fx),
    expect: async (out, fx) => { expect(out.upgrade[0].status).toBe('cleared'); expect((await fx.client()).mobile).toBe(MAIN); } },
  { id: 'DS-75', name: 'upgrade: only strictly better tiers; nothing better -> no swap, no notice',
    setup: async (fx) => { await fx.world({ degraded: degradedState(3) }, { mainBuffer: limited(3) }); await fx.addBuffer('919000950001', limited(1)); await fx.addBuffer('919000960001', harsh()); },
    run: (fx) => maintain(fx),
    expect: async (out, fx) => {
      expect(out.upgrade).toEqual([{ clientId: CLIENT, fromTier: 3, status: 'no_candidate', attempts: 1 }]);
      await noSwap(0)({ swapped: false }, fx);
      expect(fx.count('No buffer')).toBe(0);
    } },
  { id: 'DS-76', name: 'upgrade: T4 -> T3 keeps the episode reason and since; one "Degraded upgrade"',
    setup: async (fx) => { await fx.world({ degraded: degradedState(4, { since: new Date('2026-10-20T00:00:00Z') }) }, { mainBuffer: harsh() }); await fx.addBuffer('919000950001', limited(1)); },
    run: (fx) => maintain(fx),
    expect: async (out, fx) => {
      expect(out.upgrade[0]).toMatchObject({ status: 'swapped', degradedTier: 3 });
      expect((await fx.client()).degraded).toMatchObject({ tier: 3, reason: 'FROZEN_METHOD_INVALID', since: new Date('2026-10-20T00:00:00Z'), fromMobile: MAIN });
      expect(fx.count('Degraded upgrade')).toBe(1);
    } },
  { id: 'DS-77', name: 'rescue: the degraded account itself dies (tg-aut reported it dead) -> rescued, any tier (D1)',
    setup: async (fx) => { await fx.world({ degraded: degradedState(3), deadMain: deadMain() }, { mainBuffer: limited(3), mainUser: { expired: true } }); await fx.addBuffer('919000960001', harsh()); },
    run: (fx) => maintain(fx),
    expect: async (out, fx) => {
      expect(out.rescue).toEqual([expect.objectContaining({ clientId: CLIENT, status: 'swapped', degradedTier: 4, fromTier: 3 })]);
      expect(out.upgrade).toEqual([]);
      expect((await fx.client()).degraded).toMatchObject({ tier: 4, reason: expect.stringContaining('DEAD_MAIN_RESCUE') });
    } },
  { id: 'DS-78', name: 'rescue: non-degraded client reported dead (main already retired by that report) after tg-aut hit its handoff cap -> rescued to tier 1, the main is not retired or announced again (D1)',
    setup: async (fx) => { await deadWorld(fx); await fx.addBuffer(T1); },
    run: (fx) => maintain(fx),
    expect: async (out, fx) => {
      expect(out.rescue).toEqual([expect.objectContaining({ clientId: CLIENT, status: 'swapped', newMobile: T1 })]);
      await swappedTo(T1, null)({ status: 'swapped', swapped: true, newMobile: T1 }, fx);
      expect(fx.count('Inactivated')).toBe(0); // retired once already (by the dead report); idempotent
      expect(fx.usersService.expireAccount).not.toHaveBeenCalledWith(MAIN, expect.anything());
    } },
  { id: 'DS-79', name: 'rescue never fires without live-session evidence: an inactive main ([UNSAFE] foreign 2FA)',
    setup: async (fx) => { await fx.world({}, { mainBuffer: { status: 'inactive', message: '[UNSAFE] Foreign 2FA password' } }); await fx.addBuffer(T1); },
    run: (fx) => maintain(fx),
    expect: async (out, fx) => { expect(out.rescue).toEqual([]); expect((await fx.client()).mobile).toBe(MAIN); } },
  { id: 'DS-80', name: 'refill: SpamBot-limited (alive) main + tier-1 appears -> swapped, reason POOL_REFILL, old returned (D8)',
    setup: async (fx) => { await fx.world({}, { mainBuffer: limited(4) }); await fx.addBuffer(T1); },
    run: (fx) => maintain(fx),
    expect: async (out, fx) => {
      expect(out.refill).toEqual([{ clientId: CLIENT, status: 'swapped', newMobile: T1 }]);
      expect(fx.tg.setActiveClientSetup).toHaveBeenCalledWith(expect.objectContaining({ reason: 'POOL_REFILL', archiveOld: true }));
      expect((await fx.buf(MAIN)).inUse).toBe(false);
      expect(fx.usersService.expireAccount).not.toHaveBeenCalled();
    } },
  { id: 'DS-81', name: 'refill: limited main, no tier-1 buffer -> no setup call, no notice',
    setup: async (fx) => { await fx.world({}, { mainBuffer: limited(4) }); await fx.addBuffer(T3, limited(2)); },
    run: (fx) => maintain(fx),
    expect: async (out, fx) => { expect(out.refill).toEqual([]); expect(fx.tg.setActiveClientSetup).not.toHaveBeenCalled(); expect(fx.notices()).toEqual([]); } },
  { id: 'DS-82', name: 'refill never touches a healthy (not limited) main',
    setup: async (fx) => { await fx.world(); await fx.addBuffer(T1); },
    run: (fx) => maintain(fx),
    expect: async (out, fx) => { expect(out).toEqual({ rescue: [], upgrade: [], refill: [] }); expect((await fx.client()).mobile).toBe(MAIN); } },
  { id: 'DS-83', name: 'rescue with nothing anywhere: one "No buffer" across runs, no "Inactivated" re-notice, then cooldown',
    setup: deadWorld,
    run: async (fx) => [await maintain(fx), await maintain(fx)],
    expect: async ([first, second], fx) => {
      expect(first.rescue).toEqual([{ clientId: CLIENT, status: 'no_candidate', attempts: 1 }]);
      expect(second.rescue).toEqual([{ clientId: CLIENT, status: 'skipped_cooldown', attempts: 1 }]);
      expect(fx.count('No buffer')).toBe(1);
      expect(fx.count('Inactivated')).toBe(0);
    } },
  // The bound is pinned as a literal (3), not the imported constant, so changing the constant fails this row.
  { id: 'DS-84', name: 'rescue is bounded: 3 attempts per run',
    setup: async (fx) => {
      for (let i = 0; i < 5; i++) await fx.addClient(`dead${i}`, `91900099000${i}`, { deadMain: deadMain(`91900099000${i}`) }, RETIRED);
    },
    run: (fx) => maintain(fx),
    expect: (out) => { expect(RESCUE_MAX_PER_RUN).toBe(3); expect(out.rescue).toHaveLength(3); } },
  { id: 'DS-85', name: 'rescue per-client cooldown: 30 min, then 1 h after the second miss; a new main resets it',
    setup: deadWorld,
    run: async (fx) => {
      const clock = fakeClock();
      const at = (ms: number) => clock.advance(ms - clock.offset);
      const r: string[] = [];
      try {
        at(0); r.push((await maintain(fx)).rescue[0].status);
        at(29 * 60_000); r.push((await maintain(fx)).rescue[0].status);
        at(31 * 60_000); r.push((await maintain(fx)).rescue[0].status);
        at(31 * 60_000 + 59 * 60_000); r.push((await maintain(fx)).rescue[0].status);
        at(31 * 60_000 + 61 * 60_000); r.push((await maintain(fx)).rescue[0].status);
      } finally { clock.restore(); }
      return r;
    },
    expect: (r) => {
      expect(r).toEqual(['no_candidate', 'skipped_cooldown', 'no_candidate', 'skipped_cooldown', 'no_candidate']);
      expect([1, 2, 3, 4, 5].map(passRetryDelayMs)).toEqual([30, 60, 120, 240, 480].map((m) => m * 60_000));
    } },

  // ── 6. Concurrency / safety ───────────────────────────────────────────────────────────────────
  { id: 'DS-86', name: 'sibling race: spare taken by a sibling setup DURING our probe -> we skip it and take the next (D3)',
    setup: async (fx) => {
      await fx.world(); await fx.addBuffer('919000950001', limited(2)); await fx.addBuffer('919000950002', limited(4));
      mockProbe.mockImplementationOnce(async (m: string) => { fx.tg.setups.set(m, { clientId: SIBLING, newMobile: m, existingMobile: SIBLING_MAIN }); return probeAs('limited', 2); });
    },
    run: (fx) => setup(fx),
    expect: async (out, fx) => {
      await swappedTo('919000950002', 3)(out, fx);
      expect(fx.tg.setups.get('919000950001')).toMatchObject({ clientId: SIBLING }); // sibling's setup untouched
      expect((await fx.buf('919000950001')).inUse).toBe(false);
    } },
  { id: 'DS-87', name: 'failed swap on a mobile that meanwhile became a sibling\'s live main: no availableDate push, no disconnect (D3)',
    setup: async (fx) => {
      await fx.world(); await fx.addBuffer(T3, limited(5));
      await fx.addClient(SIBLING, SIBLING_MAIN);
      (connectionManager.getClient as jest.Mock).mockImplementationOnce(async () => {
        await fx.writeClient(SIBLING, { mobile: T3 });
        throw new Error('ETIMEDOUT connecting');
      });
    },
    run: (fx) => setup(fx),
    expect: async (out, fx) => {
      expect(out.status).toBe('failed');
      expect(fx.buffer.createOrUpdate).not.toHaveBeenCalledWith(T3, expect.anything());
      expect(connectionManager.unregisterClient).not.toHaveBeenCalledWith(T3);
      expect((await fx.client()).mobile).toBe(MAIN);
    } },
  { id: 'DS-88', name: 'current-mobile guard: client mobile changed mid-flow -> ConflictException, no client/marker/ownership writes',
    setup: async (fx) => {
      await fx.world(); await fx.addBuffer(T3, limited(5));
      (connectionManager.getClient as jest.Mock).mockImplementationOnce(async () => { await fx.writeClient(CLIENT, { mobile: '919000977777' }); return {}; });
    },
    run: (fx) => setup(fx),
    expect: async (out, fx) => {
      expect(out.status).toBe('failed');
      expect(out.message).toMatch(/changed before cutover/);
      const c = await fx.client(); expect(c.mobile).toBe('919000977777'); expect(c.degraded).toBeUndefined();
      expect((await fx.buf(T3)).inUse).toBe(false);
      expect((await fx.buf(MAIN)).inUse).toBe(true);
    } },
  { id: 'DS-89', name: 'transaction failure (setPrimaryInUse throws) rolls back the client write and the tier-2 reassign',
    setup: async (fx) => {
      await fx.world(); await sibling(fx, ['919000920001', '919000920002', '919000920003']);
      fx.buffer.setPrimaryInUse.mockImplementationOnce(async () => { throw new Error('write conflict'); });
    },
    run: (fx) => setup(fx),
    expect: async (out, fx) => {
      expect(out.status).toBe('failed');
      const c = await fx.client(); expect(c.mobile).toBe(MAIN); expect(c.degraded).toBeUndefined();
      expect((await fx.buf('919000920001')).clientId).toBe(SIBLING);
    } },
  { id: 'DS-90', name: 'deployKey restart failure after commit -> "Restart failed" reported, data committed and consistent',
    setup: async (fx) => {
      await fx.world({ deployKey: 'http://deploy/sneha2' }); await fx.addBuffer(T3, limited(5));
      (fetchWithTimeout as jest.Mock).mockImplementation(async (url: string) => { if (String(url).includes('deploy')) throw new Error('502'); return { ok: true }; });
    },
    run: (fx) => setup(fx),
    expect: async (out, fx) => { await swappedTo(T3, 3)(out, fx); expect(fx.count('Restart failed')).toBe(1); expect((await fx.buf(MAIN)).status).toBe('inactive'); } },
  { id: 'DS-91', name: 'lock: concurrent dead handoffs for one client -> one selection, one cutover, then cooldown',
    setup: async (fx) => { await fx.world(); await fx.addBuffer(T3, limited(5)); await fx.addBuffer('919000950002', limited(6)); },
    run: async (fx) => { const [a, b] = await Promise.all([setup(fx), setup(fx)]); return { a, b, c: await setup(fx) }; },
    expect: async ({ a, b, c }, fx) => {
      expect(a).toBe(b);
      expect(fx.tg.setActiveClientSetup).toHaveBeenCalledTimes(1);
      expect(c.status).toBe('cooldown');
    } },
  { id: 'DS-92', name: 'no removeExternalLoginSessions anywhere on these paths (rescue + upgrade swap; source check)',
    setup: async (fx) => {
      await fx.world({ degraded: degradedState(3) }, { mainBuffer: limited(3) }); await fx.addBuffer(T1);
      await fx.addClient('dead0', '919000990000', { deadMain: deadMain('919000990000') }, RETIRED);
      await fx.addBuffer('919000990009', { clientId: 'dead0' });
    },
    run: (fx) => maintain(fx),
    expect: (out, fx) => {
      expect(out.rescue[0].status).toBe('swapped'); expect(out.upgrade[0].status).toBe('swapped');
      expect(fx.removeExternalLoginSessions).not.toHaveBeenCalled();
      expect(fx.tg.removeExternalLoginSessions).not.toHaveBeenCalled();
      for (const f of ['../client.service.ts', '../degraded-swap.ts']) {
        expect(fs.readFileSync(path.join(__dirname, f), 'utf8')).not.toMatch(/removeExternalLoginSessions/);
      }
    } },
  { id: 'DS-93', name: 'a degraded plan is only ever applied to its own client (plans keyed by clientId + mobile, D3)',
    setup: async (fx) => {
      await fx.world(); await fx.addBuffer(T1);
      const foreign = { clientId: SIBLING, pickTier: 3, markerTier: 3, reason: 'X', fromMobile: SIBLING_MAIN, limitedUntil: null, since: new Date(), tier: 3 };
      fx.svc.degradedPlans.set(T1, foreign); fx.svc.degradedPlans.set(`${SIBLING}:${T1}`, foreign);
    },
    run: (fx) => setup(fx), expect: swappedTo(T1, null) },
  { id: 'DS-94', name: 'updateClientSession refuses a setup that belongs to another client (D3)',
    setup: async (fx) => { await fx.world(); fx.tg.setups.set(T3, { clientId: SIBLING, newMobile: T3, existingMobile: SIBLING_MAIN }); },
    run: (fx) => fx.svc.updateClientSession('sess', T3, CLIENT).then(() => 'ok', (e: unknown) => e),
    expect: async (out, fx) => { expect(out).toBeInstanceOf(ConflictException); expect((await fx.client()).mobile).toBe(MAIN); } },

  // ── 7. Notifications ─────────────────────────────────────────────────────────────────────────
  { id: 'DS-95', name: '"No buffer" once per episode, critical for a dead main',
    setup: async (fx) => { await fx.world(); },
    run: async (fx) => { await setup(fx); await setup(fx); await setup(fx); },
    expect: (_o, fx) => { expect(fx.count('No buffer')).toBe(1); expect(fx.notices().find((n: any) => n.title === 'No buffer').severity).toBe('critical'); } },
  { id: 'DS-96', name: 'new "No buffer" episode after the mobile changes by a manual fix or another process (D4)',
    setup: async (fx) => { await fx.world(); },
    run: async (fx) => {
      await setup(fx);
      await fx.svc.update(CLIENT, { mobile: '919000955555' });
      await setup(fx);
      await fx.writeClient(CLIENT, { mobile: '919000966666' });
      await setup(fx);
    },
    expect: (_o, fx) => { expect(fx.count('No buffer')).toBe(3); } },
  { id: 'DS-97', name: 'degrade notice exactly once per degraded swap',
    setup: async (fx) => { await fx.world(); await fx.addBuffer(T3, limited(5)); },
    run: (fx) => setup(fx), expect: (_o, fx) => { expect(fx.count('Degraded swap')).toBe(1); expect(fx.count('Degraded cleared')).toBe(0); } },
  { id: 'DS-98', name: 'daily summary lists degraded clients and empty pools; silent when both are empty',
    setup: async (fx) => { await fx.world({ degraded: degradedState(3) }); },
    run: async (fx) => {
      const first = await fx.svc.sendDegradedSummary();
      const firstTables = fx.notices().find((n: any) => n.title === 'Degraded daily')?.tables.map((t: any) => t.title);
      (sendBotNotice as jest.Mock).mockClear();
      await fx.clientModel.updateOne({ clientId: CLIENT }, { $unset: { degraded: '' } });
      await fx.addBuffer(T1);
      return { first, firstTables, second: await fx.svc.sendDegradedSummary() };
    },
    expect: (out) => {
      expect(out.first).toEqual({ degraded: 1, emptyPools: 1, stuck: 0 });
      expect(out.firstTables).toEqual(['Degraded clients', 'No eligible spare (pool empty)']);
      expect(out.second).toEqual({ degraded: 0, emptyPools: 0, stuck: 0 });
      expect(sendBotNotice).not.toHaveBeenCalled();
    } },

  // ── 8. Ownership / schema primitives ──────────────────────────────────────────────────────────
  { id: 'DS-99', name: 'reassignClientId moves only a free active spare still owned by the sibling; otherwise ConflictException',
    setup: async (fx) => { await fx.addBuffer('919000920001', { clientId: SIBLING }); await fx.addBuffer('919000920002', { clientId: SIBLING, inUse: true }); },
    run: async (fx) => ({
      first: await fx.buffer.reassignClientId('919000920001', SIBLING, CLIENT).then(() => 'ok', (e: unknown) => e),
      again: await fx.buffer.reassignClientId('919000920001', SIBLING, CLIENT).then(() => 'ok', (e: unknown) => e),
      inUse: await fx.buffer.reassignClientId('919000920002', SIBLING, CLIENT).then(() => 'ok', (e: unknown) => e),
    }),
    expect: async (out, fx) => {
      expect(out.first).toBe('ok');
      expect((await fx.buf('919000920001')).clientId).toBe(CLIENT);
      expect(out.again).toBeInstanceOf(ConflictException);
      expect(out.inUse).toBeInstanceOf(ConflictException);
    } },
  { id: 'DS-100', name: 'clients.degraded survives a validated $set (strict schema) and is removed by $unset',
    setup: async (fx) => { await fx.world(); },
    run: async (fx) => {
      const state = { since: new Date(), tier: 3, reason: 'FROZEN_METHOD_INVALID', fromMobile: MAIN, limitedUntil: new Date(Date.now() + DAY) };
      await fx.clientModel.findOneAndUpdate({ clientId: CLIENT }, { $set: { degraded: state } }, { runValidators: true });
      const kept = (await fx.client()).degraded;
      await fx.clientModel.findOneAndUpdate({ clientId: CLIENT }, { $unset: { degraded: '' } }, { runValidators: true });
      return { state, kept, after: (await fx.client()).degraded };
    },
    expect: (out) => { expect(out.kept).toEqual(out.state); expect(out.after).toBeUndefined(); } },
  { id: 'DS-101', name: 'tier-2 commit order inside the transaction: client guard write, then reassign, then setPrimaryInUse',
    setup: async (fx) => { await fx.world(); await sibling(fx, ['919000920001', '919000920002', '919000920003']); },
    run: (fx) => setup(fx),
    expect: (out, fx) => {
      expect(out.status).toBe('swapped');
      const order = (m: jest.Mock) => m.mock.invocationCallOrder[0];
      expect(order(fx.buffer.reassignClientId)).toBeLessThan(order(fx.buffer.setPrimaryInUse));
      expect(fx.buffer.reassignClientId).toHaveBeenCalledWith('919000920001', SIBLING, CLIENT, expect.anything());
    } },
  // Maintenance (added after the first matrix): refill bound, literal 3 like DS-84.
  { id: 'DS-102', name: 'refill is bounded: 3 attempts per run, the rest wait for the next run',
    setup: async (fx) => {
      for (let i = 0; i < 5; i++) {
        await fx.addClient(`lim${i}`, `91900098000${i}`, {}, { mainBuffer: limited(4) });
        await fx.addBuffer(`91900097000${i}`, { clientId: `lim${i}` });
      }
    },
    run: (fx) => maintain(fx),
    expect: (out) => {
      expect(POOL_REFILL_MAX_PER_RUN).toBe(3);
      expect(out.refill).toHaveLength(3);
      expect(out.refill.every((r: any) => r.status === 'swapped')).toBe(true);
    } },
  // ── 9. Rescue / refill hard stop (owner retry rule, coordinator 2026-10-24) ──────────────────────
  // Owner numbers are literals here (6 attempts, 30-min doubling) so a changed constant fails the row.
  { id: 'DS-103', name: 'rescue hard stop: 6 attempts, gaps 30, 60, 120, 240, 480 min, then stopped',
    setup: deadWorld,
    run: async (fx) => {
      const runSetup = jest.spyOn(fx.svc, 'runSetup');
      const clock = fakeClock();
      const triedAt: number[] = [];
      const last: string[] = [];
      try {
        for (let m = 0; m <= 18 * 60; m += 15) {
          const row = (await maintain(fx)).rescue[0];
          if (row.status !== 'skipped_cooldown' && row.status !== 'stopped') triedAt.push(clock.offset / 60_000);
          last.push(row.status);
          clock.advance(15 * 60_000);
        }
      } finally { clock.restore(); }
      return { triedAt, last: last.slice(-3), calls: runSetup.mock.calls.length };
    },
    expect: async (out, fx) => {
      expect(PASS_MAX_ATTEMPTS).toBe(6);
      expect(out.triedAt).toEqual([0, 30, 90, 210, 450, 930]);
      expect(out.calls).toBe(6);
      expect(out.last).toEqual(['stopped', 'stopped', 'stopped']);
      expect((await fx.client()).swapRetry).toMatchObject({ pass: 'rescue', mobile: MAIN, attempts: 6, stoppedAt: expect.any(Date) });
    } },
  { id: 'DS-104', name: 'no 7th attempt: a stopped episode stays stopped through 7 days of runs (pool unchanged)',
    setup: deadWorld,
    run: async (fx) => {
      const clock = fakeClock();
      try {
        await driveToStop(fx, clock);
        const runSetup = jest.spyOn(fx.svc, 'runSetup');
        const statuses = new Set<string>();
        for (let h = 0; h < 7 * 24; h += 6) { clock.advance(6 * 60 * 60_000); statuses.add((await maintain(fx)).rescue[0].status); }
        return { statuses: [...statuses], calls: runSetup.mock.calls.length };
      } finally { clock.restore(); }
    },
    expect: (out) => { expect(out).toEqual({ statuses: ['stopped'], calls: 0 }); } },
  { id: 'DS-105', name: 'one critical stop notice with the owner text; none on later stopped runs',
    setup: deadWorld,
    run: async (fx) => {
      const clock = fakeClock();
      try {
        const seen = await driveToStop(fx, clock);
        for (let i = 0; i < 4; i++) { clock.advance(60 * 60_000); await maintain(fx); }
        return seen;
      } finally { clock.restore(); }
    },
    expect: (seen, fx) => {
      expect(seen.map((s: any) => s.attempts)).toEqual([1, 2, 3, 4, 5, 6, 6]);
      const stops = fx.notices().filter((n: any) => n.title === 'Rescue stopped');
      expect(stops).toHaveLength(1);
      expect(stops[0]).toMatchObject({ severity: 'critical', summary: STOP_TEXT });
    } },
  { id: 'DS-106', name: 're-arm on pool change: a new buffer doc re-arms (count reset to 1); a usable one is then swapped in and the episode ends',
    setup: deadWorld,
    run: async (fx) => {
      const clock = fakeClock();
      try {
        await driveToStop(fx, clock);
        clock.advance(60_000);
        await fx.addBuffer('919000977001', { warmupPhase: 'enrolled' }); // new doc, not usable yet
        const rearmed = (await maintain(fx)).rescue[0];
        clock.advance(60_000);
        await fx.addBuffer(T1); // usable: the pool changed again, so no cooldown wait
        const swapped = (await maintain(fx)).rescue[0];
        return { rearmed, swapped };
      } finally { clock.restore(); }
    },
    expect: async (out, fx) => {
      expect(out.rearmed).toEqual({ clientId: CLIENT, status: 'no_candidate', attempts: 1, rearmed: true });
      expect(out.swapped).toMatchObject({ clientId: CLIENT, status: 'swapped', newMobile: T1, rearmed: true });
      const client = await fx.client();
      expect(client.mobile).toBe(T1);
      expect(client.swapRetry).toBeUndefined();
    } },
  { id: 'DS-107', name: 're-arm on clients.mobile change (manual fix onto another dead account): a new episode, attempt 1',
    setup: deadWorld,
    run: async (fx) => {
      const clock = fakeClock();
      try {
        await driveToStop(fx, clock);
        fx.users.set('919000977002', { mobile: '919000977002', tgId: 'x', session: 'b', expired: true, twoFA: true });
        await fx.writeClient(CLIENT, { mobile: '919000977002', deadMain: deadMain('919000977002') });
        clock.advance(60_000);
        return (await maintain(fx)).rescue[0];
      } finally { clock.restore(); }
    },
    expect: async (row, fx) => {
      expect(row).toEqual({ clientId: CLIENT, status: 'no_candidate', attempts: 1 });
      expect((await fx.client()).swapRetry).toMatchObject({ mobile: '919000977002', attempts: 1, stoppedAt: null });
    } },
  { id: 'DS-108', name: 'the stop survives a CMS restart (persisted on clients.swapRetry, not in memory)',
    setup: deadWorld,
    run: async (fx) => {
      const clock = fakeClock();
      try {
        await driveToStop(fx, clock);
        const fresh = fx.restart();
        const runSetup = jest.spyOn(fresh, 'runSetup');
        clock.advance(9 * 60 * 60_000);
        const row = (await maintain(fx)).rescue[0];
        return { row, calls: runSetup.mock.calls.length };
      } finally { clock.restore(); }
    },
    expect: (out, fx) => {
      expect(out).toEqual({ row: { clientId: CLIENT, status: 'stopped', attempts: 6 }, calls: 0 });
      expect(fx.count('Rescue stopped')).toBe(1);
    } },
  { id: 'DS-109', name: 'daily summary lists stuck clients (client, pass, mobile last 4, tries)',
    setup: deadWorld,
    run: async (fx) => {
      const clock = fakeClock();
      try { await driveToStop(fx, clock); } finally { clock.restore(); }
      (sendBotNotice as jest.Mock).mockClear();
      const out = await fx.svc.sendDegradedSummary();
      const daily = fx.notices().find((n: any) => n.title === 'Degraded daily');
      return { out, stuck: daily?.tables.find((t: any) => t.title.startsWith('Stuck')), severity: daily?.severity };
    },
    expect: (r) => {
      expect(r.out.stuck).toBe(1);
      expect(r.stuck.rows).toEqual([[CLIENT, 'rescue', '****3438', '6', expect.any(String)]]);
      expect(r.severity).toBe('error');
    } },
  { id: 'DS-110', name: 'pool fingerprint: availableDate or limitedUntil passing, or a row reaching session_rotated, changes it; channel-count noise does not',
    run: async () => {
      const now = Date.parse('2026-10-24T06:00:00Z');
      const row = { mobile: 'm1', clientId: CLIENT, status: 'active', inUse: false, warmupPhase: 'session_rotated', channels: 250,
        availableDate: '2026-10-25', spamStatus: 'limited', limitedUntil: new Date(now + DAY) };
      const fp = (r: any, at = now, today = '2026-10-24') => swapPoolFingerprint([r], at, today);
      return {
        base: fp(row),
        noise: fp({ ...row, channels: 260 }),
        dateDue: fp(row, now, '2026-10-25'),
        limitPassed: fp(row, now + DAY + 1),
        rotated: fp({ ...row, warmupPhase: 'maturing' }),
        inUse: swapPoolFingerprint([{ ...row, inUse: true }], now, '2026-10-24'),
      };
    },
    expect: (f) => {
      expect(f.noise).toBe(f.base);
      for (const changed of [f.dateDue, f.limitPassed, f.rotated]) expect(changed).not.toBe(f.base);
      expect(f.inUse).toBe('0:811c9dc5');
    } },
  { id: 'DS-111', name: 'masked endpoints never return clients.swapRetry (it holds a mobile)',
    setup: async (fx) => {
      await fx.world({ swapRetry: { pass: 'rescue', mobile: MAIN, attempts: 6, nextAt: new Date(), poolFingerprint: '0:0', since: new Date(), stoppedAt: new Date() } });
    },
    run: async (fx) => [await fx.svc.findAllMasked(), await fx.svc.findOneMasked(CLIENT), (await fx.svc.findAllMaskedObject())[CLIENT]],
    expect: (views) => {
      for (const v of [views[0][0], views[1], views[2]]) {
        expect(v).not.toHaveProperty('swapRetry');
        expect(JSON.stringify(v)).not.toContain(MAIN);
      }
    } },
  // ── 10. Review 2: evidence, leases, caps (coordinator 2026-10-24) ───────────────────────────────
  { id: 'DS-112', name: 'false-dead: a CMS backup-session error expired the users doc + pool row of a LIVE main (no tg-aut report) -> no rescue, no swap, no restart, no retire',
    setup: async (fx) => {
      await fx.world({ deployKey: 'http://deploy/sneha2' }, { mainUser: { expired: true }, mainBuffer: { status: 'inactive', inUse: false, message: 'Permanent connection error: AUTH_KEY_UNREGISTERED' } });
      await fx.addBuffer(T1);
    },
    run: (fx) => maintain(fx),
    expect: async (out, fx) => {
      expect(out).toEqual({ rescue: [], upgrade: [], refill: [] });
      expect((await fx.client()).mobile).toBe(MAIN);
      expect(fetchWithTimeout).not.toHaveBeenCalled();
      expect(fx.usersService.expireAccount).not.toHaveBeenCalled();
      expect(fx.tg.setActiveClientSetup).not.toHaveBeenCalled();
      expect(mockProbe).not.toHaveBeenCalled();
    } },
  { id: 'DS-113', name: 'SESSION_EXPIRED is never rescue evidence: not as a pool message, not as deadMain.reason, and /setupClient with it writes no deadMain',
    setup: async (fx) => { await fx.world({}, { mainBuffer: { status: 'inactive', inUse: false, message: 'Permanent connection error: SESSION_EXPIRED' } }); },
    run: async (fx) => {
      const poolOnly = (await maintain(fx)).rescue;
      const manual = deadMain(MAIN, 'SESSION_EXPIRED');
      await fx.writeClient(CLIENT, { deadMain: manual });
      const manualReason = (await maintain(fx)).rescue;
      await setup(fx, deadReq('SESSION_EXPIRED'));
      return { poolOnly, manualReason, manual, after: (await fx.client()).deadMain };
    },
    expect: (r) => {
      expect(r.poolOnly).toEqual([]);
      expect(r.manualReason).toEqual([]);
      expect(r.after).toEqual(r.manual); // not refreshed by the SESSION_EXPIRED report
    } },
  { id: 'DS-114', name: 'a dead /setupClient records clients.deadMain {mobile, reason, at} for the current mobile; non-dead and internal rescue reasons do not; masked views never return it',
    setup: async (fx) => { await fx.world(); },
    run: async (fx) => {
      await setup(fx, limitedReq());
      const afterLimited = (await fx.client()).deadMain;
      await setup(fx, deadReq('DEAD_MAIN_RESCUE: FROZEN_METHOD_INVALID'));
      const afterInternal = (await fx.client()).deadMain;
      fx.svc.setupCooldownMap.clear();
      await setup(fx, deadReq('AUTH_KEY_UNREGISTERED'));
      const recorded = (await fx.client()).deadMain;
      fx.svc.clientsMap.clear();
      const views = [(await fx.svc.findAllMasked())[0], await fx.svc.findOneMasked(CLIENT), (await fx.svc.findAllMaskedObject())[CLIENT]];
      return { afterLimited, afterInternal, recorded, views };
    },
    expect: (r) => {
      expect(r.afterLimited).toBeUndefined();
      expect(r.afterInternal).toBeUndefined();
      expect(r.recorded).toEqual({ mobile: MAIN, reason: 'AUTH_KEY_UNREGISTERED', at: expect.any(Date) });
      for (const v of r.views) {
        expect(v).not.toHaveProperty('deadMain');
        expect(v).not.toHaveProperty('swapLease');
        expect(JSON.stringify(v)).not.toContain(MAIN);
      }
    } },
  { id: 'DS-115', name: 'deadMain counts only for the CURRENT mobile; a swap clears it, and so does update() changing the mobile',
    setup: async (fx) => { await fx.world({ deadMain: deadMain('919000900000') }, RETIRED); await fx.addBuffer(T1); },
    run: async (fx) => {
      const stale = (await maintain(fx)).rescue;
      await fx.writeClient(CLIENT, { deadMain: deadMain() });
      const rescued = (await maintain(fx)).rescue;
      const afterSwap = (await fx.client()).deadMain;
      await fx.writeClient(CLIENT, { deadMain: deadMain(T1) });
      await fx.svc.update(CLIENT, { mobile: '919000988888' });
      return { stale, rescued, afterSwap, afterUpdate: (await fx.client()).deadMain };
    },
    expect: (r) => {
      expect(r.stale).toEqual([]);
      expect(r.rescued).toEqual([expect.objectContaining({ status: 'swapped', newMobile: T1 })]);
      expect(r.afterSwap).toBeUndefined();
      expect(r.afterUpdate).toBeUndefined();
    } },
  { id: 'DS-116', name: 'rescue waits 35 min after the last tg-aut dead report (its handoff ladder runs first), then acts',
    setup: async (fx) => { await fx.world({}, RETIRED); },
    run: async (fx) => {
      const clock = fakeClock();
      const r: string[] = [];
      try {
        await setup(fx, deadReq()); // the report: deadMain.at = now (fake clock covers new Date())
        await fx.addBuffer(T1);
        fx.svc.setupCooldownMap.clear();
        r.push((await maintain(fx)).rescue[0].status);
        clock.advance(34 * 60_000); r.push((await maintain(fx)).rescue[0].status);
        clock.advance(2 * 60_000); r.push((await maintain(fx)).rescue[0].status);
      } finally { clock.restore(); }
      return r;
    },
    expect: async (r, fx) => {
      expect(DEAD_MAIN_HANDOFF_WAIT_MS).toBe(35 * 60_000);
      expect(r).toEqual(['waiting_handoff', 'waiting_handoff', 'swapped']);
      expect((await fx.client()).mobile).toBe(T1);
    } },
  { id: 'DS-117', name: 'two CMS processes (cms job + ums HTTP) on one dead client: never two probes/connects of one buffer at once, one swap',
    setup: async (fx) => { await deadWorld(fx); await fx.addBuffer(T1); },
    run: async (fx) => {
      const inflight = new Map<string, number>();
      let maxConc = 0;
      mockProbe.mockImplementation(async (m: string) => {
        inflight.set(m, (inflight.get(m) || 0) + 1); maxConc = Math.max(maxConc, inflight.get(m)!);
        await new Promise((res) => setTimeout(res, 50));
        inflight.set(m, inflight.get(m)! - 1);
        return defaultProbe(await fx.bufferModel.findOne({ mobile: m }).lean());
      });
      const ums: any = new ClientService(fx.clientModel as any, new FakeTelegram() as any, fx.buffer, fx.usersService as any);
      ums.isInitialized = true;
      jest.spyOn(ums, 'performPostUpdateTasks').mockImplementation(() => undefined);
      const [job, http] = await Promise.all([maintain(fx), ums.setupClient(CLIENT, deadReq())]);
      return { job, http, maxConc };
    },
    expect: async (r, fx) => {
      expect(r.maxConc).toBeLessThanOrEqual(1);
      const statuses = [r.job.rescue[0]?.status, r.http.status];
      expect(statuses.filter((s) => s === 'swapped')).toHaveLength(1);
      expect(mockProbe.mock.calls.filter(([m]: any[]) => m === T1).length).toBeLessThanOrEqual(1);
      expect((await fx.client()).mobile).toBe(T1);
      expect((await fx.client()).swapLease).toBeUndefined();
    } },
  { id: 'DS-118', name: 'client lease: an unexpired lease of another process -> cooldown, nothing probed or registered; an expired one is taken over and released after',
    setup: async (fx) => {
      await fx.world({ swapLease: { owner: 'ums-host:1:abc', until: new Date(Date.now() + 5 * 60_000) } });
      await fx.addBuffer(T1);
    },
    run: async (fx) => {
      const held = await setup(fx);
      const probesWhileHeld = mockProbe.mock.calls.length;
      await fx.writeClient(CLIENT, { swapLease: { owner: 'ums-host:1:abc', until: new Date(Date.now() - 1000) } });
      const taken = await setup(fx);
      return { held, probesWhileHeld, taken };
    },
    expect: async (r, fx) => {
      expect(SWAP_LEASE_TTL_MS).toBe(10 * 60_000);
      expect(r.held).toMatchObject({ status: 'cooldown', swapped: false, message: expect.stringContaining('another CMS process') });
      expect(r.held.cooldownRemainingMs).toBeGreaterThan(0);
      expect(r.probesWhileHeld).toBe(0);
      expect(r.taken).toMatchObject({ status: 'swapped', newMobile: T1 });
      expect((await fx.client()).swapLease).toBeUndefined();
      expect(await fx.bufferModel.countDocuments({ probeLease: { $exists: true } })).toBe(0);
    } },
  { id: 'DS-119', name: 'probe lease: a buffer leased by another process is never probed or connected; the next one is taken; our leases are released, theirs untouched',
    setup: async (fx) => {
      await fx.world();
      await fx.addBuffer(T1, { probeLease: { owner: 'ums-host:1:abc', until: new Date(Date.now() + 5 * 60_000) } });
      await fx.addBuffer('919000911112');
    },
    run: (fx) => setup(fx, limitedReq()),
    expect: async (out, fx) => {
      await swappedTo('919000911112', null)(out, fx);
      expect(mockProbe.mock.calls.map(([m]: any[]) => m)).not.toContain(T1);
      expect((connectionManager.getClient as jest.Mock).mock.calls.map(([m]: any[]) => m)).not.toContain(T1);
      expect((await fx.buf(T1)).probeLease).toMatchObject({ owner: 'ums-host:1:abc' });
      expect((await fx.buf('919000911112')).probeLease).toBeUndefined();
    } },
  { id: 'DS-120', name: 'probe lease covers sibling borrows: a sibling spare leased by another process is skipped (not probed), answer says more candidates pending',
    setup: async (fx) => {
      await fx.world();
      await sibling(fx, ['919000920001', '919000920002', '919000920003'], (m) => (m === '919000920001' ? { probeLease: { owner: 'ums-host:1:abc', until: new Date(Date.now() + 5 * 60_000) } } : {}));
    },
    run: (fx) => setup(fx),
    expect: async (out, fx) => {
      expect(out).toMatchObject({ status: 'no_candidate', moreCandidatesPending: true });
      expect(mockProbe.mock.calls.map(([m]: any[]) => m)).not.toContain('919000920001');
      expect((await fx.client()).mobile).toBe(MAIN);
    } },
  { id: 'DS-121', name: 'error after our own cutover committed: the new main (this client\'s) gets no availableDate push and no second disconnect',
    setup: async (fx) => { await fx.world(); await fx.addBuffer(T1); },
    run: async (fx) => {
      jest.spyOn(fx.svc as any, 'handleReplacedClient').mockRejectedValue(new Error('boom after commit'));
      return setup(fx, limitedReq());
    },
    expect: async (out, fx) => {
      expect(out.status).toBe('failed');
      expect((await fx.client()).mobile).toBe(T1);
      expect((await fx.buf(T1)).availableDate).toBe('2026-01-01');
      expect(fx.buffer.createOrUpdate).not.toHaveBeenCalledWith(T1, expect.objectContaining({ availableDate: expect.any(String) }));
      // Only updateClientSession's own release of CMS's connection (tg-aut must be the sole user).
      expect((connectionManager.unregisterClient as jest.Mock).mock.calls.filter(([m]: any[]) => m === T1)).toHaveLength(1);
    } },
  { id: 'DS-122', name: 'upgrade pass has the owner backoff: 4 attempts in 5 h (0, 30, 90, 210 min), hard stop after 6 with one "Upgrade stopped"',
    setup: async (fx) => {
      await fx.world({ degraded: degradedState(4) }, { mainBuffer: harsh() });
      await fx.addBuffer(T3, limited(5));
      mockProbe.mockResolvedValue({ status: 'unknown', limitedUntil: null, connectFailed: true, error: 'TIMEOUT' });
    },
    run: async (fx) => {
      const clock = fakeClock();
      try {
        for (let i = 0; i < 10; i++) { await maintain(fx); clock.advance(30 * 60_000); }
        const in5h = mockProbe.mock.calls.length;
        const statuses: string[] = [];
        for (let i = 0; i < 12; i++) { statuses.push((await maintain(fx)).upgrade[0]?.status); clock.advance(9 * 60 * 60_000); }
        return { in5h, total: mockProbe.mock.calls.length, last: statuses.slice(-3) };
      } finally { clock.restore(); }
    },
    expect: async (r, fx) => {
      expect(r.in5h).toBe(4);
      expect(r.total).toBe(6);
      expect(r.last).toEqual(['stopped', 'stopped', 'stopped']);
      expect(fx.count('Upgrade stopped')).toBe(1);
      expect((await fx.client()).swapRetry).toMatchObject({ pass: 'upgrade', attempts: 6 });
    } },
  { id: 'DS-123', name: 'upgrade is bounded: 3 attempts per run; a marker clear (account meets tier 1) is not an attempt and still runs',
    setup: async (fx) => {
      for (let i = 0; i < 5; i++) {
        await fx.addClient(`deg${i}`, `91900096000${i}`, { dbcoll: `p${i}`, degraded: degradedState(4) }, { mainBuffer: harsh() });
        await fx.addBuffer(`91900095000${i}`, { clientId: `deg${i}`, ...limited(5) });
      }
      await fx.addClient('degok', '919000960009', { dbcoll: 'pok', degraded: degradedState(3) }, { mainBuffer: {} });
      mockProbe.mockResolvedValue({ status: 'unknown', limitedUntil: null, connectFailed: true, error: 'TIMEOUT' });
    },
    run: async (fx) => { const runSetup = jest.spyOn(fx.svc, 'runSetup'); const out = await maintain(fx); return { out, calls: runSetup.mock.calls.length }; },
    expect: (r) => {
      expect(UPGRADE_MAX_PER_RUN).toBe(3);
      expect(r.calls).toBe(3);
      expect(r.out.upgrade.filter((x: any) => x.status === 'no_candidate')).toHaveLength(3);
      expect(r.out.upgrade).toContainEqual({ clientId: 'degok', fromTier: 3, status: 'cleared' });
    } },
  { id: 'DS-124', name: 'job passes never create a backup session: a candidate without a stored distinct one is skipped, the next one is taken',
    setup: async (fx) => {
      await deadWorld(fx);
      await fx.addBuffer(T1, {}, { session: `s-${T1}` }); // users backup == the buffer's own session
      await fx.addBuffer('919000911112');
    },
    run: (fx) => maintain(fx),
    expect: async (out, fx) => {
      expect(out.rescue).toEqual([expect.objectContaining({ status: 'swapped', newMobile: '919000911112' })]);
      expect(fx.buffer.getOrEnsureDistinctUsersBackupSession).not.toHaveBeenCalled();
      expect(mockProbe.mock.calls.map(([m]: any[]) => m)).not.toContain(T1);
    } },
  { id: 'DS-125', name: 'refill trusts the main\'s stored SpamBot verdict only when <= 7 days old (60-day-old harsh: no swap, no restart)',
    setup: async (fx) => {
      await fx.world({ deployKey: 'http://deploy' }, { mainBuffer: { spamStatus: 'harsh', spamCheckedAt: new Date(Date.now() - 60 * DAY) } });
      await fx.addBuffer(T1);
    },
    run: async (fx) => {
      const stale = (await maintain(fx)).refill;
      const restartsWhileStale = (fetchWithTimeout as jest.Mock).mock.calls.length;
      await fx.bufferModel.updateOne({ mobile: MAIN }, { $set: { spamCheckedAt: new Date(Date.now() - 3 * DAY) } });
      const fresh = (await maintain(fx)).refill;
      return { stale, restartsWhileStale, fresh };
    },
    expect: (r) => {
      expect(MAIN_SPAM_STATUS_FRESH_MS).toBe(7 * DAY);
      expect(r.stale).toEqual([]);
      expect(r.restartsWhileStale).toBe(0);
      expect(r.fresh).toEqual([expect.objectContaining({ status: 'swapped', newMobile: T1 })]);
    } },
  { id: 'DS-126', name: 'one client\'s error is a "failed" row; the run goes on (rescue and refill)',
    setup: async (fx) => {
      await fx.addClient('bad1', '919000940001', { dbcoll: 'b1', deadMain: deadMain('919000940001') }, RETIRED);
      await fx.addClient('ok1', '919000940002', { dbcoll: 'o1', deadMain: deadMain('919000940002') }, RETIRED);
      await fx.addBuffer('919000940012', { clientId: 'ok1' });
      await fx.addClient('bad2', '919000940003', { dbcoll: 'b2' }, { mainBuffer: limited(4) });
      await fx.addClient('ok2', '919000940004', { dbcoll: 'o2' }, { mainBuffer: limited(4) });
      await fx.addBuffer('919000940014', { clientId: 'ok2' });
      const orig = Object.getPrototypeOf(fx.buffer).executeQuery;
      fx.buffer.executeQuery.mockImplementation(function (this: any, q: any, ...rest: any[]) {
        const ids = q?.clientId?.$in ?? [];
        if (ids.includes('bad1') || ids.includes('bad2')) return Promise.reject(new Error('mongo hiccup'));
        return orig.call(fx.buffer, q, ...rest);
      });
    },
    run: (fx) => maintain(fx),
    expect: (out) => {
      expect(out.rescue).toEqual([{ clientId: 'bad1', status: 'failed' }, expect.objectContaining({ clientId: 'ok1', status: 'swapped' })]);
      expect(out.refill).toEqual([{ clientId: 'bad2', status: 'failed' }, expect.objectContaining({ clientId: 'ok2', status: 'swapped' })]);
    } },
  { id: 'DS-127', name: 'connect (getClient) throws during the cutover: failed, client unchanged, candidate pushed 3 days, leases and setup registry cleared',
    setup: async (fx) => {
      await fx.world(); await fx.addBuffer(T1);
      (connectionManager.getClient as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED connect failed'));
    },
    run: (fx) => setup(fx),
    expect: async (out, fx) => {
      expect(out).toMatchObject({ status: 'failed', swapped: false, newMobile: T1 });
      const client = await fx.client();
      expect(client.mobile).toBe(MAIN);
      expect(client.swapLease).toBeUndefined();
      const t1 = await fx.buf(T1);
      expect(t1.availableDate > ClientHelperUtils.getTodayDateString()).toBe(true);
      expect(t1.inUse).toBe(false);
      expect(t1.probeLease).toBeUndefined();
      expect(fx.tg.setups.size).toBe(0);
      expect(fx.count('Swap failed')).toBe(1);
    } },
  { id: 'DS-128', name: 'several users docs per mobile: a partially expired main is retired on rescue (one "Inactivated"); a fully expired one is not (DS-78)',
    setup: async (fx) => {
      await fx.world({ deadMain: deadMain() }, { mainBuffer: { status: 'inactive', inUse: false, message: '[DEAD] FROZEN_METHOD_INVALID' } });
      fx.users.set(MAIN, [
        { mobile: MAIN, tgId: 'a', session: 'old', expired: true, twoFA: true },
        { mobile: MAIN, tgId: 'b', session: 'new', expired: false, twoFA: true },
      ]);
      await fx.addBuffer(T1);
    },
    run: (fx) => maintain(fx),
    expect: (out, fx) => {
      expect(out.rescue).toEqual([expect.objectContaining({ status: 'swapped', newMobile: T1 })]);
      expect(fx.usersService.expireAccount.mock.calls.filter(([m]: any[]) => m === MAIN)).toHaveLength(1);
      expect(fx.count('Inactivated')).toBe(1);
      expect(fx.users.get(MAIN).every((u: any) => u.expired)).toBe(true);
    } },
  { id: 'DS-129', name: 'amplification bound, 40 clients: per run at most 9 setups (3 per pass) and 54 SpamBot probes (rescue 3x9, upgrade 3x6, refill 3x3), 0 restarts without a swap',
    setup: async (fx) => {
      const later = '2099-01-01';
      for (let i = 0; i < 40; i++) {
        const id = `c${String(i).padStart(2, '0')}`;
        const mobile = `9190009${String(10000 + i)}`;
        const kind = i < 14 ? 'dead' : i < 27 ? 'degraded' : 'limited';
        await fx.addClient(id, mobile, {
          dbcoll: `p${i}`, deployKey: `http://deploy/${id}`,
          ...(kind === 'dead' ? { deadMain: deadMain(mobile) } : {}),
          ...(kind === 'degraded' ? { degraded: degradedState(4) } : {}),
        }, kind === 'dead' ? RETIRED : { mainBuffer: kind === 'degraded' ? harsh() : limited(4) });
        for (let j = 0; j < 3; j++) {
          await fx.addBuffer(`9180000${String(i).padStart(2, '0')}${j}1`, { clientId: id }); // tier 1, due
          await fx.addBuffer(`9180000${String(i).padStart(2, '0')}${j}2`, { clientId: id, availableDate: later }); // tier 1, future (dead fallback)
          await fx.addBuffer(`9180000${String(i).padStart(2, '0')}${j}3`, { clientId: id, ...limited(5) }); // tier 3
        }
      }
      mockProbe.mockResolvedValue({ status: 'unknown', limitedUntil: null, connectFailed: true, error: 'TIMEOUT' });
    },
    run: async (fx) => {
      const runSetup = jest.spyOn(fx.svc, 'runSetup');
      const out = await maintain(fx);
      return { out, setups: runSetup.mock.calls.length, probes: mockProbe.mock.calls.length, restarts: (fetchWithTimeout as jest.Mock).mock.calls.length };
    },
    expect: (r) => {
      expect(r.setups).toBe(9);
      expect(r.probes).toBeLessThanOrEqual(54);
      expect(r.probes).toBe(54); // this world hits the bound exactly
      expect(r.restarts).toBe(0);
      expect([r.out.rescue, r.out.upgrade, r.out.refill].map((p: any[]) => p.filter((x) => x.status === 'no_candidate').length)).toEqual([3, 3, 3]);
    } },
  // ── 11. Review 3: late reports from a replaced process, disabled, fixes, lease renewal ──────────────
  { id: 'DS-130', name: 'P1 late dead report (old bundle, no reportedMobile) right after a rescue cutover: ignored (cooldown), new main kept, nothing retired',
    setup: async (fx) => { await lateWorld(fx); },
    run: async (fx) => {
      const rescue = (await maintain(fx)).rescue;
      const late = await fx.restart().setupClient(CLIENT, deadReq());
      return { rescue, late };
    },
    expect: async (r, fx) => {
      expect(SWAP_REPORT_GRACE_MS).toBe(15 * 60_000);
      expect(r.rescue).toEqual([expect.objectContaining({ status: 'swapped', newMobile: T1 })]);
      expect(r.late).toMatchObject({ status: 'cooldown', swapped: false });
      expect(r.late.cooldownRemainingMs).toBeGreaterThan(14 * 60_000);
      const client = await fx.client();
      expect(client.mobile).toBe(T1);
      expect(client.deadMain).toBeUndefined();
      expect(client.swappedAt).toBeInstanceOf(Date);
      expect(fx.usersService.expireAccount.mock.calls.map(([m]: any[]) => m)).not.toContain(T1);
      expect(await fx.buf(T1)).toMatchObject({ status: 'active', inUse: true });
      expect((await fx.buf(T2)).inUse).toBe(false);
    } },
  { id: 'DS-131', name: 'new bundle: a report with reportedMobile = the replaced main is stale_report (even after the grace window); reportedMobile = the current main is not held back',
    setup: async (fx) => { await lateWorld(fx); },
    run: async (fx) => {
      const clock = fakeClock();
      try {
        await maintain(fx);
        const ums = fx.restart();
        const stale = await ums.setupClient(CLIENT, deadReq('FROZEN_METHOD_INVALID', { reportedMobile: MAIN }));
        clock.advance(20 * 60_000);
        const staleLater = await ums.setupClient(CLIENT, { ...limitedReq(), reportedMobile: MAIN });
        const afterStale = await fx.client();
        clock.advance(-19 * 60_000); // back to 1 min after the cutover: a genuine report from the new main
        const current = await ums.setupClient(CLIENT, deadReq('FROZEN_METHOD_INVALID', { reportedMobile: T1 }));
        return { stale, staleLater, afterStale, current };
      } finally { clock.restore(); }
    },
    expect: async (r, fx) => {
      for (const s of [r.stale, r.staleLater]) expect(s).toMatchObject({ status: 'stale_report', swapped: false, existingMobile: T1 });
      expect(r.afterStale.mobile).toBe(T1);
      expect(r.afterStale.deadMain).toBeUndefined();
      expect(r.current).toMatchObject({ status: 'swapped', existingMobile: T1, newMobile: T2 });
      expect((await fx.client()).mobile).toBe(T2);
    } },
  { id: 'DS-132', name: 'P2 late report while the cutover still holds the lease: no deadMain on the new main, so the rescue 36 min later does nothing',
    setup: async (fx) => { await lateWorld(fx); },
    run: async (fx) => {
      const clock = fakeClock();
      try {
        await maintain(fx);
        await fx.clientModel.updateOne({ clientId: CLIENT }, { $set: { swapLease: { owner: 'cms:1:x', until: new Date(Date.now() + 5 * 60_000) } } });
        const ums = fx.restart();
        const oldBundle = await ums.setupClient(CLIENT, deadReq());
        const newBundle = await ums.setupClient(CLIENT, deadReq('FROZEN_METHOD_INVALID', { reportedMobile: MAIN }));
        const mid = await fx.client();
        await fx.clientModel.updateOne({ clientId: CLIENT }, { $unset: { swapLease: '' } });
        clock.advance(36 * 60_000);
        const rescue = (await fx.restart().runSwapMaintenance()).rescue;
        return { oldBundle, newBundle, mid, rescue };
      } finally { clock.restore(); }
    },
    expect: async (r, fx) => {
      expect(r.oldBundle.status).toBe('cooldown');
      expect(r.newBundle.status).toBe('stale_report');
      expect(r.mid.deadMain).toBeUndefined();
      expect(r.rescue).toEqual([]);
      expect((await fx.client()).mobile).toBe(T1);
      expect(fx.usersService.expireAccount.mock.calls.map(([m]: any[]) => m)).not.toContain(T1);
    } },
  { id: 'DS-133', name: 'late prose SpamBot trigger (old bundle) right after a cutover: no swap within 15 min; with reportedMobile = old main: stale_report',
    setup: async (fx) => { await fx.world(); await fx.addBuffer(T1); await fx.addBuffer(T2); },
    run: async (fx) => {
      const clock = fakeClock();
      try {
        const first = await setup(fx);
        const ums = fx.restart();
        clock.advance(5 * 60_000);
        const oldBundle = await ums.setupClient(CLIENT, limitedReq());
        const newBundle = await ums.setupClient(CLIENT, { ...limitedReq(), reportedMobile: MAIN });
        clock.advance(9 * 60_000 + 59_000);
        const at14 = await ums.setupClient(CLIENT, limitedReq());
        return { first, oldBundle, newBundle, at14, client: await fx.client(), t2: await fx.buf(T2) };
      } finally { clock.restore(); }
    },
    expect: (r) => {
      expect(r.first).toMatchObject({ status: 'swapped', newMobile: T1 });
      expect(r.oldBundle).toMatchObject({ status: 'cooldown', swapped: false });
      expect(r.at14).toMatchObject({ status: 'cooldown', swapped: false });
      expect(r.newBundle).toMatchObject({ status: 'stale_report', swapped: false, existingMobile: T1 });
      expect(r.client.mobile).toBe(T1);
      expect(r.t2.inUse).toBe(false);
    } },
  { id: 'DS-134', name: 'old bundle whose NEW main really is dead: handoff tries at 0, 2, 6, 14 min are ignored, the 30-min one (after the 15-min window) records deadMain and swaps',
    setup: async (fx) => { await fx.world(); await fx.addBuffer(T1); await fx.addBuffer(T2); },
    run: async (fx) => {
      const clock = fakeClock();
      try {
        await setup(fx);
        const ums = fx.restart();
        const early: string[] = [];
        for (const at of [0, 2, 6, 14]) {
          clock.advance(at * 60_000 - clock.offset);
          early.push((await ums.setupClient(CLIENT, deadReq())).status);
          expect((await fx.client()).deadMain).toBeUndefined();
        }
        clock.advance(30 * 60_000 - clock.offset);
        const late = await ums.setupClient(CLIENT, deadReq());
        return { early, late };
      } finally { clock.restore(); }
    },
    expect: async (r, fx) => {
      expect(r.early).toEqual(['cooldown', 'cooldown', 'cooldown', 'cooldown']);
      expect(r.late).toMatchObject({ status: 'swapped', existingMobile: T1, newMobile: T2 });
      expect((await fx.client()).mobile).toBe(T2);
    } },
  { id: 'DS-135', name: 'P3 AUTO_CLIENT_SETUP off: "disabled" is not a rescue attempt: no backoff, no hard stop, no "Rescue stopped"; switched on, attempt 1',
    setup: async (fx) => { await deadWorld(fx); },
    run: async (fx) => {
      process.env.AUTO_CLIENT_SETUP = 'false';
      const clock = fakeClock();
      const seen = new Set<string>();
      try {
        for (let i = 0; i < 40; i++) { const r = (await maintain(fx)).rescue[0]; seen.add(`${r?.status}:${r?.attempts ?? ''}`); clock.advance(30 * 60_000); }
        const swapRetry = (await fx.client()).swapRetry;
        process.env.AUTO_CLIENT_SETUP = 'true';
        const on = (await maintain(fx)).rescue[0];
        return { seen: [...seen], swapRetry, on };
      } finally { clock.restore(); }
    },
    expect: (r, fx) => {
      expect(r.seen).toEqual(['disabled:']);
      expect(r.swapRetry).toBeUndefined();
      expect(fx.count('Rescue stopped')).toBe(0);
      expect(r.on).toMatchObject({ status: 'no_candidate', attempts: 1 });
    } },
  { id: 'DS-136', name: 'P4 update(): a new session (manual re-login) clears deadMain, so rescue leaves the fixed main alone; an unchanged session or other fields keep it',
    setup: async (fx) => { await fx.world({ deadMain: deadMain() }, {}); await fx.addBuffer(T1); },
    run: async (fx) => {
      await fx.svc.update(CLIENT, { name: 'Sneha R' } as any);
      const afterName = (await fx.client()).deadMain;
      await fx.svc.update(CLIENT, { session: (await fx.client()).session } as any);
      const afterSame = (await fx.client()).deadMain;
      await fx.svc.update(CLIENT, { session: 'main-relogged' } as any);
      const afterNew = (await fx.client()).deadMain;
      return { afterName, afterSame, afterNew, rescue: (await maintain(fx)).rescue };
    },
    expect: (r, fx) => {
      expect(r.afterName).toMatchObject({ mobile: MAIN });
      expect(r.afterSame).toMatchObject({ mobile: MAIN });
      expect(r.afterNew).toBeUndefined();
      expect(r.rescue).toEqual([]);
      expect(fx.usersService.expireAccount).not.toHaveBeenCalled();
    } },
  { id: 'DS-137', name: 'P5 a pinned ?mobile= dead call (operator) writes no deadMain',
    setup: async (fx) => { await fx.world(); await fx.addBuffer(T3, limited(3)); },
    run: (fx) => setup(fx, deadReq('FROZEN_METHOD_INVALID', { mobile: '919000977777' })),
    expect: async (out, fx) => {
      expect(out.status).toBe('no_candidate');
      expect((await fx.client()).deadMain).toBeUndefined();
    } },
  { id: 'DS-138', name: 'a long setup renews its leases: 18 min in (TTL 10) another process still gets cooldown and the candidate is still leased; both released after',
    setup: async (fx) => { await fx.world(); await fx.addBuffer(T1); },
    run: async (fx) => {
      (fx.svc as any).leaseRenewMs = 20;
      const other: any = new ClientService(fx.clientModel as any, new FakeTelegram() as any, fx.buffer, fx.usersService as any);
      other.isInitialized = true;
      jest.spyOn(other, 'performPostUpdateTasks').mockImplementation(() => undefined);
      const clock = fakeClock();
      const seen: any = {};
      let stalled = false;
      try {
        mockProbe.mockImplementation(async (m: string) => {
          if (!stalled) {
            stalled = true;
            for (let i = 0; i < 9; i++) { clock.advance(2 * 60_000); await new Promise((res) => setTimeout(res, 60)); }
            seen.at = Date.now();
            seen.swapLease = (await fx.client()).swapLease;
            seen.probeLease = (await fx.buf(m)).probeLease;
            seen.other = await other.setupClient(CLIENT, limitedReq());
          }
          return defaultProbe(await fx.bufferModel.findOne({ mobile: m }).lean());
        });
        const out = await setup(fx);
        return { out, seen };
      } finally { clock.restore(); }
    },
    expect: async (r, fx) => {
      expect(SWAP_LEASE_RENEW_MS).toBe(2 * 60_000);
      expect(new Date(r.seen.swapLease.until).getTime()).toBeGreaterThan(r.seen.at);
      expect(new Date(r.seen.probeLease.until).getTime()).toBeGreaterThan(r.seen.at);
      expect(r.seen.other).toMatchObject({ status: 'cooldown', message: 'Client setup is in progress in another CMS process' });
      expect(r.out).toMatchObject({ status: 'swapped', newMobile: T1 });
      expect((await fx.client()).swapLease).toBeUndefined();
      expect((await fx.buf(T1)).probeLease).toBeUndefined();
    } },
  { id: 'DS-139', name: 'an unparseable reportedMobile counts as absent (old-bundle rules), never a 400 or a stale_report',
    setup: async (fx) => { await fx.world(); await fx.addBuffer(T1); },
    run: (fx) => setup(fx, deadReq('FROZEN_METHOD_INVALID', { reportedMobile: 'n/a' })),
    expect: async (out, fx) => {
      expect(out).toMatchObject({ status: 'swapped', newMobile: T1 });
    } },
  // ── 12. Review 4 ────────────────────────────────────────────────────────────────────────────────────
  { id: 'DS-140', name: 'update() with a new session opens the 15-min window: a late dead report for the same mobile (old session) gets cooldown, no swap; after it the report goes through',
    setup: async (fx) => {
      await fx.world({ deadMain: { mobile: MAIN, reason: 'AUTH_KEY_UNREGISTERED', at: new Date(Date.now() - 5 * 60_000) } });
      await fx.addBuffer(T1);
    },
    run: async (fx) => {
      const clock = fakeClock();
      try {
        await fx.svc.update(CLIENT, { session: 'fixed-session' } as any);
        const mid = await fx.client();
        const ums = fx.restart();
        clock.advance(2 * 60_000);
        const late = await ums.setupClient(CLIENT, deadReq('AUTH_KEY_UNREGISTERED', { reportedMobile: MAIN }));
        const oldBundle = await ums.setupClient(CLIENT, deadReq('AUTH_KEY_UNREGISTERED'));
        const during = await fx.client();
        clock.advance(29 * 60_000);
        const after = await ums.setupClient(CLIENT, deadReq('AUTH_KEY_UNREGISTERED', { reportedMobile: MAIN }));
        return { mid, late, oldBundle, during, after };
      } finally { clock.restore(); }
    },
    expect: async (r, fx) => {
      expect(r.mid.swappedAt).toBeInstanceOf(Date);
      expect(r.mid.deadMain).toBeUndefined();
      expect(r.late).toMatchObject({ status: 'cooldown', swapped: false });
      expect(r.oldBundle).toMatchObject({ status: 'cooldown', swapped: false });
      expect(r.during).toMatchObject({ mobile: MAIN, session: 'fixed-session' });
      expect(r.during.deadMain).toBeUndefined();
      expect(r.after).toMatchObject({ status: 'swapped', existingMobile: MAIN, newMobile: T1 });
      expect((await fx.client()).sessionChangedAt).toBeUndefined(); // the cutover closes it
    } },
  { id: 'DS-141', name: 'reportedMobile through the real ValidationPipe (main.ts options) is never a 400: repeated param -> first element; number / object implicitly stringified (an unparseable one counts as absent, DS-139)',
    run: async () => {
      const pipe = new ValidationPipe({ transform: true, transformOptions: { enableImplicitConversion: true } });
      const shapes: Array<[string, unknown]> = [
        ['string', MAIN], ['garbage', 'abc'], ['empty', ''], ['repeated', [MAIN, T1]], ['object', { a: '1' }], ['number', 919000913438],
      ];
      const out: Record<string, unknown> = {};
      for (const [label, value] of shapes) {
        try {
          out[label] = ((await pipe.transform({ reportedMobile: value, reason: 'FROZEN_METHOD_INVALID' }, { type: 'query', metatype: SetupClientQueryDto })) as any).reportedMobile ?? null;
        } catch (e: any) { out[label] = `ERR ${e?.status}`; }
      }
      return out;
    },
    expect: (out) => {
      expect(out).toEqual({ string: MAIN, garbage: 'abc', empty: '', repeated: MAIN, object: '[object Object]', number: MAIN });
    } },
];

describe('degraded swap regression suite (DS matrix)', () => {
  let ctx: MongoTestContext;
  let fx: Fixture;
  const saved = { auto: process.env.AUTO_CLIENT_SETUP, tiers: process.env.DEGRADED_SWAP_TIERS };

  beforeAll(async () => { ctx = await startMongo('degradedSwapRegression', true); }, 120_000);
  afterAll(async () => {
    for (const [k, v] of [['AUTO_CLIENT_SETUP', saved.auto], ['DEGRADED_SWAP_TIERS', saved.tiers]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    if (ctx) await stopMongo(ctx);
  });

  test('row ids are unique and ordered', () => {
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const num = (id: string) => Number(id.slice(3));
    expect([...ids].sort((a, b) => num(a) - num(b))).toEqual(ids);
  });

  test.each(rows.map((r) => [`${r.id} ${r.name}`, r] as const))('%s', async (_label, row) => {
    jest.clearAllMocks();
    mockProbe.mockReset();
    process.env.AUTO_CLIENT_SETUP = 'true';
    delete process.env.DEGRADED_SWAP_TIERS;
    Object.assign(process.env, row.env || {});
    fx = await makeFixture(ctx.connection, {
      probe: mockProbe, notice: sendBotNotice as jest.Mock, fetch: fetchWithTimeout as jest.Mock,
      connection: connectionManager as any,
    });
    await row.setup?.(fx);
    const out = await row.run(fx);
    await row.expect(out, fx);
  }, 60_000);
});
