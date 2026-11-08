/** Pure userData rules (design section 5). The service spec runs them against Mongo; these pin the ladder mirror. */
import { callInProgress, owedShowCap, planRecredit, planUncredit } from '../uncredit.plan';

describe('uncredit plan', () => {
    it('owedShowCap mirrors tg-aut ladder FULL_SHOW_ROWS', () => {
        expect([0, 150, 199, 200, 249, 250, 349, 350, 599, 600, 1000].map(owedShowCap)).toEqual([0, 0, 0, 3, 3, 5, 5, 7, 7, 9, 9]);
    });

    it('callInProgress: an entry not completed and updated within 10 min', () => {
        const now = 1_000_000_000;
        expect(callInProgress(undefined, now)).toBe(false);
        expect(callInProgress({ a: { completed: false, updatedAt: now - 9 * 60_000 } }, now)).toBe(true);
        expect(callInProgress({ a: { completed: false, updatedAt: now - 11 * 60_000 } }, now)).toBe(false);
        expect(callInProgress({ a: { completed: true, updatedAt: now } }, now)).toBe(false);
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
