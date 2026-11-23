import { BadRequestException, NotFoundException } from '@nestjs/common';
import { accountsOfIds, bankingTag, isLaxmiName, foldUpiRevenue, foldUpiRevenueWithCredits, knownUpiIds, mainQrIds, maskUpi, nameMatchedId, matchUpi, UPI_PROOF_PROJECTION, UpiProofRow, upiRowItems, upiRowKey } from '../monitor-upi';
import { parseUpiRowKey, parseUpiWindow } from '../monitor.controller';
import { MonitorService } from '../monitor.service';

// Synthetic ids shaped like ours (bharatpe merchant, paytm QR, airtel pair that shares its last 4).
const RL = 'BHARATPE.9000012345@fbpe';
const QR_A = 'paytmqr2810050501011abcdefgh9q@paytm';
const QR_B = 'paytmqr2810050501011zyxwvuts7k@paytm';
const GP_LONG = 'lakshmistores@airtel';
const GP_SHORT = 'stores@airtel';
const upiDocs = [{ _id: 'x', paytm1: RL, qrId: QR_A, qrId1: QR_B, gpay2: GP_SHORT, extra: [GP_LONG], note: 'no id' }];
const clients = [
  { clientId: 'c1', qrId: RL, gpayId: GP_LONG },
  { clientId: 'c2', qrId: RL, gpayId: GP_SHORT },
  { clientId: 'c3', qrId: QR_A, gpayId: GP_SHORT },
  { clientId: 'c4', qrId: 'unused9999@ptys', gpayId: null },
];
const known = knownUpiIds(upiDocs, clients);
const normalise = (v: string) => v.toLowerCase();
const p = (over: Partial<UpiProofRow>): UpiProofRow => ({ chatId: 'u1', clientId: 'c1', creditAmount: 100, ...over });

describe('monitor-upi masking', () => {
  it('keeps only the last 4 of the local part plus the handle', () => {
    expect(maskUpi(RL)).toBe('****2345@fbpe');
    expect(maskUpi(`${QR_A}&mc=1`)).toBe('****gh9q@paytm');
    expect(maskUpi('ABCD 1234')).toBe('****1234');
  });

  it('a folded response carries no full id, no chat id and no payee name', () => {
    const out = foldUpiRevenue({
      proofs: [p({ chatId: '7712345678', payeeUpiId: RL, payeeName: 'Mrs RAVVA LAKSHMI' }), p({ chatId: '7798765432', payeeUpiId: 'someone@ybl', payeeName: 'Priya Sharma' })],
      fakeChats: new Set(),
      upiDocs,
      clients,
    });
    const text = JSON.stringify(out);
    for (const secret of [RL.toLowerCase(), '9000012345', 'someone', '7712345678', '7798765432', 'ravva', 'priya', QR_A.toLowerCase()]) expect(text.toLowerCase()).not.toContain(secret);
  });

  it('never projects image or ocr', () => {
    expect(Object.keys(UPI_PROOF_PROJECTION)).not.toEqual(expect.arrayContaining(['image']));
    expect(Object.keys(UPI_PROOF_PROJECTION).some((k) => /image|ocr/i.test(k))).toBe(false);
  });
});

describe('monitor-upi matching', () => {
  it('exact, case and spaces and QR suffix ignored', () => {
    expect(matchUpi(' bharatpe.9000012345@FBPE ', known)).toBe(RL.toLowerCase());
    expect(matchUpi(`${QR_A}&tn=x`, known)).toBe(QR_A.toLowerCase());
  });

  it('a cut or partial id maps to the one id containing it', () => {
    expect(matchUpi('9000012345@fbpe', known)).toBe(RL.toLowerCase());
    expect(matchUpi('.9000012345@fbpe', known)).toBe(RL.toLowerCase());
    expect(matchUpi('bharatpe9000012345@f bpe', known)).toBe(RL.toLowerCase());
    expect(matchUpi('paytmqr2810050501011abcd...', known)).toBe(QR_A.toLowerCase());
    expect(matchUpi('gh9q@pa...', known)).toBe(QR_A.toLowerCase());
  });

  it('a masked id maps when its visible characters fit one id in place', () => {
    expect(matchUpi('bharatpe.******2345@fbpe', known)).toBe(RL.toLowerCase());
    expect(matchUpi('bharatpe.······2345@fbpe', known)).toBe(RL.toLowerCase());
    expect(matchUpi('paytmqr********01011abcdefgh9q@paytm', known)).toBe(QR_A.toLowerCase());
    expect(matchUpi('paytmqr........01011abcdefgh9q@paytm', known)).toBe(QR_A.toLowerCase());
    expect(matchUpi('paytmqr…1zyx…', known)).toBe(QR_B.toLowerCase());
    expect(matchUpi('....gh9q@paytm', known)).toBe(QR_A.toLowerCase());
    expect(matchUpi('******2345@fbpe', known)).toBe(RL.toLowerCase());
    expect(matchUpi(`${QR_A}...`, known)).toBe(QR_A.toLowerCase());
    // visible part fits two ids, or nothing, or too little shows
    expect(matchUpi('paytmqr********0101…@paytm', known)).toBeNull();
    expect(matchUpi('bharatpe.******9999@fbpe', known)).toBeNull();
    expect(matchUpi('ab******@fbpe', known)).toBeNull();
  });

  it('an OCR typo within 2 edits maps; a shared prefix or ambiguous piece does not', () => {
    expect(matchUpi('paytmqr2810050501011abcdefgh90@paytm', known)).toBe(QR_A.toLowerCase());
    expect(matchUpi('paytmqr281005050101@paytm', known)).toBeNull();
    expect(matchUpi('stores@airtel', known)).toBe(GP_SHORT);
    expect(matchUpi('ores@airtel', known)).toBeNull();
    expect(matchUpi('v0@paytm', known)).toBeNull();
    expect(matchUpi('someone@ybl', known)).toBeNull();
    expect(matchUpi(null, known)).toBeNull();
  });

  it('banking-name tag is the initials of our name read', () => {
    expect(bankingTag('Mrs RAVVA LAKSHMI')).toBe('RL');
    expect(bankingTag('LAKSHMI\nSTORES')).toBe('LS');
    expect(bankingTag('Paid Girls Community')).toBe('GC');
    expect(bankingTag('REDDYGIRL')).toBe('RG');
    expect(bankingTag('Priya')).toBeNull();
  });
});

