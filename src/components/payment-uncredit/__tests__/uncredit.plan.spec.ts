/** Pure userData rules (design section 5). The service spec runs them against Mongo; these pin the ladder mirror. */
import { callInProgress, LIVE_HEARTBEAT_MS, liveCall, owedShowCap, planRecredit, planUncredit, PROGRESS_CHECKPOINT_MS } from '../uncredit.plan';

describe('uncredit plan', () => {
    it('owedShowCap mirrors tg-aut ladder FULL_SHOW_ROWS', () => {
        expect([0, 150, 199, 200, 249, 250, 349, 350, 599, 600, 1000].map(owedShowCap)).toEqual([0, 0, 0, 3, 3, 5, 5, 7, 7, 9, 9]);
    });

    describe('live show (callProgress heartbeat + endedAt)', () => {
        const now = 1_000_000_000;
        it('the heartbeat window is 3 missed tg-aut checkpoints (45 s), not 10 min', () => {
            expect(PROGRESS_CHECKPOINT_MS).toBe(15_000);
            expect(LIVE_HEARTBEAT_MS).toBe(3 * PROGRESS_CHECKPOINT_MS);
        });
        it('no progress / not an object: not live', () => {
            expect(callInProgress(undefined, now)).toBe(false);
            expect(callInProgress(null, now)).toBe(false);
            expect(callInProgress({ a: null }, now)).toBe(false);
        });
        it('a fresh heartbeat (no endedAt, not completed) is live, with the seconds since it', () => {
            expect(callInProgress({ a: { completed: false, updatedAt: now - 10_000 } }, now)).toBe(true);
            expect(liveCall({ v9: { positionSec: 40, durationSec: 300, completed: false, updatedAt: now - 12_400 } }, now)).toEqual({ videoId: 'v9', secondsSinceHeartbeat: 12 });
        });
        it('a stale heartbeat (> 45 s, a process that died without writing endedAt) is not live', () => {
            expect(callInProgress({ a: { completed: false, updatedAt: now - 44_000 } }, now)).toBe(true);
            expect(callInProgress({ a: { completed: false, updatedAt: now - 46_000 } }, now)).toBe(false);
            expect(callInProgress({ a: { completed: false, updatedAt: now - 9 * 60_000 } }, now)).toBe(false);
        });
        it('an entry with endedAt is not live, even when written a second ago', () => {
            expect(callInProgress({ a: { completed: false, updatedAt: now - 1_000, endedAt: now - 1_000, endReason: 'dropped' } }, now)).toBe(false);
            expect(callInProgress({ a: { completed: false, updatedAt: now, endedAt: now, endReason: 'hangup' } }, now)).toBe(false);
        });
        it('completed is not live', () => {
            expect(callInProgress({ a: { completed: true, updatedAt: now } }, now)).toBe(false);
        });
        it('divya2 2026-11-08 (old shape, no endedAt): 13:29:26Z final save, call over: live until 13:30:11Z, not to 13:39', () => {
            const at = Date.parse('2026-11-08T13:29:26Z');
            const row = { 202: { positionSec: 81, durationSec: 309, updatedAt: at, completed: false, attempts: 2 } };
            expect(callInProgress(row, at + 15_000)).toBe(true);
            expect(callInProgress(row, at + 46_000)).toBe(false);
            expect(callInProgress(row, Date.parse('2026-11-08T13:35:00Z'))).toBe(false);
        });
        it('divya2 shape written by the new tg-aut (endedAt + endReason): not live at once', () => {
            const at = Date.parse('2026-11-08T13:29:26Z');
            const row = { 202: { positionSec: 81, durationSec: 309, updatedAt: at, completed: false, attempts: 2, endedAt: at, endReason: 'hangup' } };
            expect(callInProgress(row, at + 1_000)).toBe(false);
        });
        it('one live entry among ended ones is enough', () => {
            const row = { 1: { completed: true, updatedAt: now - 5_000 }, 2: { completed: false, updatedAt: now - 5_000, endedAt: now - 5_000 }, 3: { completed: false, updatedAt: now - 20_000 } };
            expect(liveCall(row, now)).toEqual({ videoId: '3', secondsSinceHeartbeat: 20 });
        });
    });

    it('older genuine payments outside the 7-day proofs keep the demo band when the voided one was the only visible', () => {
        // lifetimePaid 400 = 350 voided + 50 older (not in R): h 350 -> 50, not 0.
        const p = planUncredit({ _id: 1, lifetimePaid: 400, lifetimeCredits: 2, highestPayAmount: 350, payAmount: 400, callTime: 0 }, { amount: 350, servedAtMs: 10, others: [] });
        expect(p.set).toEqual({ highestPayAmount: 50, payAmount: 50 });
        expect(p.inc).toEqual({ lifetimePaid: -350, lifetimeCredits: -1 });
        // nothing else ever paid: tier 0
        const q = planUncredit({ _id: 1, lifetimePaid: 350, lifetimeCredits: 1, highestPayAmount: 350, payAmount: 350, callTime: 0 }, { amount: 350, servedAtMs: 10, others: [] });
        expect(q.set).toEqual({ highestPayAmount: 0, payAmount: 0 });
    });

    it('a later genuine bigger payment keeps the tier; delivered caps the balance at the new tier and ends the cycle', () => {
        const p = planUncredit({ _id: 1, lifetimePaid: 950, lifetimeCredits: 2, highestPayAmount: 600, payAmount: 150, fullShow: 2, showsPaidTo: 4, callTime: 100 }, { amount: 350, servedAtMs: 10, others: [600] });
        expect(p.set).toEqual({ fullShow: 9, secondShow: true, demoGiven: true });
        expect(p.guard).toMatchObject({ fullShow: 2, secondShow: null, demoGiven: null, lifetimePaid: 950, lifetimeCredits: 2 });
    });

    it('guards each field on the value read; recredit restores only fields still holding what it wrote and unsets absent ones', () => {
        const row = { _id: 7, lifetimePaid: 200, highestPayAmount: 200, payAmount: 150, callTime: 0 };
        const p = planUncredit(row, { amount: 200, servedAtMs: 10, others: [] });
        expect(p.undo.before).toEqual({ highestPayAmount: 200, payAmount: 150 });
        const after = { ...row, lifetimePaid: 0, highestPayAmount: 0, payAmount: 0 };
        const r = planRecredit(after, p.undo);
        expect(r.update).toEqual({ $set: { highestPayAmount: 200, payAmount: 150 }, $inc: { lifetimePaid: 200 } });
        expect(r.filter).toEqual({ _id: 7, highestPayAmount: 0, payAmount: 0 });
        const moved = planRecredit({ ...after, payAmount: 100 }, p.undo);
        expect(moved.skipped).toEqual(['payAmount']);
        const d = planUncredit({ _id: 8, highestPayAmount: 350, callTime: 100, fullShow: 0 }, { amount: 350, servedAtMs: 10, others: [] });
        expect(planRecredit({ _id: 8, highestPayAmount: 0, fullShow: 7, secondShow: true, demoGiven: true }, d.undo).update)
            .toEqual({ $set: { highestPayAmount: 350, fullShow: 0 }, $unset: { secondShow: '', demoGiven: '' } });
    });
});
