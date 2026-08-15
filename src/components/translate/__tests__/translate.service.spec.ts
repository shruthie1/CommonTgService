import { TranslateService, MAX_BATCH_SIZE } from '../translate.service';

/**
 * The load-bearing property of this service: a chat must ALWAYS render. Every failure mode here
 * (provider down, malformed JSON, empty keys, a no-op "translation") must degrade to showing the
 * original text, never to an exception and never to a dropped/misaligned message.
 *
 * Positional alignment matters as much as content: the UI renders translations underneath their
 * bubbles by index, so a length mismatch would attach text to the wrong message.
 */
describe('TranslateService', () => {
    const OLD_ENV = process.env.GROQ_API_KEYS;
    let service: TranslateService;
    let fetchMock: jest.Mock;

    const groqReply = (payload: unknown) => ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: typeof payload === 'string' ? payload : JSON.stringify(payload) } }] }),
        text: async () => '',
    });

    beforeEach(() => {
        process.env.GROQ_API_KEYS = 'key-a,key-b';
        service = new TranslateService();
        fetchMock = jest.fn();
        (global as any).fetch = fetchMock;
    });

    afterEach(() => {
        process.env.GROQ_API_KEYS = OLD_ENV;
        jest.restoreAllMocks();
    });

    it('translates a batch and preserves input order', async () => {
        fetchMock.mockResolvedValue(groqReply(['What are you doing', "It's very nice"]));
        const res = await service.translateBatch(['enna panra', 'romba nalla iruku']);
        expect(res.translations).toEqual(['What are you doing', "It's very nice"]);
    });

    it('returns ORIGINAL text when the provider errors — never throws', async () => {
        fetchMock.mockRejectedValue(new Error('network down'));
        const res = await service.translateBatch(['enna panra', 'vaa da']);
        expect(res.translations).toEqual(['enna panra', 'vaa da']);
    });

    it('returns ORIGINAL text on a non-2xx response', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited', json: async () => ({}) });
        const res = await service.translateBatch(['enna panra']);
        expect(res.translations).toEqual(['enna panra']);
    });

    it('returns ORIGINAL text when the response is unparseable', async () => {
        fetchMock.mockResolvedValue(groqReply('not json at all'));
        const res = await service.translateBatch(['enna panra']);
        expect(res.translations).toEqual(['enna panra']);
    });

    it('rejects a length mismatch rather than misaligning messages to bubbles', async () => {
        // Two inputs, one translation back. Attaching that single result would caption the WRONG
        // bubble, so the whole batch must fall back instead.
        fetchMock.mockResolvedValue(groqReply(['only one']));
        const res = await service.translateBatch(['first', 'second']);
        expect(res.translations).toEqual(['first', 'second']);
    });

    it('unwraps a JSON object wrapper (json_object mode nests the array under some key)', async () => {
        fetchMock.mockResolvedValue(groqReply({ translations: ['hello', 'world'] }));
        const res = await service.translateBatch(['vanakkam', 'ulagam']);
        expect(res.translations).toEqual(['hello', 'world']);
    });

    it('strips a markdown fence around the array', async () => {
        fetchMock.mockResolvedValue(groqReply('```json\n["hello"]\n```'));
        const res = await service.translateBatch(['vanakkam']);
        expect(res.translations).toEqual(['hello']);
    });

    it('caches by text, so re-scrolling a chat does not re-call the provider', async () => {
        fetchMock.mockResolvedValue(groqReply(['What are you doing']));
        await service.translateBatch(['enna panra']);
        const second = await service.translateBatch(['enna panra']);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(second.translations).toEqual(['What are you doing']);
        expect(second.cached).toBe(1);
    });

    it('does not cache a no-op translation (provider echoed the input back)', async () => {
        // Google Translate does exactly this on romanised Tamil. Caching it would make the failure
        // permanent for that message.
        fetchMock.mockResolvedValue(groqReply(['enna panra']));
        await service.translateBatch(['enna panra']);
        fetchMock.mockResolvedValue(groqReply(['What are you doing']));
        const second = await service.translateBatch(['enna panra']);
        expect(second.translations).toEqual(['What are you doing']);
    });

    it('splits oversized input into provider calls of at most MAX_BATCH_SIZE (6000 TPM ceiling)', async () => {
        const inputs = Array.from({ length: MAX_BATCH_SIZE * 2 + 3 }, (_, i) => `msg-${i}`);
        fetchMock.mockImplementation(async (_url: string, init: any) => {
            const body = JSON.parse(init.body);
            const count = (body.messages[0].content.match(/^\d+\. /gm) || []).length;
            expect(count).toBeLessThanOrEqual(MAX_BATCH_SIZE);
            return groqReply(Array.from({ length: count }, (_, i) => `t-${i}`));
        });
        await service.translateBatch(inputs);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('rotates keys across calls so one key does not absorb the whole daily quota', async () => {
        fetchMock.mockResolvedValue(groqReply(['a']));
        await service.translateBatch(['one']);
        await service.translateBatch(['two']);
        const used = fetchMock.mock.calls.map(c => c[1].headers.Authorization);
        expect(new Set(used).size).toBe(2);
    });

    it('degrades to original text when no keys are configured', async () => {
        process.env.GROQ_API_KEYS = '';
        const bare = new TranslateService();
        const res = await bare.translateBatch(['enna panra']);
        expect(res.translations).toEqual(['enna panra']);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('handles empty input and blank messages without calling the provider', async () => {
        expect((await service.translateBatch([])).translations).toEqual([]);
        const res = await service.translateBatch(['', '   ']);
        expect(res.translations).toEqual(['', '']);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    describe('conversation context', () => {
        it('sends earlier turns as REFERENCE ONLY and does not translate them', async () => {
            fetchMock.mockResolvedValue(groqReply(['later']));
            await service.translateBatch(['apram'], 'English', [
                { speaker: 'them', text: 'photo anuppu' },
                { speaker: 'me', text: 'ille da' },
            ]);
            const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content;
            expect(prompt).toContain('photo anuppu');
            expect(prompt).toMatch(/reference ONLY/i);
            expect(prompt).toMatch(/do NOT translate/i);
            // Only the one target message is in the numbered translate list.
            expect(prompt.match(/^1\. /gm)).toHaveLength(1);
        });

        it('carries the anti-invention rules that stopped the model hallucinating names', async () => {
            // Context WITHOUT these rules turned "photo anuppu" into "Take a photo of Anuppu".
            fetchMock.mockResolvedValue(groqReply(['ok']));
            await service.translateBatch(['sari'], 'English', [{ speaker: 'them', text: 'photo anuppu' }]);
            const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content;
            expect(prompt).toMatch(/do NOT invent/i);
        });

        it('caps how many prior turns are sent', async () => {
            fetchMock.mockResolvedValue(groqReply(['x']));
            const many = Array.from({ length: 40 }, (_, i) => ({ speaker: 'them', text: `ctx-${i}` }));
            await service.translateBatch(['sari'], 'English', many);
            const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content;
            expect(prompt).not.toContain('ctx-0');
            expect(prompt).toContain('ctx-39');
        });

        it('keys the cache by context — the same line under different context is re-translated', async () => {
            // "sari" legitimately means "ok" or "fine, then" depending on what preceded it. Serving a
            // cached translation resolved against someone else's context would be wrong.
            fetchMock.mockResolvedValue(groqReply(['ok']));
            await service.translateBatch(['sari'], 'English', [{ text: 'first thread' }]);
            fetchMock.mockResolvedValue(groqReply(['fine, then']));
            const second = await service.translateBatch(['sari'], 'English', [{ text: 'different thread' }]);
            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(second.translations).toEqual(['fine, then']);
        });

        it('still caches when the context is identical', async () => {
            fetchMock.mockResolvedValue(groqReply(['ok']));
            const ctx = [{ text: 'same' }];
            await service.translateBatch(['sari'], 'English', ctx);
            const second = await service.translateBatch(['sari'], 'English', ctx);
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(second.cached).toBe(1);
        });
    });

    describe('model fallback', () => {
        it('retries on the fallback model when the primary fails, and still returns translations', async () => {
            fetchMock
                .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'daily cap', json: async () => ({}) })
                .mockResolvedValueOnce(groqReply(['What are you doing']));
            const res = await service.translateBatch(['enna panra']);
            expect(res.translations).toEqual(['What are you doing']);
            const models = fetchMock.mock.calls.map(c => JSON.parse(c[1].body).model);
            expect(models[0]).not.toEqual(models[1]);
        });

        it('falls back to ORIGINAL text when BOTH models fail', async () => {
            fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'down', json: async () => ({}) });
            const res = await service.translateBatch(['enna panra']);
            expect(res.translations).toEqual(['enna panra']);
        });
    });

    it('asks for an OBJECT-shaped JSON response (json_object mode rejects a bare array)', () => {
        // gpt-oss-120b 400s with "Failed to generate JSON" when asked for a top-level array while
        // response_format=json_object is set. That silently demoted EVERY request to the fallback
        // model — the primary never ran, and only an end-to-end run against the real API revealed it.
        fetchMock.mockResolvedValue(groqReply({ translations: ['later'] }));
        return service.translateBatch(['apram']).then(() => {
            const body = JSON.parse(fetchMock.mock.calls[0][1].body);
            expect(body.response_format).toEqual({ type: 'json_object' });
            expect(body.messages[0].content).toContain('"translations"');
            expect(body.messages[0].content).not.toMatch(/ONLY a JSON array/i);
        });
    });
});
