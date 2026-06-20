import {
  INTIMATE_KEYWORDS,
  NEGATIVE_KEYWORDS,
  scoreRelationship,
  rankRelationships,
  computeAccountScore,
  RelationshipCandidate,
} from '../relationship-scorer';

function makeCandidate(overrides: Partial<RelationshipCandidate> = {}): RelationshipCandidate {
  return {
    chatId: 'c1',
    name: 'Test',
    username: null,
    phone: null,
    messages: 0,
    mediaCount: 0,
    voiceCount: 0,
    intimateMessageCount: 0,
    negativeKeywordCount: 0,
    calls: {
      total: 0,
      incoming: 0,
      videoCalls: 0,
      avgDuration: 0,
      totalDuration: 0,
      meaningfulCalls: 0,
    },
    commonChats: 0,
    isMutualContact: false,
    lastMessageDate: null,
    ...overrides,
  };
}

describe('relationship-scorer keyword lists', () => {
  test('exports keyword arrays', () => {
    expect(INTIMATE_KEYWORDS).toContain('love');
    expect(INTIMATE_KEYWORDS).toContain('otp');
    expect(NEGATIVE_KEYWORDS).toContain('movie');
    expect(NEGATIVE_KEYWORDS).toContain('t.me/');
  });
});

describe('scoreRelationship', () => {
  test('empty candidate scores 0 (recency null=999 path)', () => {
    // lastMessageDate null → daysSince=999 → recency 0. All else 0.
    expect(scoreRelationship(makeCandidate())).toBe(0);
  });

  test('messages contribute 1.0 each, no cap below 3000', () => {
    expect(scoreRelationship(makeCandidate({ messages: 10 }))).toBe(10);
  });

  test('messages capped at 3000', () => {
    expect(scoreRelationship(makeCandidate({ messages: 5000 }))).toBe(3000);
  });

  test('media contributes 3.0 each', () => {
    expect(scoreRelationship(makeCandidate({ mediaCount: 10 }))).toBe(30);
  });

  test('media capped at 300 (→ 900)', () => {
    expect(scoreRelationship(makeCandidate({ mediaCount: 1000 }))).toBe(900);
  });

  test('voice contributes 4.0 each', () => {
    expect(scoreRelationship(makeCandidate({ voiceCount: 10 }))).toBe(40);
  });

  test('voice capped at 100 (→ 400)', () => {
    expect(scoreRelationship(makeCandidate({ voiceCount: 500 }))).toBe(400);
  });

  test('intimate contributes 20 each', () => {
    expect(scoreRelationship(makeCandidate({ intimateMessageCount: 1 }))).toBe(20);
  });

  test('intimate capped at 500 (→ 10000)', () => {
    expect(scoreRelationship(makeCandidate({ intimateMessageCount: 1000 }))).toBe(10000);
  });

  test('negative penalty subtracts 8 each', () => {
    // 100 msgs (=100) minus 1 negative keyword (=8) → 92
    expect(scoreRelationship(makeCandidate({ messages: 100, negativeKeywordCount: 1 }))).toBe(92);
  });

  test('negative penalty capped at 200 (→ -1600) then clamped via Math.max(0,...)', () => {
    // 10 msgs - 1600 penalty → negative → clamp to 0
    expect(scoreRelationship(makeCandidate({ messages: 10, negativeKeywordCount: 1000 }))).toBe(0);
  });

  test('mutual contact adds 50', () => {
    expect(scoreRelationship(makeCandidate({ isMutualContact: true }))).toBe(50);
  });

  test('non-mutual contact adds 0', () => {
    expect(scoreRelationship(makeCandidate({ isMutualContact: false }))).toBe(0);
  });

  test('common chats add 15 each', () => {
    expect(scoreRelationship(makeCandidate({ commonChats: 2 }))).toBe(30);
  });

  test('common chats capped at 10 (→ 150)', () => {
    expect(scoreRelationship(makeCandidate({ commonChats: 50 }))).toBe(150);
  });

  describe('calls', () => {
    test('outgoing-only calls (hasIncoming false) score 0', () => {
      const c = makeCandidate({ calls: { total: 5, incoming: 0, videoCalls: 0, avgDuration: 0, totalDuration: 0, meaningfulCalls: 0 } });
      expect(scoreRelationship(c)).toBe(0);
    });

    test('incoming-only calls score 8 each, no bidirectional bonus (outgoing=0 path)', () => {
      // incoming=3, total=3 → outgoing=0 → bidirectionalBonus 0. callScore = 3*8 = 24
      const c = makeCandidate({ calls: { total: 3, incoming: 3, videoCalls: 0, avgDuration: 0, totalDuration: 0, meaningfulCalls: 0 } });
      expect(scoreRelationship(c)).toBe(24);
    });

    test('bidirectional bonus (outgoing>0 path): min(outgoing,incoming)*2', () => {
      // incoming=4, total=10 → outgoing=6 → bonus = min(6,4)*2 = 8. callScore = 4*8 + 8 = 40
      const c = makeCandidate({ calls: { total: 10, incoming: 4, videoCalls: 0, avgDuration: 0, totalDuration: 0, meaningfulCalls: 0 } });
      expect(scoreRelationship(c)).toBe(40);
    });

    test('video calls add 12 each (requires incoming)', () => {
      // incoming=1, total=1 → 1*8 + 0 bonus + 2 video*12 = 8 + 24 = 32
      const c = makeCandidate({ calls: { total: 1, incoming: 1, videoCalls: 2, avgDuration: 0, totalDuration: 0, meaningfulCalls: 0 } });
      expect(scoreRelationship(c)).toBe(32);
    });

    test('meaningful calls add 15 each (capped at 100)', () => {
      // incoming=1,total=1 → 8 + meaningful 2*15=30 → 38
      const c = makeCandidate({ calls: { total: 1, incoming: 1, videoCalls: 0, avgDuration: 0, totalDuration: 0, meaningfulCalls: 2 } });
      expect(scoreRelationship(c)).toBe(38);
    });

    test('meaningful calls capped at 100 (→ 1500)', () => {
      // incoming=1,total=1 → 8 + 100*15 = 1508
      const c = makeCandidate({ calls: { total: 1, incoming: 1, videoCalls: 0, avgDuration: 0, totalDuration: 0, meaningfulCalls: 500 } });
      expect(scoreRelationship(c)).toBe(1508);
    });

    test('totalDuration contributes 0.02 each', () => {
      // incoming=1,total=1 → 8 + 1000*0.02 = 8 + 20 = 28
      const c = makeCandidate({ calls: { total: 1, incoming: 1, videoCalls: 0, avgDuration: 0, totalDuration: 1000, meaningfulCalls: 0 } });
      expect(scoreRelationship(c)).toBe(28);
    });

    test('totalDuration capped at 36000 (→ 720)', () => {
      // incoming=1,total=1 → 8 + 36000*0.02 = 8 + 720 = 728
      const c = makeCandidate({ calls: { total: 1, incoming: 1, videoCalls: 0, avgDuration: 0, totalDuration: 100000, meaningfulCalls: 0 } });
      expect(scoreRelationship(c)).toBe(728);
    });
  });

  describe('recency', () => {
    const FIXED_NOW = new Date('2026-06-20T00:00:00.000Z').getTime();
    let nowSpy: jest.SpyInstance;
    beforeEach(() => {
      nowSpy = jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
    });
    afterEach(() => {
      nowSpy.mockRestore();
    });

    test('message dated now → recency ~100', () => {
      const c = makeCandidate({ lastMessageDate: new Date(FIXED_NOW).toISOString() });
      // daysSince ~0 → recency ~100. round(100) = 100
      expect(scoreRelationship(c)).toBe(100);
    });

    test('message 45 days ago → recency ~50', () => {
      const c = makeCandidate({ lastMessageDate: new Date(FIXED_NOW - 45 * 24 * 60 * 60 * 1000).toISOString() });
      // 100 * (1 - 45/90) = 50
      expect(scoreRelationship(c)).toBe(50);
    });

    test('message exactly 90 days ago → recency 0 (boundary <=90 with factor 0)', () => {
      const c = makeCandidate({ lastMessageDate: new Date(FIXED_NOW - 90 * 24 * 60 * 60 * 1000).toISOString() });
      // 100 * (1 - 90/90) = 0
      expect(scoreRelationship(c)).toBe(0);
    });

    test('message >90 days ago → recency 0', () => {
      const c = makeCandidate({ lastMessageDate: new Date(FIXED_NOW - 200 * 24 * 60 * 60 * 1000).toISOString() });
      expect(scoreRelationship(c)).toBe(0);
    });

    test('FUTURE-dated message (clock skew) must NOT exceed the 100 recency cap', () => {
      // A lastMessageDate in the future yields negative daysSince -> 100*(1 - neg/90) > 100,
      // inflating the score. Recency must be clamped to [0,100].
      const c = makeCandidate({ lastMessageDate: new Date(FIXED_NOW + 30 * 24 * 60 * 60 * 1000).toISOString() });
      expect(scoreRelationship(c)).toBeLessThanOrEqual(100);
      expect(scoreRelationship(c)).toBe(100); // a "just now / future" message is max recency
    });

    test('unparseable lastMessageDate does not produce NaN', () => {
      const c = makeCandidate({ lastMessageDate: 'not-a-real-date' });
      expect(Number.isNaN(scoreRelationship(c))).toBe(false);
    });
  });

  test('combined deterministic score', () => {
    // msgs=10(10) + media=10(30) + voice=10(40) + intimate=1(20) + mutual(50) + common=2(30)
    // calls incoming=1,total=1 → 8. negative=1 → -8.  recency null → 0
    // total = 10+30+40+8+20+50+30-8 = 180
    const c = makeCandidate({
      messages: 10,
      mediaCount: 10,
      voiceCount: 10,
      intimateMessageCount: 1,
      negativeKeywordCount: 1,
      isMutualContact: true,
      commonChats: 2,
      calls: { total: 1, incoming: 1, videoCalls: 0, avgDuration: 0, totalDuration: 0, meaningfulCalls: 0 },
    });
    expect(scoreRelationship(c)).toBe(180);
  });
});

