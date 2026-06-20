// A stable post mock shared across all freshly-instantiated module registries.
const mockedPost = jest.fn();
jest.mock('axios', () => ({
  __esModule: true,
  default: { post: (...args: any[]) => mockedPost(...args) },
  post: (...args: any[]) => mockedPost(...args),
}));

const ENV_KEY = 'TELEGRAM_CHANNEL_CONFIG_USER_WARNINGS';
const ORIGINAL_ENV = process.env;

// Load a fresh copy of the module so the singleton re-reads env vars.
function loadFresh() {
  let mod: any;
  jest.isolateModules(() => {
    mod = require('../ChannelLogger');
  });
  return mod;
}

describe('ChannelLogger', () => {
  beforeEach(() => {
    jest.resetModules();
    mockedPost.mockReset();
    process.env = { ...ORIGINAL_ENV };
    // strip any pre-existing channel config keys
    Object.keys(process.env)
      .filter((k) => k.startsWith('TELEGRAM_CHANNEL_CONFIG_'))
      .forEach((k) => delete process.env[k]);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('getInstance returns a singleton', () => {
    const { ChannelLogger } = loadFresh();
    expect(ChannelLogger.getInstance()).toBe(ChannelLogger.getInstance());
  });

  test('parses a valid channel config and reports it configured', () => {
    process.env[ENV_KEY] = '-100123::warnings::tok1,tok2';
    const { ChannelLogger, ChannelType } = loadFresh();
    const logger = ChannelLogger.getInstance();
    expect(logger.isChannelConfigured(ChannelType.USER_WARNINGS)).toBe(true);
    expect(logger.getConfiguredChannels()).toContain(ChannelType.USER_WARNINGS);
  });

  test('a token that itself contains :: is rejoined correctly', () => {
    process.env[ENV_KEY] = '-100123::warnings::tok::with::colons';
    const { ChannelLogger, ChannelType } = loadFresh();
    expect(ChannelLogger.getInstance().isChannelConfigured(ChannelType.USER_WARNINGS)).toBe(true);
  });

  test('config with too few parts is treated as invalid', () => {
    process.env[ENV_KEY] = '-100123::warnings';
    const { ChannelLogger, ChannelType } = loadFresh();
    expect(ChannelLogger.getInstance().isChannelConfigured(ChannelType.USER_WARNINGS)).toBe(false);
  });

  test('config with no usable tokens is treated as invalid', () => {
    process.env[ENV_KEY] = '-100123::warnings:: , ';
    const { ChannelLogger, ChannelType } = loadFresh();
    expect(ChannelLogger.getInstance().isChannelConfigured(ChannelType.USER_WARNINGS)).toBe(false);
  });

  test('unconfigured channels report false', () => {
    const { ChannelLogger, ChannelType } = loadFresh();
    expect(ChannelLogger.getInstance().isChannelConfigured(ChannelType.LOGIN_FAILURES)).toBe(false);
  });

  test('sendMessage returns false for an unconfigured channel', async () => {
    const { ChannelLogger, ChannelType } = loadFresh();
    const logger = ChannelLogger.getInstance();
    const ok = await logger.send(ChannelType.HTTP_FAILURES, 'hi');
    expect(ok).toBe(false);
    expect(mockedPost).not.toHaveBeenCalled();
  });

  test('sendUserWarning posts to telegram and returns true on success', async () => {
    process.env[ENV_KEY] = '-100123::warnings::tok1';
    mockedPost.mockResolvedValue({ status: 200 });
    const { ChannelLogger } = loadFresh();
    const ok = await ChannelLogger.getInstance().sendUserWarning('hello', { parse_mode: 'HTML' });
    expect(ok).toBe(true);
    expect(mockedPost).toHaveBeenCalledTimes(1);
    const [url, payload] = mockedPost.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/bottok1/sendMessage');
    expect(payload).toMatchObject({ chat_id: '-100123', text: 'hello', parse_mode: 'HTML' });
  });

  test('round-robins through tokens across calls', async () => {
    process.env[ENV_KEY] = '-100123::warnings::tokA,tokB';
    mockedPost.mockResolvedValue({ status: 200 });
    const { ChannelLogger } = loadFresh();
    const logger = ChannelLogger.getInstance();
    await logger.sendUserWarning('1');
    await logger.sendUserWarning('2');
    await logger.sendUserWarning('3');
    expect(mockedPost.mock.calls[0][0]).toContain('bottokA');
    expect(mockedPost.mock.calls[1][0]).toContain('bottokB');
    expect(mockedPost.mock.calls[2][0]).toContain('bottokA');
  });

  test('retries once on failure then returns false', async () => {
    process.env[ENV_KEY] = '-100123::warnings::tok1';
    mockedPost.mockRejectedValue({ message: 'boom' });
    const { ChannelLogger } = loadFresh();
    const ok = await ChannelLogger.getInstance().sendUserWarning('hi');
    expect(ok).toBe(false);
    // default retries = 1 => 2 attempts total
    expect(mockedPost).toHaveBeenCalledTimes(2);
  });

  test('succeeds on the retry attempt after an initial failure', async () => {
    process.env[ENV_KEY] = '-100123::warnings::tok1,tok2';
    mockedPost
      .mockRejectedValueOnce({ response: { data: { description: 'temporary' } } })
      .mockResolvedValueOnce({ status: 200 });
    const { ChannelLogger } = loadFresh();
    const ok = await ChannelLogger.getInstance().sendUserWarning('hi');
    expect(ok).toBe(true);
    expect(mockedPost).toHaveBeenCalledTimes(2);
  });

  test('all the typed convenience senders delegate to sendMessage', async () => {
    // configure every channel so each send actually posts
    const cfg = (id: string) => `${id}::n::tok`;
    process.env.TELEGRAM_CHANNEL_CONFIG_USER_WARNINGS = cfg('-1');
    process.env.TELEGRAM_CHANNEL_CONFIG_HTTP_FAILURES = cfg('-2');
    process.env.TELEGRAM_CHANNEL_CONFIG_LOGIN_FAILURES = cfg('-3');
    process.env.TELEGRAM_CHANNEL_CONFIG_CHANNEL_NOTIFICATIONS = cfg('-4');
    process.env.TELEGRAM_CHANNEL_CONFIG_SAVED = cfg('-5');
    process.env.TELEGRAM_CHANNEL_CONFIG_CLIENT_UPDATES = cfg('-6');
    process.env.TELEGRAM_CHANNEL_CONFIG_PROMOTION_FAILURES = cfg('-7');
    process.env.TELEGRAM_CHANNEL_CONFIG_PROMOTIONS_INFO = cfg('-8');
    process.env.TELEGRAM_CHANNEL_CONFIG_GENERAL_ERRORS = cfg('-9');
    mockedPost.mockResolvedValue({ status: 200 });

    const { ChannelLogger } = loadFresh();
    const logger = ChannelLogger.getInstance();

    await expect(logger.sendUserWarning('a')).resolves.toBe(true);
    await expect(logger.sendHttpFailures('a')).resolves.toBe(true);
    await expect(logger.sendLoginFailure('a')).resolves.toBe(true);
    await expect(logger.sendChannelNotification('a')).resolves.toBe(true);
    await expect(logger.sendSavedMessage('a')).resolves.toBe(true);
    await expect(logger.sendClientUpdate('a')).resolves.toBe(true);
    await expect(logger.sendPromotionFailure('a')).resolves.toBe(true);
    await expect(logger.sendPromotionsInfo('a')).resolves.toBe(true);
    await expect(logger.sendGeneralError('a')).resolves.toBe(true);
    expect(mockedPost).toHaveBeenCalledTimes(9);
  });

  test('exported clog is a ChannelLogger instance', () => {
    const { clog, ChannelLogger } = loadFresh();
    expect(clog).toBeInstanceOf(ChannelLogger);
  });
});