describe('foldUpiRevenue', () => {
  const proofs: UpiProofRow[] = [
    p({ chatId: 'a', payeeUpiId: RL, payeeName: 'Mrs RAVVA LAKSHMI', creditAmount: 200 }),
    p({ chatId: 'a', payeeUpiId: '9000012345@fbpe', creditAmount: 50 }),
    p({ chatId: 'b', payeeUpiId: RL, creditAmount: 100 }),
    p({ chatId: 'c', payeeUpiId: QR_A, payeeName: 'Girls Community', creditAmount: 300 }),
    p({ chatId: 'd', payeeUpiId: GP_LONG, payeeName: 'LAKSHMI STORES', creditAmount: 25 }),
    p({ chatId: 'e', payeeUpiId: GP_SHORT, creditAmount: 75 }),
    p({ chatId: 'f', payeeUpiId: null, payeeName: 'Reddy Girl', creditAmount: 40 }),
    p({ chatId: 'g', payeeUpiId: 'someone@ybl', creditAmount: 10 }),
    p({ chatId: 'h', payeeUpiId: undefined, creditAmount: null, amount: 60 }),
    // excluded
    p({ chatId: 'fake', payeeUpiId: RL, creditAmount: 500 }),
    p({ chatId: 'big', payeeUpiId: RL, creditAmount: 1000 }),
    p({ chatId: 'void', payeeUpiId: RL, creditAmount: 99, uncredited: { state: 'done' } }),
  ];
  const out = foldUpiRevenue({ proofs, fakeChats: new Set(['fake']), upiDocs, clients });
  const row = (id: string | null) => out.rows.find((r) => r.id === id)!;

  it('one row per id, ids of the same account apart, sorted by ₹ desc, other last', () => {
    expect(out.rows.map((r) => [r.id, r.rupees])).toEqual([
      ['****2345@fbpe', 350],
      ['****gh9q@paytm', 300],
      ['****ores@airtel (6 ch)', 75],
      ['****ores@airtel (13 ch)', 25],
      ['****9999@ptys', 0],
      [null, 110],
    ]);
  });

  it('counts payers as distinct chats and credits as rows; tag from the banking name read, main QR ids only', () => {
    expect(row('****2345@fbpe')).toMatchObject({ payers: 2, credits: 3, tag: 'RL', kind: 'qr', qrClients: ['c1', 'c2'], gpayClients: [] });
    expect(row('****gh9q@paytm')).toMatchObject({ tag: 'GC', qrClients: ['c3'] });
    expect(row('****ores@airtel (6 ch)')).toMatchObject({ kind: 'gpay', tag: null, gpayClients: ['c2', 'c3'] });
    // A "LAKSHMI STORES" read on a gpay-only id gives no tag (noisy on low-count gpay ids, owner 2026-11-22).
    expect(row('****ores@airtel (13 ch)')).toMatchObject({ kind: 'gpay', tag: null, gpayClients: ['c1'] });
    expect(row(null)).toMatchObject({ kind: 'other', tag: null, credits: 3, payers: 3, qrClients: [], gpayClients: [] });
  });

  it('total equals the sum of rows; exclusions follow the owner revenue rules', () => {
    expect(out.total).toEqual({ rupees: 860, payers: 8, credits: 9 });
    expect(out.rows.reduce((a, r) => a + r.rupees, 0)).toBe(out.total.rupees);
    expect(out.excluded).toEqual({ fakeRupees: 500, fakeCredits: 1, bigRupees: 1000, bigCredits: 1, voidedCredits: 1 });
    expect(out.idsWithCredits).toBe(4);
    expect(row('****2345@fbpe').share).toBeCloseTo(350 / 860, 4);
    expect(out.rows.reduce((a, r) => a + r.share, 0)).toBeCloseTo(1, 3);
  });

  it('main QR ids are client qrIds plus qrId* keys of the upi-ids doc; a doc qrId with no client still gets a tag', () => {
    expect([...mainQrIds(upiDocs, clients)].sort()).toEqual([normalise(QR_A), normalise(QR_B), normalise(RL), 'unused9999@ptys'].sort());
    const res = foldUpiRevenue({
      proofs: [
        p({ chatId: 'x', payeeUpiId: QR_B, payeeName: 'Reddy Girl', creditAmount: 30 }),
        p({ chatId: 'y', payeeUpiId: GP_SHORT, payeeName: 'Ravva Lakshmi', creditAmount: 20 }),
      ],
      fakeChats: new Set(),
      upiDocs,
      clients,
    });
    expect(res.rows.find((r) => r.id === '****ts7k@paytm')).toMatchObject({ kind: 'listed', tag: 'RG', rupees: 30 });
    expect(res.rows.find((r) => r.id === '****ores@airtel')).toMatchObject({ kind: 'gpay', tag: null, rupees: 20 });
  });

  it('an empty window gives ₹0 qrId rows and share 0', () => {
    const empty = foldUpiRevenue({ proofs: [], fakeChats: new Set(), upiDocs, clients });
    expect(empty.total).toEqual({ rupees: 0, payers: 0, credits: 0 });
    expect(empty.rows.every((r) => r.share === 0 && r.kind === 'qr')).toBe(true);
    expect(empty.rows.map((r) => r.id).sort()).toEqual(['****2345@fbpe', '****9999@ptys', '****gh9q@paytm']);
  });
});

