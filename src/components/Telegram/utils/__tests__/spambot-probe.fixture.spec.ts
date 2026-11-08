jest.mock('../connection-manager', () => ({ connectionManager: {} }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { classifySpamBotReply } from '../spambot-probe';

/**
 * Shared @SpamBot reply fixture. MIRROR: the same JSON lives in tg-platform
 * tests/unit/packages/tg-core/telegram-utils/spam-bot-replies.fixture.json, run there through
 * classifySpamBotMessage; tg-platform spam-bot-classifier-mirror.test.mjs also runs this CMS
 * classifier over it and compares the phrase lists.
 */
interface ReplyCase { text: string; verdict: 'free' | 'limited' | 'harsh' | 'unknown'; limitedUntilMinute?: string; source: string }
const fixture: { now: string; cases: ReplyCase[] } = JSON.parse(readFileSync(join(__dirname, 'spambot-replies.fixture.json'), 'utf8'));
const NOW = new Date(fixture.now);

describe('classifySpamBotReply: shared SpamBot reply fixture', () => {
  test.each(fixture.cases.map((c) => [c.source, c.text, c] as const))('%s: %j', (_source, _text, c) => {
    const r = classifySpamBotReply(c.text, NOW);
    expect(r.status).toBe(c.verdict);
    if (c.verdict === 'limited') expect(r.limitedUntil).toBeInstanceOf(Date);
    else expect(r.limitedUntil).toBeNull();
    if (c.limitedUntilMinute) expect(r.limitedUntil?.toISOString().slice(0, 16)).toBe(c.limitedUntilMinute);
  });
});
