/**
 * Possible double credit rule. The four true-case rows are the prod paymentProofs rows (2026-11-09/10) trimmed to the
 * fields the rule reads; OCR text shortened but with the wording that matters kept verbatim.
 */
import {
    DoubleCreditRow, differentRealUtrs, doubleCreditIndex, findDoubleCredits, isLiveCredit, notProvenWhy, printedClock, utrFormat,
} from '../payment-proofs.double-credit';

const credited = { outcome: 'credited' };

const meghana300768: DoubleCreditRow = {
    proofId: 'meghana2-6809433050-300768', chatId: '6809433050', clientId: 'meghana2', telegramMsgId: 300768, amount: 100, creditAmount: 100,
    servedAt: new Date('2026-11-09T09:33:06.408Z'), verdict: credited, imageSha256: '41ca46e7',
    time: { state: 'known', epochMs: 1794204180000 },
    ocr: { precheckText: 'My Statements\t2 Filters •\r\nNovember 2026\r\nPaid to\r\nMrs RAVVA LAKSHMI\t·100\r\n1 min ago\tDebited from\r\nPaid to\r\nMrs RAVVA LAKSHMI\t·50\r\n24 mins ago' },
};
const meghana301161: DoubleCreditRow = {
    proofId: 'meghana2-6809433050-301161', chatId: '6809433050', clientId: 'meghana2', telegramMsgId: 301161, amount: 100, creditAmount: 100,
    servedAt: new Date('2026-11-09T14:21:44.926Z'), verdict: credited, imageSha256: '7108c033', utr: 'T2611091131442440992013',
    time: { state: 'known', epochMs: 1794204104000 },
    ocr: { precheckText: '19:50 Mc Mc\r\nTransaction Successful\r\n11:31 AM on 09 Nov 2026\r\nPaid to\r\nMrs RAVVA LAKSHMI\t·100\r\nPhonePe Transaction ID\r\nT2611091131442440992013\r\nUTR: 018137973934' },
};
const kavya61117: DoubleCreditRow = {
    proofId: 'kavya1-5299793102-61117', chatId: '5299793102', clientId: 'kavya1', telegramMsgId: 61117, amount: 40, creditAmount: 40,
    servedAt: new Date('2026-11-10T03:24:43.254Z'), verdict: credited, imageSha256: 'c867761b',
    time: { state: 'known', epochMs: 1794281040000 },
    ocr: { precheckText: 'Girls Community\t·40\r\npaytmqrou68em@ptys\r\nJust now\tVia UPI' },
};
const kavya61124: DoubleCreditRow = {
    proofId: 'kavya1-5299793102-61124', chatId: '5299793102', clientId: 'kavya1', telegramMsgId: 61124, amount: 40, creditAmount: 40,
    servedAt: new Date('2026-11-10T03:25:16.941Z'), verdict: credited, imageSha256: '830b418d', utr: '006828353077',
    time: { state: 'known', epochMs: 1794280920000 },
    ocr: { precheckText: 'Payment successrul\r\n10 Nov 2026, 8:52 AM\r\n·40\r\nUPI transaction ID\r\n006828353077' },
};

let n = 0;
const row = (over: Partial<DoubleCreditRow>): DoubleCreditRow => ({
    proofId: `c1-777-${++n}`, chatId: '777', clientId: 'c1', amount: 50, creditAmount: 50, verdict: credited,
    servedAt: new Date('2026-11-10T10:00:00Z'), imageSha256: `sha-${n}`, time: { state: 'unknown' }, ...over,
});