describe('name match: credits with no id read go to an id of the banking name read', () => {
  // Two GC ids (like ****68em@ptys and ****sx4o@paytm), one RG id, two LS ids; accounts come from matched receipts.
  const GC1 = 'paytmqr281005050101gcone68em@ptys';
  const GC2 = 'paytmqr281005050101gctwosx4o@paytm';
  const RG1 = 'paytmqr281005050101rgonet4m9@paytm';
  const LS1 = 'paytmqr281005050101lsone9jv0@paytm';
  const LS2 = 'lakshmi.3365-10@waaxis';
  const MIX = 'mixedname@jio';
  const docs = [{ qrId: GC1, qrId1: GC2, qrId2: RG1, qrId3: LS1, gpay: LS2, gpay1: MIX }];
  const cl = [
    { clientId: 'onGc1', qrId: GC1, gpayId: LS2 },
    { clientId: 'onGc2', qrId: GC2, gpayId: LS2 },
    { clientId: 'gpayGc2', qrId: RG1, gpayId: GC2 },
    { clientId: 'onRg', qrId: RG1, gpayId: MIX },
  ];
  const seen = (id: string, name: string, n: number) => Array.from({ length: n }, (_, i) => p({ chatId: `s-${id}-${i}`, payeeUpiId: id, payeeName: name, creditAmount: 10 }));
  const history: UpiProofRow[] = [
    ...seen(GC1, 'Girls Community', 3), ...seen(GC2, 'GIRLS COMMUNITY', 2), ...seen(RG1, 'Reddy Girl', 2),
    ...seen(LS1, 'Lakshmi Stores', 2), ...seen(LS2, 'LAKSHMI STORES', 2),
    p({ chatId: 'm1', payeeUpiId: MIX, payeeName: 'Ravva Lakshmi' }), p({ chatId: 'm2', payeeUpiId: MIX, payeeName: 'Reddy Girl' }),
  ];
  const knownIds = knownUpiIds(docs, cl);
  const accounts = accountsOfIds(history, knownIds);

  it('an id belongs to the one name read on its receipts, 2+ reads, every read agreeing', () => {
    expect(accounts.get(GC1)).toBe('GC');
    expect(accounts.get(GC2)).toBe('GC');
    expect(accounts.get(RG1)).toBe('RG');
    expect(accounts.has(MIX)).toBe(false); // RL once and RG once: no account
    expect(accountsOfIds(seen(RG1, 'Reddy Girl', 1), knownIds).has(RG1)).toBe(false); // one read is not enough
  });

  it("picks the client's qrId, else its gpayId, on the account; else the account's only id; else null", () => {
    expect(nameMatchedId('GC', cl[0], accounts)).toBe(GC1);
    expect(nameMatchedId('GC', cl[1], accounts)).toBe(GC2);
    expect(nameMatchedId('GC', cl[2], accounts)).toBe(GC2); // qrId is RG, gpayId is GC
    expect(nameMatchedId('RG', cl[0], accounts)).toBe(RG1); // RG has one id
    expect(nameMatchedId('GC', cl[3], accounts)).toBeNull(); // two GC ids, client on neither
    expect(nameMatchedId('LS', undefined, accounts)).toBeNull();
    expect(nameMatchedId('RL', cl[3], accounts)).toBeNull(); // RL has no id with an account
  });

  const today: UpiProofRow[] = [
    p({ chatId: 't1', clientId: 'onGc1', payeeUpiId: null, payeeName: 'Girls Community', creditAmount: 100 }),
    p({ chatId: 't2', clientId: 'onGc2', payeeUpiId: undefined, payeeName: 'Girls Community', creditAmount: 50 }),
    p({ chatId: 't3', clientId: 'onRg', payeeUpiId: null, payeeName: 'Girls Community', creditAmount: 40 }),
    p({ chatId: 't4', clientId: 'onGc1', payeeUpiId: null, payeeName: null, creditAmount: 30 }),
    p({ chatId: 't5', clientId: 'onGc1', payeeUpiId: 'someone@ybl', payeeName: 'Reddy Girl', creditAmount: 20 }),
    p({ chatId: 't6', clientId: 'onGc1', payeeUpiId: GC1, payeeName: 'Girls Community', creditAmount: 200 }),
  ];
  const out = foldUpiRevenue({ proofs: today, accountProofs: [...history, ...today], fakeChats: new Set(), upiDocs: docs, clients: cl });
  const row = (id: string | null) => out.rows.find((r) => r.id === id)!;

  it('GC client on 68em -> 68em, GC client on sx4o -> sx4o, ambiguous and no name stay Other; total unchanged', () => {
    expect(row(maskUpi(GC1))).toMatchObject({ rupees: 300, credits: 2, nameRupees: 100, nameCredits: 1 });
    expect(row(maskUpi(GC2))).toMatchObject({ rupees: 50, credits: 1, nameRupees: 50, nameCredits: 1 });
    expect(row(maskUpi(RG1))).toMatchObject({ rupees: 20, nameRupees: 20, nameCredits: 1 }); // foreign id read, RG name
    expect(row(null)).toMatchObject({ kind: 'other', rupees: 70, credits: 2, nameRupees: 0, nameCredits: 0 });
    expect(out.nameMatched).toEqual({ rupees: 170, credits: 3 });
    expect(out.total.rupees).toBe(440);
    expect(out.rows.reduce((a, r) => a + r.rupees, 0)).toBe(out.total.rupees);
  });

  it('accounts default to the window rows when no history is passed', () => {
    const solo = foldUpiRevenue({ proofs: today, fakeChats: new Set(), upiDocs: docs, clients: cl });
    expect(solo.nameMatched).toEqual({ rupees: 0, credits: 0 }); // GC1 read once in the window: no account yet
  });

  it('the seen cut-off "Ravva Laksh..." counts as RL', () => {
    expect(bankingTag('Mrs Ravva Laksh...')).toBe('RL');
    expect(bankingTag('Ravva Laksh')).toBeNull();
  });
});

