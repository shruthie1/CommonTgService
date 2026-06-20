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

  test('notifbot builds a sendMessage URL with the default chat id', () => {
    process.env.BOT_TOKENS = 'tok1,tok2';
    delete process.env.accountsChannel;
    const { notifbot } = load();
    const url = notifbot();
    expect(url).toBe('https://api.telegram.org/bottok1/sendMessage?chat_id=-1001801844217');
  });

  test('notifbot uses the accountsChannel env override', () => {
    process.env.BOT_TOKENS = 'tok1';
    process.env.accountsChannel = '-999';
    const { notifbot } = load();
    expect(notifbot()).toContain('chat_id=-999');
  });

  test('notifbot rotates tokens round-robin when no explicit token is passed', () => {
    process.env.BOT_TOKENS = 'tok1,tok2';
    const { notifbot } = load();
    expect(notifbot()).toContain('bottok1');
    expect(notifbot()).toContain('bottok2');
    expect(notifbot()).toContain('bottok1'); // wraps back around
  });

  test('notifbot uses an explicit token and does not rotate', () => {
    process.env.BOT_TOKENS = 'tok1,tok2';
    const { notifbot } = load();
    expect(notifbot('-1', 'customTok')).toContain('botcustomTok');
    // since no rotation happened, the next default call still starts at tok1
    expect(notifbot()).toContain('bottok1');
  });

  test('ppplbot builds a URL with its default updates channel', () => {
    process.env.BOT_TOKENS = 'tok1';
    delete process.env.updatesChannel;
    const { ppplbot } = load();
    expect(ppplbot()).toBe('https://api.telegram.org/bottok1/sendMessage?chat_id=-1001972065816');
  });

  test('ppplbot honors a custom chat id and explicit token', () => {
    process.env.BOT_TOKENS = 'tok1,tok2';
    const { ppplbot } = load();
    const url = ppplbot('-555', 'explicitTok');
    expect(url).toContain('chat_id=-555');
    expect(url).toContain('botexplicitTok');
  });
});
