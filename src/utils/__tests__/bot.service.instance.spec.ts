import {
  setBotsServiceInstance,
  getBotsServiceInstance,
} from '../bot.service.instance';

describe('bot.service.instance', () => {
  it('throws when instance not initialized', () => {
    // ensure clean state by setting to null via a fresh require is not possible,
    // but since tests run before any set, getter should throw first.
    expect(() => getBotsServiceInstance()).toThrow(
      'BotsService instance not initialized. Make sure to call setBotsServiceInstance first.',
    );
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