describe('GET /monitor/upi-revenue', () => {
  it('window is today|7d, default today', () => {
    expect(parseUpiWindow(undefined)).toBe('today');
    expect(parseUpiWindow('7d')).toBe('7d');
    expect(() => parseUpiWindow('30d')).toThrow(BadRequestException);
  });

  it('reads Mongo only, secondaryPreferred, no writes, no image/ocr, masks ids', async () => {
    const reads: Array<{ coll: string; filter: any; opts: any }> = [];
    const data: Record<string, any[]> = {
      paymentProofs: [{ chatId: '7712345678', payeeUpiId: RL, payeeName: 'Mrs RAVVA LAKSHMI', creditAmount: 150, servedAt: new Date() }],
      'upi-ids': upiDocs,
      clients,
      userData: [],
    };
    const writes = jest.fn();
    const connection = {
      collection: (coll: string) => ({
        find: (filter: any, opts: any) => {
          reads.push({ coll, filter, opts });
          return { toArray: async () => data[coll] ?? [] };
        },
        aggregate: writes,
        updateOne: writes,
        insertOne: writes,
        deleteMany: writes,
      }),
    };
    const svc = new MonitorService({ query: jest.fn() } as any, connection as any, {} as any);
    svc.prewarmDelayMs = -1;
    const res: any = await svc.upiRevenue('today');
    expect(writes).not.toHaveBeenCalled();
    expect(reads.map((r) => r.coll).sort()).toEqual(['clients', 'paymentProofs', 'upi-ids', 'upi-labels', 'userData']);
    for (const r of reads) expect(r.opts.readPreference).toBe('secondaryPreferred');
    const proofRead = reads.find((r) => r.coll === 'paymentProofs')!;
    expect(proofRead.filter.servedAt.$gte).toBeInstanceOf(Date);
    expect(Object.keys(proofRead.opts.projection).some((k) => /image|ocr/i.test(k))).toBe(false);
    expect(res.rows[0]).toMatchObject({ id: '****2345@fbpe', rupees: 150, tag: 'RL' });
    expect(JSON.stringify(res)).not.toContain('7712345678');
    expect(res.window).toBe('today');
    expect(res.from).toBe(res.to);
    expect(res.nameMatched).toEqual({ rupees: 0, credits: 0 });
  });

  it('reads 7 days of proofs for the account history but counts only the window', async () => {
    const reads: any[] = [];
    const old = new Date(Date.now() - 3 * 86_400_000);
    const data: Record<string, any[]> = {
      paymentProofs: [
        { chatId: 'h1', clientId: 'c3', payeeUpiId: QR_A, payeeName: 'Girls Community', creditAmount: 10, servedAt: old },
        { chatId: 'h2', clientId: 'c3', payeeUpiId: QR_A, payeeName: 'Girls Community', creditAmount: 10, servedAt: old },
        { chatId: 'n1', clientId: 'c3', payeeUpiId: null, payeeName: 'Girls Community', creditAmount: 70, servedAt: new Date() },
      ],
      'upi-ids': upiDocs,
      clients,
      userData: [],
    };
    const connection = { collection: (coll: string) => ({ find: (filter: any, opts: any) => { reads.push({ coll, filter, opts }); return { toArray: async () => data[coll] ?? [] }; } }) };
    const svc = new MonitorService({ query: jest.fn() } as any, connection as any, {} as any);
    svc.prewarmDelayMs = -1;
    const res: any = await svc.upiRevenue('today');
    const proofRead = reads.find((r) => r.coll === 'paymentProofs');
    expect(Date.now() - proofRead.filter.servedAt.$gte.getTime()).toBeGreaterThan(6 * 86_400_000);
    expect(res.total.rupees).toBe(70);
    expect(res.nameMatched).toEqual({ rupees: 70, credits: 1 });
    expect(res.rows.find((r: any) => r.id === '****gh9q@paytm')).toMatchObject({ rupees: 70, nameRupees: 70 });
  });
});

