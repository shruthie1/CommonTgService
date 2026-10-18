describe('logbots', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  const load = () => require('../logbots');

  test('getBotToken throws when BOT_TOKENS is not set', () => {
    delete process.env.BOT_TOKENS;
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { getBotToken } = load();
    expect(() => getBotToken()).toThrow('No bot tokens configured');
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  test('getBotToken returns the first configured token', () => {
    process.env.BOT_TOKENS = 'tokenA,tokenB';
    const { getBotToken } = load();
    expect(getBotToken()).toBe('tokenA');
  });

  test('BOT_TOKENS filters out empty entries', () => {
    process.env.BOT_TOKENS = 'tokenA,,tokenB,';
    const { getBotToken } = load();
    expect(getBotToken()).toBe('tokenA');
  });

  test('notifTarget returns the default accounts chat with the first token', () => {
    process.env.BOT_TOKENS = 'tok1,tok2';
    delete process.env.accountsChannel;
    const { notifTarget } = load();
    expect(notifTarget()).toEqual({ token: 'tok1', chatId: '-1001801844217' });
  });

  test('notifTarget uses the accountsChannel env override', () => {
    process.env.BOT_TOKENS = 'tok1';
    process.env.accountsChannel = '-999';
    const { notifTarget } = load();
    expect(notifTarget().chatId).toBe('-999');
  });

  test('targets rotate tokens round-robin (shared by notif and pppl) when no explicit token is passed', () => {
    process.env.BOT_TOKENS = 'tok1,tok2';
    delete process.env.accountsChannel;
    delete process.env.updatesChannel;
    const { notifTarget, ppplTarget } = load();
    expect(notifTarget().token).toBe('tok1');
    expect(ppplTarget()).toEqual({ token: 'tok2', chatId: '-1001972065816' });
    expect(notifTarget().token).toBe('tok1'); // wraps back around
  });

  test('an explicit token and chat are used as given and do not rotate', () => {
    process.env.BOT_TOKENS = 'tok1,tok2';
    const { notifTarget, ppplTarget } = load();
    expect(notifTarget('-1', 'customTok')).toEqual({ token: 'customTok', chatId: '-1' });
    expect(ppplTarget('-555', 'explicitTok')).toEqual({ token: 'explicitTok', chatId: '-555' });
    expect(notifTarget().token).toBe('tok1');
  });

  test('targets throw when BOT_TOKENS is not configured', () => {
    delete process.env.BOT_TOKENS;
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { ppplTarget } = load();
    expect(() => ppplTarget()).toThrow('No bot tokens configured');
    errSpy.mockRestore();
  });
});
