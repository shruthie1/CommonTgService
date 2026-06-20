import { RateLimiter } from '../rate-limiter';

describe('RateLimiter', () => {
    afterEach(() => jest.useRealTimers());

    test('allows up to maxRequests within window then blocks', async () => {
        const rl = new RateLimiter(1000, 2);
        expect(await rl.checkRateLimit('k')).toBe(true);
        expect(await rl.checkRateLimit('k')).toBe(true);
        expect(await rl.checkRateLimit('k')).toBe(false);
    });

    test('separate keys have independent budgets', async () => {
        const rl = new RateLimiter(1000, 1);
        expect(await rl.checkRateLimit('a')).toBe(true);
        expect(await rl.checkRateLimit('b')).toBe(true);
        expect(await rl.checkRateLimit('a')).toBe(false);
    });

    test('timestamps outside window expire and free budget', () => {
        jest.useFakeTimers();
        jest.setSystemTime(0);
        const rl = new RateLimiter(1000, 1);
        return (async () => {
            expect(await rl.checkRateLimit('k')).toBe(true);
            expect(await rl.checkRateLimit('k')).toBe(false);
            jest.setSystemTime(1500);
            // old timestamp now outside window -> allowed again
            expect(await rl.checkRateLimit('k')).toBe(true);
        })();
    });

    test('resetLimit clears the budget', async () => {
        const rl = new RateLimiter(10000, 1);
        expect(await rl.checkRateLimit('k')).toBe(true);
        expect(await rl.checkRateLimit('k')).toBe(false);
        rl.resetLimit('k');
        expect(await rl.checkRateLimit('k')).toBe(true);
    });

    test('waitForRateLimit resolves immediately when under limit', async () => {
        const rl = new RateLimiter(1000, 5);
        await expect(rl.waitForRateLimit('k')).resolves.toBeUndefined();
    });

    test('waitForRateLimit polls until budget frees up', async () => {
        jest.useFakeTimers();
        jest.setSystemTime(0);
        const rl = new RateLimiter(1000, 1);
        await rl.checkRateLimit('k'); // consume the single slot

        const waitPromise = rl.waitForRateLimit('k');
        // advance past the 1s poll interval AND past the window so the old ts expires
        await jest.advanceTimersByTimeAsync(1100);
        await expect(waitPromise).resolves.toBeUndefined();
    });
});