describe('drill-down: the credits of each row (GET /monitor/upi-revenue/items)', () => {
  const GC_ONE = 'gcsingle1234@ptys';
  const docs = [{ _id: 'x', qrId: RL, gp: GC_ONE }];
  const cl = [{ clientId: 'c1', qrId: RL, gpayId: null }, { clientId: 'c5', qrId: GC_ONE, gpayId: null }];
  const t = (h: number) => new Date(Date.UTC(2026, 10, 22, h));
  const proofs: UpiProofRow[] = [
    p({ chatId: 'a', proofId: 'c1-a-1', telegramMsgId: 1, payeeUpiId: RL, payeeName: 'Mrs RAVVA LAKSHMI', creditAmount: 200, servedAt: t(1), verdict: { outcome: 'credited' } }),
    p({ chatId: 'b', proofId: 'c1-b-2', telegramMsgId: 2, payeeUpiId: RL, payeeName: 'Ravva Lakshmi', creditAmount: 100, servedAt: t(3), verdict: { outcome: 'credited' } }),
    p({ chatId: 'c', proofId: 'c1-c-3', payeeUpiId: null, payeeName: 'Ravva Lakshmi', creditAmount: 50, servedAt: t(2) }),
    p({ chatId: 'd', clientId: 'c5', payeeUpiId: GC_ONE, payeeName: 'Girls Community', creditAmount: 30, servedAt: t(4) }),
    p({ chatId: 'd2', clientId: 'c5', payeeUpiId: GC_ONE, payeeName: 'Girls Community', creditAmount: 20, servedAt: t(4) }),
    p({ chatId: 'e', payeeUpiId: 'stranger9876@ybl', payeeName: 'Priya Sharma', creditAmount: 70, servedAt: t(5) }),
    p({ chatId: 'f', payeeUpiId: null, payeeName: null, creditAmount: 15, servedAt: t(6) }),
    p({ chatId: 'fake', payeeUpiId: RL, creditAmount: 500, servedAt: t(7) }),
    p({ chatId: 'big', payeeUpiId: RL, creditAmount: 1000, servedAt: t(7) }),
    p({ chatId: 'void', payeeUpiId: RL, creditAmount: 99, uncredited: { state: 'done' }, servedAt: t(7) }),
  ];
  const { fold, credits } = foldUpiRevenueWithCredits({ proofs, fakeChats: new Set(['fake']), upiDocs: docs, clients: cl });

  it('every row, the other row and name-matched included, is exactly the sum of its items', () => {
    expect(fold.rows.length).toBeGreaterThanOrEqual(3);
    for (const row of fold.rows) {
      const items = upiRowItems(credits, row.key);
      expect(items.reduce((s, i) => s + i.rupees, 0)).toBe(row.rupees);
      expect(items.length).toBe(row.credits);
      expect(new Set(items.map((i) => i.chatId)).size).toBe(row.payers);
      expect(items.filter((i) => i.match === 'name').reduce((s, i) => s + i.rupees, 0)).toBe(row.nameRupees);
    }
    expect(credits.length).toBe(fold.total.credits);
    expect(credits.reduce((s, c) => s + c.rupees, 0)).toBe(fold.total.rupees);
  });

  it('RL row: exact-id items plus the name-matched one, newest first; other row holds the foreign and the unread', () => {
    const rl = fold.rows.find((r) => r.id === '****2345@fbpe')!;
    expect(rl).toMatchObject({ rupees: 350, credits: 3, nameRupees: 50 });
    const items = upiRowItems(credits, rl.key, new Map([['c1', 'https://c1.example']]));
    expect(items.map((i) => [i.chatId, i.match, i.rupees])).toEqual([['b', 'id', 100], ['c', 'name', 50], ['a', 'id', 200]]);
    expect(items[2]).toMatchObject({ proofId: 'c1-a-1', telegramMsgId: 1, payeeUpi: '****2345@fbpe', payeeTag: 'RL', payeeNameRead: true, legacy: false, clientHost: 'https://c1.example', servedAt: t(1).toISOString() });
    expect(items[1]).toMatchObject({ payeeUpi: null, legacy: true, telegramMsgId: null });
    const other = fold.rows.find((r) => r.kind === 'other')!;
    expect(other.key).toBe('other');
    const o = upiRowItems(credits, 'other');
    expect(o.map((i) => [i.chatId, i.match, i.payeeUpi, i.payeeTag, i.payeeNameRead])).toEqual([['f', 'none', null, null, false], ['e', 'none', '****9876@ybl', null, true]]);
    expect(o.reduce((s, i) => s + i.rupees, 0)).toBe(other.rupees);
  });

  it('items never carry a full id or a payee name; keys are stable and not the id', () => {
    const text = JSON.stringify(fold.rows.map((r) => upiRowItems(credits, r.key)));
    for (const secret of [RL.toLowerCase(), '9000012345', 'stranger', 'priya', 'ravva', 'girls', GC_ONE]) expect(text.toLowerCase()).not.toContain(secret);
    expect(upiRowKey(RL.toLowerCase())).toMatch(/^u[0-9a-f]{12}$/);
    expect(upiRowKey(RL.toLowerCase())).toBe(fold.rows.find((r) => r.id === '****2345@fbpe')!.key);
    expect(upiRowKey(null)).toBe('other');
    expect(parseUpiRowKey('other')).toBe('other');
    expect(parseUpiRowKey(upiRowKey('x@y'))).toMatch(/^u/);
    expect(() => parseUpiRowKey('****2345@fbpe')).toThrow(BadRequestException);
    expect(() => parseUpiRowKey(undefined)).toThrow(BadRequestException);
  });

  it('the table response carries keys and no items', () => {
    expect(foldUpiRevenue({ proofs, fakeChats: new Set(), upiDocs: docs, clients: cl })).not.toHaveProperty('credits');
  });
});