describe('rankRelationships', () => {
  test('sorts descending by score and slices topN', () => {
    const candidates = [
      makeCandidate({ chatId: 'a', messages: 10 }),    // 10
      makeCandidate({ chatId: 'b', messages: 100 }),   // 100
      makeCandidate({ chatId: 'c', messages: 50 }),    // 50
      makeCandidate({ chatId: 'd', messages: 5 }),     // 5
    ];
    const ranked = rankRelationships(candidates, 2);
    expect(ranked.length).toBe(2);
    expect(ranked[0].chatId).toBe('b');
    expect(ranked[0].score).toBe(100);
    expect(ranked[1].chatId).toBe('c');
  });

  test('defaults topN to 5', () => {
    const candidates = Array.from({ length: 8 }, (_, i) => makeCandidate({ chatId: `c${i}`, messages: i + 1 }));
    const ranked = rankRelationships(candidates);
    expect(ranked.length).toBe(5);
    expect(ranked[0].score).toBe(8);
  });
});

describe('computeAccountScore', () => {
  test('sums top 3 scores', () => {
    const ranked = rankRelationships([
      makeCandidate({ chatId: 'a', messages: 100 }),
      makeCandidate({ chatId: 'b', messages: 50 }),
      makeCandidate({ chatId: 'c', messages: 30 }),
      makeCandidate({ chatId: 'd', messages: 10 }),
    ], 5);
    // top3 = 100 + 50 + 30 = 180
    expect(computeAccountScore(ranked)).toBe(180);
  });

  test('empty array → 0', () => {
    expect(computeAccountScore([])).toBe(0);
  });
});