describe('possible double credit rule', () => {
    it('true case meghana2 6809433050: 300768 ("1 min ago") + 301161 (printed 11:31 AM), ₹100', () => {
        expect(printedClock(meghana300768)).toBeNull();
        expect(printedClock(meghana301161)).toBe(1794204104000);
        const pairs = findDoubleCredits([meghana301161, meghana300768]);
        expect(pairs).toEqual([expect.objectContaining({
            chatId: '6809433050', amount: 100, first: 'meghana2-6809433050-300768', second: 'meghana2-6809433050-301161',
        })]);
        expect(pairs[0].why).toMatch(/relative/);
    });

    it('true case kavya1 5299793102: 61117 ("Just now") + 61124 (printed 8:52 AM), ₹40', () => {
        const pairs = findDoubleCredits([kavya61117, kavya61124]);
        expect(pairs.map((p) => [p.first, p.second, p.amount])).toEqual([['kavya1-5299793102-61117', 'kavya1-5299793102-61124', 40]]);
    });

    it('not double: two credits with different 12-digit UTRs', () => {
        const a = row({ utr: '719414939436' });
        const b = row({ utr: '391884040074', servedAt: new Date('2026-11-10T11:00:00Z') });
        expect(differentRealUtrs(a, b)).toBe(true);
        expect(findDoubleCredits([a, b])).toEqual([]);
    });

    it('not double: both printed clocks readable and more than 1 min apart (no UTR)', () => {
        const a = row({ time: { state: 'known', epochMs: Date.parse('2026-11-10T09:52:00Z') }, ocr: { precheckText: '10 Nov 2026, 9:52 AM' } });
        const b = row({ time: { state: 'known', epochMs: Date.parse('2026-11-10T09:58:00Z') }, servedAt: new Date('2026-11-10T10:05:00Z') });
        expect(findDoubleCredits([a, b])).toEqual([]);
    });

    it('double: printed clocks within 1 min', () => {
        const a = row({ time: { state: 'known', epochMs: Date.parse('2026-11-10T09:52:00Z') } });
        const b = row({ time: { state: 'known', epochMs: Date.parse('2026-11-10T09:52:40Z') }, servedAt: new Date('2026-11-10T12:00:00Z') });
        expect(findDoubleCredits([a, b]).map((p) => p.why)).toEqual(['same printed minute']);
    });

    it('double: same UTR, or same file, even with different clocks', () => {
        const a = row({ utr: '719414939436', time: { state: 'known', epochMs: 1 } });
        const b = row({ utr: '719414939436', time: { state: 'known', epochMs: 10 * 60_000 }, servedAt: new Date('2026-11-10T12:00:00Z') });
        expect(notProvenWhy(a, b)).toBe('same UTR');
        const c = row({ imageSha256: 'same' });
        const d = row({ imageSha256: 'same', utr: '391884040074', servedAt: new Date('2026-11-10T12:00:00Z') });
        expect(notProvenWhy(c, d)).toBe('same file');
    });

    it('UTRs of different formats or one digit apart do not prove two payments', () => {
        expect(differentRealUtrs(row({ utr: '871640485297' }), row({ utr: 'T2611102322113712069883' }))).toBe(false);
        expect(differentRealUtrs(row({ utr: '871640485297' }), row({ utr: '871640485298' }))).toBe(false); // OCR digit
        expect(differentRealUtrs(row({ utr: '12345678' }), row({ utr: '87654321' }))).toBe(false); // partial reads
        expect(utrFormat('000000000000')).toBeNull();
        expect(utrFormat('T2611091131442440992013')).toBe('phonepe23');
    });

    it('different amounts, beyond 48 h, uncredited or not credited: no pair', () => {
        const base = row({});
        expect(findDoubleCredits([base, row({ amount: 60, creditAmount: 60 })])).toEqual([]);
        expect(findDoubleCredits([base, row({ servedAt: new Date('2026-11-12T10:00:01Z') })])).toEqual([]);
        expect(findDoubleCredits([base, row({ uncredited: { state: 'done' } })])).toEqual([]);
        expect(findDoubleCredits([base, row({ verdict: { outcome: 'repeat' } })])).toEqual([]);
        expect(findDoubleCredits([base, row({ servedAt: null })])).toEqual([]);
        expect(findDoubleCredits([base, row({ chatId: '778' })])).toEqual([]);
        // inside 48 h it pairs
        expect(findDoubleCredits([base, row({ servedAt: new Date('2026-11-12T09:59:59Z') })])).toHaveLength(1);
    });

    it('a pending / failed uncredit still counts as a live credit; time.relative from new builds marks relative', () => {
        expect(isLiveCredit(row({ uncredited: { state: 'pending' } }))).toBe(true);
        expect(printedClock(row({ time: { state: 'known', epochMs: 5, relative: true } }))).toBeNull();
    });

    it('index lists both sides of each pair', () => {
        const idx = doubleCreditIndex(findDoubleCredits([meghana300768, meghana301161, kavya61117, kavya61124]));
        expect(idx.get('meghana2-6809433050-301161')?.withProofIds).toEqual(['meghana2-6809433050-300768']);
        expect(idx.get('kavya1-5299793102-61117')?.withProofIds).toEqual(['kavya1-5299793102-61124']);
        expect(idx.size).toBe(4);
    });
});