describe('GET /monitor/upi-revenue/items (service)', () => {
  const mk = (data: Record<string, any[]>, reads: any[] = []) => {
    // userData answers the fake-chat read with nothing (no chat marked fake) and the username read with its rows.
    const rowsOf = (coll: string, filter: any) => (coll === 'userData' && filter?.fakePaymentAt ? [] : data[coll] ?? []);
    const connection = { collection: (coll: string) => ({ find: (filter: any, opts: any) => { reads.push({ coll, filter, opts }); return { toArray: async () => rowsOf(coll, filter) }; } }) };
    const svc = new MonitorService({ query: jest.fn() } as any, connection as any, {} as any);
    svc.prewarmDelayMs = -1;
    return svc;
  };
  const now = () => new Date();
  const data = (): Record<string, any[]> => ({
    paymentProofs: [
      { chatId: '7712345678', clientId: 'c1', profile: 'p1', proofId: 'c1-7712345678-5', telegramMsgId: 5, payeeUpiId: RL, payeeName: 'Mrs RAVVA LAKSHMI', creditAmount: 150, servedAt: now(), verdict: { outcome: 'credited' } },
      { chatId: '7700000001', clientId: 'c3', profile: 'p3', payeeUpiId: null, payeeName: 'Girls Community', creditAmount: 40, servedAt: now() },
      { chatId: '7700000002', clientId: 'c3', profile: 'p3', payeeUpiId: QR_A, payeeName: 'Girls Community', creditAmount: 60, servedAt: now() },
      { chatId: '7700000003', clientId: 'c3', profile: 'p3', payeeUpiId: QR_A, payeeName: 'Girls Community', creditAmount: 60, servedAt: now() },
      { chatId: '7700000009', clientId: 'c2', profile: 'p2', payeeUpiId: 'x@ybl', creditAmount: 25, servedAt: now() },
    ],
    'upi-ids': upiDocs,
    clients: clients.map((c) => ({ ...c, repl: `https://${c.clientId}.example` })),
    userData: [{ chatId: '7712345678', clientId: 'c1', profile: 'p1', username: '@buyer' }],
  });

  it('items of every row sum to the table row, from the same read; usernames and hosts joined; no image/ocr', async () => {
    const reads: any[] = [];
    const svc = mk(data(), reads);
    const table: any = await svc.upiRevenue('today');
    expect(table.rows.every((r: any) => typeof r.key === 'string')).toBe(true);
    expect(table).not.toHaveProperty('credits');
    for (const row of table.rows) {
      const res: any = await svc.upiRevenueItems('today', row.key);
      expect(res.total).toEqual({ rupees: row.rupees, credits: row.credits });
      expect(res.row).toEqual(row);
      expect(res.asOf).toBe(table.asOf);
    }
    expect(reads.filter((r) => r.coll === 'paymentProofs')).toHaveLength(1);
    const gc: any = await svc.upiRevenueItems('today', table.rows.find((r: any) => r.id === '****gh9q@paytm').key);
    expect(gc.items.map((i: any) => i.match).sort()).toEqual(['id', 'id', 'name']);
    const rl: any = await svc.upiRevenueItems('today', table.rows.find((r: any) => r.id === '****2345@fbpe').key);
    expect(rl.items[0]).toMatchObject({ chatId: '7712345678', clientId: 'c1', username: '@buyer', clientHost: 'https://c1.example', proofId: 'c1-7712345678-5', match: 'id' });
    const other: any = await svc.upiRevenueItems('today', 'other');
    expect(other.items.map((i: any) => i.rupees)).toEqual([25]);
    for (const r of reads.filter((x) => x.coll === 'paymentProofs')) expect(Object.keys(r.opts.projection).some((k) => /image|ocr/i.test(k))).toBe(false);
    for (const r of reads) expect(r.opts.readPreference).toBe('secondaryPreferred');
  });

  it('a key not in the window is 404', async () => {
    const svc = mk(data());
    await expect(svc.upiRevenueItems('today', 'u000000000000')).rejects.toThrow(NotFoundException);
  });
});

