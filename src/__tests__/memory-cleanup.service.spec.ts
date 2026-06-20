/**
 * MemoryCleanerService is currently an intentionally-empty @Injectable. Its prior
 * heap-monitor/GC implementation was removed in commit f05d14c ("okayish"). It is
 * re-exported from src/index.ts but is NOT registered as a provider in any NestJS
 * module, so the application never instantiates it.
 *
 * These tests document that reality rather than re-creating deleted behavior. If
 * real cleanup behavior is reintroduced, replace this file with behavior tests
 * (and wire the provider into a module).
 */
import { MemoryCleanerService } from '../memory-cleanup.service';

describe('MemoryCleanerService', () => {
    it('constructs without throwing (no-op injectable)', () => {
        expect(() => new MemoryCleanerService()).not.toThrow();
    });

    it('is a plain instance with no lifecycle behavior wired in', () => {
        const svc = new MemoryCleanerService();
        expect(svc).toBeInstanceOf(MemoryCleanerService);
        // Deliberately exposes no methods/timers — this guards against a silent,
        // partial reintroduction of the old implementation without its tests.
        const ownMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(svc))
            .filter((n) => n !== 'constructor');
        expect(ownMethods).toEqual([]);
    });
});
