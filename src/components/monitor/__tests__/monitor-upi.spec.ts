import { BadRequestException } from '@nestjs/common';
import { bankingTag, foldUpiRevenue, knownUpiIds, mainQrIds, maskUpi, matchUpi, UPI_PROOF_PROJECTION, UpiProofRow } from '../monitor-upi';
import { parseUpiWindow } from '../monitor.controller';
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
    expect(reads.map((r) => r.coll).sort()).toEqual(['clients', 'paymentProofs', 'upi-ids', 'userData']);
    for (const r of reads) expect(r.opts.readPreference).toBe('secondaryPreferred');
    const proofRead = reads.find((r) => r.coll === 'paymentProofs')!;
    expect(proofRead.filter.servedAt.$gte).toBeInstanceOf(Date);
    expect(Object.keys(proofRead.opts.projection).some((k) => /image|ocr/i.test(k))).toBe(false);
    expect(res.rows[0]).toMatchObject({ id: '****2345@fbpe', rupees: 150, tag: 'RL' });
    expect(JSON.stringify(res)).not.toContain('7712345678');
    expect(res.window).toBe('today');
    expect(res.from).toBe(res.to);
  });
});