describe('rollup by explicit label (upi-labels collection, owner 2026-11-23)', () => {
  // LS has three ids: two paytm QRs and a Paytm (@ptys) id. RL has one. One gpay id has no label.
  const LS_A = 'paytmqr281005050101lsaaaaum3d@paytm';
  const LS_B = 'paytmqr281005050101lsbbbb9jv0@paytm';
  const LS_PT = 'paytm.s1abcdefvr3l@ptys';
  const RL_ID = 'BHARATPE.9000012345@fbpe';
  const GP = 'someshop5-10@waaxis';
  const docs = [{ _id: 'x', paytm1: RL_ID, qrId3: LS_B, qrId5: LS_A, ppay: LS_PT, gpay: GP }];
  const cl = [
    { clientId: 'k1', qrId: LS_A, gpayId: GP },
    { clientId: 'k2', qrId: LS_B, gpayId: null },
    { clientId: 'k3', qrId: RL_ID, gpayId: null },
  ];
  const labels = [
    { upiId: LS_A, label: 'LS' },
    { upiId: LS_B.toUpperCase(), label: 'ls' },
    { upiId: RL_ID, label: 'RL' },
    { upiId: 'retired0000@ybl', label: 'RG' },
    { upiId: LS_PT, label: 'not a label!' },
  ];
  const proofs: UpiProofRow[] = [
    p({ chatId: 'a', clientId: 'k1', payeeUpiId: LS_A, payeeName: 'LAKSHMI STORES', creditAmount: 100 }),
    p({ chatId: 'a', clientId: 'k1', payeeUpiId: LS_A, payeeName: 'Lakshmi Stores', creditAmount: 50 }),
    p({ chatId: 'b', clientId: 'k2', payeeUpiId: LS_B, payeeName: 'Lakshmi Store', creditAmount: 75 }),
    p({ chatId: 'a', clientId: 'k2', payeeUpiId: LS_B, payeeName: 'Lakshmi Stores', creditAmount: 25 }),
    p({ chatId: 'c', clientId: 'k1', payeeUpiId: LS_PT, payeeName: 'Lakshmi Stores', creditAmount: 100 }),
    p({ chatId: 'd', clientId: 'k3', payeeUpiId: RL_ID, payeeName: 'Ravva Lakshmi', creditAmount: 200 }),
    p({ chatId: 'e', clientId: 'k1', payeeUpiId: GP, payeeName: 'Reddy Girl', creditAmount: 40 }),
    p({ chatId: 'f', clientId: 'k2', payeeUpiId: LS_B, payeeName: 'Ravva Laxmi', creditAmount: 60 }),
    p({ chatId: 'g', clientId: 'k1', payeeUpiId: null, payeeName: 'LAXMI STORES', creditAmount: 30 }),
    p({ chatId: 'h', payeeUpiId: 'stranger9876@ybl', payeeName: 'Priya Sharma', creditAmount: 10 }),
  ];
  const before = foldUpiRevenueWithCredits({ proofs, fakeChats: new Set(), upiDocs: docs, clients: cl });
  const after = foldUpiRevenueWithCredits({ proofs, fakeChats: new Set(), upiDocs: docs, clients: cl, labels });
  const row = (key: string) => after.fold.rows.find((r) => r.key === key)!;

  it('all ids with the same label collapse into one row; ₹, credits and distinct payers summed', () => {
    const ls = row('lLS');
    expect(ls).toMatchObject({ kind: 'label', label: 'LS', tag: 'LS', id: null, rupees: 250, credits: 4, payers: 2, qrClients: ['k1', 'k2'] });
    expect(ls.upis!.map((u) => [u.id, u.rupees, u.credits, u.label])).toEqual([['****um3d@paytm', 150, 2, 'LS'], ['****9jv0@paytm', 100, 2, 'LS']]);
    expect(after.fold.rows.filter((r) => r.label === 'LS')).toHaveLength(1);
  });

  it('a single-id label is one row with that id inside, same numbers as before', () => {
    const rl = row('lRL');
    const old = before.fold.rows.find((r) => r.id === '****2345@fbpe')!;
    expect(rl).toMatchObject({ kind: 'label', rupees: old.rupees, credits: old.credits, payers: old.payers, share: old.share });
    expect(rl.upis!.map((u) => u.id)).toEqual(['****2345@fbpe']);
  });

  it('an unlabelled id keeps its own row and gets a label suggestion from the banking name read', () => {
    const pt = after.fold.rows.find((r) => r.id === '****vr3l@ptys')!;
    expect(pt).toMatchObject({ kind: 'listed', label: null, suggestedLabel: 'LS', rupees: 100, credits: 1 });
    const gp = after.fold.rows.find((r) => r.id === '****5-10@waaxis')!;
    expect(gp).toMatchObject({ label: null, suggestedLabel: 'RG', rupees: 40 });
    // A label row does not carry a suggestion; invalid labels and labels of unknown ids are ignored.
    expect(row('lLS').suggestedLabel).toBeNull();
    expect(after.fold.rows.some((r) => r.label === 'RG' || r.key === 'lRG')).toBe(false);
  });

  it('a "Laxmi" payee is never put under a label: its credits form one flagged row', () => {
    const lx = row('laxmi');
    expect(lx).toMatchObject({ kind: 'laxmi', id: null, label: null, tag: null, rupees: 90, credits: 2, payers: 2 });
    expect(bankingTag('Ravva Laxmi')).toBeNull();
    expect(bankingTag('LAXMI STORES')).toBeNull();
    expect(bankingTag('Lakshmi Store')).toBe('LS');
    expect(bankingTag('store lakshmi')).toBe('LS');
    expect(row('lLS').rupees).toBe(250);
    expect(after.fold.rows.map((r) => r.kind).slice(-2)).toEqual(['laxmi', 'other']);
  });

  it('totals are unchanged: rows sum to the total, which equals the unlabelled fold', () => {
    expect(after.fold.total).toEqual(before.fold.total);
    expect(after.fold.total).toEqual({ rupees: 690, payers: 8, credits: 10 });
    expect(after.fold.rows.reduce((s, r) => s + r.rupees, 0)).toBe(after.fold.total.rupees);
    expect(after.fold.rows.reduce((s, r) => s + r.credits, 0)).toBe(after.fold.total.credits);
    expect(after.fold.rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1, 3);
    expect(after.fold.idsWithCredits).toBe(5);
  });

  it('without labels the rows are per id, as before (no label rows)', () => {
    expect(before.fold.rows.some((r) => r.kind === 'label')).toBe(false);
    expect(before.fold.rows.every((r) => r.label === null)).toBe(true);
  });

  it('drill-down of a label row returns the credits of all its ids; a sub-row key returns its own', () => {
    const ls = row('lLS');
    const items = upiRowItems(after.credits, 'lLS');
    expect(items).toHaveLength(4);
    expect(items.reduce((s, i) => s + i.rupees, 0)).toBe(250);
    expect(new Set(items.map((i) => i.payeeUpi))).toEqual(new Set(['****um3d@paytm', '****9jv0@paytm']));
    for (const u of ls.upis!) {
      const sub = upiRowItems(after.credits, u.key);
      expect(sub.reduce((s, i) => s + i.rupees, 0)).toBe(u.rupees);
      expect(sub).toHaveLength(u.credits);
    }
    expect(upiRowItems(after.credits, 'laxmi').map((i) => i.rupees).sort()).toEqual([30, 60]);
    for (const r of after.fold.rows) expect(upiRowItems(after.credits, r.key).reduce((s, i) => s + i.rupees, 0)).toBe(r.rupees);
  });

  it('row keys of label and laxmi rows pass the controller check; junk does not', () => {
    expect(parseUpiRowKey('lLS')).toBe('lLS');
    expect(parseUpiRowKey('laxmi')).toBe('laxmi');
    expect(() => parseUpiRowKey('l')).toThrow(BadRequestException);
    expect(() => parseUpiRowKey('lls$')).toThrow(BadRequestException);
  });

  it('service: reads upi-labels read-only and serves label rows and their drill-down', async () => {
    const reads: any[] = [];
    const now = new Date();
    const data: Record<string, any[]> = {
      paymentProofs: proofs.map((x) => ({ ...x, servedAt: now })),
      'upi-ids': docs,
      'upi-labels': labels,
      clients: cl,
      userData: [],
    };
    const writes = jest.fn();
    const connection = { collection: (coll: string) => ({ find: (filter: any, opts: any) => { reads.push({ coll, filter, opts }); return { toArray: async () => (coll === 'userData' ? [] : data[coll] ?? []) }; }, updateOne: writes, insertOne: writes }) };
    const svc = new MonitorService({ query: jest.fn() } as any, connection as any, {} as any);
    svc.prewarmDelayMs = -1;
    const table: any = await svc.upiRevenue('today');
    expect(writes).not.toHaveBeenCalled();
    expect(reads.find((r) => r.coll === 'upi-labels').opts.readPreference).toBe('secondaryPreferred');
    expect(table.total.rupees).toBe(690);
    const ls: any = await svc.upiRevenueItems('today', 'lLS');
    expect(ls.total).toEqual({ rupees: 250, credits: 4 });
    expect(ls.row.upis).toHaveLength(2);
    const sub: any = await svc.upiRevenueItems('today', ls.row.upis[0].key);
    expect(sub.total).toEqual({ rupees: 150, credits: 2 });
    expect(JSON.stringify(table).toLowerCase()).not.toContain('lsaaaaum3d');
  });
});

