import {
  setBotsServiceInstance,
  getBotsServiceInstance,
  tryGetBotsServiceInstance,
} from '../bot.service.instance';

describe('bot.service.instance', () => {
  it('throws when instance not initialized', () => {
    // ensure clean state by setting to null via a fresh require is not possible,
    // but since tests run before any set, getter should throw first.
    expect(() => getBotsServiceInstance()).toThrow(
      'BotsService instance not initialized. Make sure to call setBotsServiceInstance first.',
    );
  });

  it('tryGet returns null when instance not initialized (no throw)', () => {
    // Runs before any set(), so the non-throwing accessor yields null.
    expect(tryGetBotsServiceInstance()).toBeNull();
  });

  it('tryGet returns the instance once set', () => {
    const fake = { name: 'fake' } as any;
    setBotsServiceInstance(fake);
    expect(tryGetBotsServiceInstance()).toBe(fake);
  });

  it('set then get returns the same instance', () => {
    const fake = { name: 'fake-bots-service' } as any;
    setBotsServiceInstance(fake);
    expect(getBotsServiceInstance()).toBe(fake);
  });

  it('overwrites previously set instance', () => {
    const a = { id: 'a' } as any;
    const b = { id: 'b' } as any;
    setBotsServiceInstance(a);
    setBotsServiceInstance(b);
    expect(getBotsServiceInstance()).toBe(b);
  });
});
