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
    delete process.env.TELEGRAM_CHANNEL_CONFIG_CLIENT_UPDATES;
    process.env.updatesChannel = '-100777';
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const { notifTarget, ppplTarget } = load();
    expect(notifTarget().token).toBe('tok1');
    expect(ppplTarget()).toEqual({ token: 'tok2', chatId: '-100777' });
    expect(notifTarget().token).toBe('tok1'); // wraps back around
    expect(logSpy).toHaveBeenCalledWith('[bot-notice] kind=pppl_source source=bot_tokens chat=-100777');
    logSpy.mockRestore();
  });

  test('2026-11-23: the updates channel has no hard-coded fallback (the old public group); none configured throws', () => {
    process.env.BOT_TOKENS = 'tok1';
    delete process.env.updatesChannel;
    delete process.env.TELEGRAM_CHANNEL_CONFIG_CLIENT_UPDATES;
    const { ppplTarget } = load();
    expect(() => ppplTarget()).toThrow('No updates channel configured');
  });

  test('2026-11-23: a send to the CLIENT_UPDATES channel rotates through the CLIENT_UPDATES config bots, not BOT_TOKENS', () => {
    process.env.BOT_TOKENS = 'shared1,shared2';
    process.env.updatesChannel = '-1003980548286';
    process.env.TELEGRAM_CHANNEL_CONFIG_CLIENT_UPDATES = '-1003980548286::CLIENT_UPDATES::cuA, cuB';
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const { ppplTarget, notifTarget } = load();
    expect(ppplTarget()).toEqual({ token: 'cuA', chatId: '-1003980548286' });
    expect(ppplTarget(undefined)).toEqual({ token: 'cuB', chatId: '-1003980548286' });
    expect(ppplTarget('-1003980548286')).toEqual({ token: 'cuA', chatId: '-1003980548286' });
    expect(notifTarget().token).toBe('shared1'); // the accounts channel keeps BOT_TOKENS
    expect(ppplTarget('-555').token).toBe('shared2'); // any other chat keeps BOT_TOKENS
    expect(ppplTarget(undefined, 'explicit')).toEqual({ token: 'explicit', chatId: '-1003980548286' });
    expect(logSpy.mock.calls.map(c => c[0])).toEqual([
      '[bot-notice] kind=pppl_source source=client_updates_config chat=-1003980548286',
      '[bot-notice] kind=pppl_source source=bot_tokens chat=-555',
    ]);
    logSpy.mockRestore();
  });

  test('2026-11-23: without updatesChannel the CLIENT_UPDATES config channel is the default chat', () => {
    process.env.BOT_TOKENS = 'shared1';
    delete process.env.updatesChannel;
    process.env.TELEGRAM_CHANNEL_CONFIG_CLIENT_UPDATES = '-100123::CLIENT_UPDATES::cuA';
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const { ppplTarget } = load();
    expect(ppplTarget()).toEqual({ token: 'cuA', chatId: '-100123' });
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
    process.env.updatesChannel = '-100777';
    delete process.env.TELEGRAM_CHANNEL_CONFIG_CLIENT_UPDATES;
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const { ppplTarget } = load();
    expect(() => ppplTarget()).toThrow('No bot tokens configured');
    errSpy.mockRestore();
  });
});