describe('review fixes (2026-11-23)', () => {
  it('isLaxmiName matches a word starting with "laxm", never letters joined across words', () => {
    for (const n of ['Laxmi', 'Laxmi Stores', 'LAXMI', 'Ravva Laxmi', 'mrs.laxmi']) expect(isLaxmiName(n)).toBe(true);
    for (const n of ['Lakshmi', 'Lakshmi Stores', 'Vilax Mishra', 'Ravva Lakshmi', '', null]) expect(isLaxmiName(n)).toBe(false);
  });

  it('isLaxmiName also flags a name read joined ("RAVVALAXMI"): any word containing "laxm"', () => {
    for (const n of ['RAVVALAXMI', 'RavvaLaxmi', 'mrsravvalaxmi']) expect(isLaxmiName(n)).toBe(true);
    for (const n of ['Vilax Mishra', 'Lakshmi', 'RAVVALAKSHMI', 'Vilax-Mishra']) expect(isLaxmiName(n)).toBe(false);
  });

  const LS_A = 'paytmqr281005050101lsaaaaum3d@paytm';
  const docs = [{ _id: 'x', qrId: LS_A }];
  const cl = [{ clientId: 'k1', qrId: LS_A, gpayId: null }];
  const mkSvc = (labelsRead: () => Promise<any[]>) => {
    const data: Record<string, any[]> = {
      paymentProofs: [
        { chatId: 'a', clientId: 'k1', payeeUpiId: LS_A, payeeName: 'Lakshmi Stores', creditAmount: 100, servedAt: new Date() },
        { chatId: 'b', clientId: 'k1', payeeUpiId: LS_A, payeeName: 'Ravva Laxmi', creditAmount: 40, servedAt: new Date() },
      ],
      'upi-ids': docs,
      clients: cl,
      userData: [],
    };
    const connection = { collection: (coll: string) => ({ find: () => ({ toArray: () => (coll === 'upi-labels' ? labelsRead() : Promise.resolve(data[coll] ?? [])) }) }) };
    const svc = new MonitorService({ query: jest.fn() } as any, connection as any, {} as any);
    svc.prewarmDelayMs = -1;
    const log = jest.spyOn((svc as any).logger, 'log').mockImplementation(() => undefined);
    const warn = jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined);
    return { svc, log, warn };
  };
  const lines = (spy: jest.SpyInstance) => spy.mock.calls.map((c) => String(c[0]));

  it('logs one greppable fold summary per fold build', async () => {
    const { svc, log } = mkSvc(async () => [{ upiId: LS_A, label: 'LS' }]);
    await svc.upiRevenue('today');
    await svc.upiRevenue('today');
    const fold = lines(log).filter((l) => l.startsWith('upi-labels kind=fold'));
    expect(fold).toEqual(['upi-labels kind=fold window=today labels=1 labelRows=1 unlabelled=0 laxmiCredits=1']);
  });

  it('a failed labels read falls back to one row per id with the same totals, logged, not a 503', async () => {
    const ok = await mkSvc(async () => []).svc.upiRevenue('today');
    const { svc, warn, log } = mkSvc(async () => { throw new Error('boom mongodb+srv://cluster9.example.net/tgclients'); });
    const res: any = await svc.upiRevenue('today');
    expect(res.total).toEqual((ok as any).total);
    expect(res.rows.some((r: any) => r.kind === 'label')).toBe(false);
    const failed = lines(warn).filter((l) => l.startsWith('upi-labels kind=read_failed'));
    expect(failed).toHaveLength(1);
    expect(failed[0]).toContain('err=boom');
    expect(failed[0]).not.toContain('cluster9.example.net');
    expect(failed[0]).toContain('<uri>');
    expect(lines(log).some((l) => l.startsWith('upi-labels kind=fold window=today labels=0 '))).toBe(true);
    expect(res.notes).toContain('Labels unavailable, showing one row per UPI id.');
    expect((ok as any).notes).not.toContain('Labels unavailable, showing one row per UPI id.');
  });
});
