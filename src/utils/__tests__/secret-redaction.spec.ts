import { Logger } from '../logger';
import { parseError } from '../parseError';

// Shape of a GramJS StringSession: "1" + base64 of dc/ip/port/256-byte auth key (~350 chars).
const SESSION = '1' + 'BQANOTEuMTA4LjU2LjE0MAG7'.repeat(15) + 'Ab+/cD==';
const BOT_TOKEN = '7012345678:AAH' + 'x'.repeat(32);

function captureStdout(fn: () => void): string {
  const out: string[] = [];
  const spyOut = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => { out.push(String(chunk)); return true; });
  const spyErr = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => { out.push(String(chunk)); return true; });
  try { fn(); } finally { spyOut.mockRestore(); spyErr.mockRestore(); }
  return out.join('');
}

describe('secret redaction in logs (PENDING 24-5)', () => {
  const logger = new Logger('RedactionSpec');

  test('object context: session / password / apiKey / token values never reach stdout; identifiers do', () => {
    const out = captureStdout(() => logger.log('Client returned to buffer pool:', {
      mobile: '919000012345', clientId: 'c1', status: 'active',
      session: SESSION, password: 'Secret2FA@1', apiKey: 'k-123456', token: BOT_TOKEN,
      _doc: { session: SESSION },
    }));
    expect(out).not.toContain(SESSION);
    expect(out).not.toContain('Secret2FA@1');
    expect(out).not.toContain('k-123456');
    expect(out).not.toContain(BOT_TOKEN);
    expect(out).toContain('919000012345');
    expect(out).toContain('c1');
  });

  test('session-shaped and bot-token-shaped strings inside a message are scrubbed (error and warn too)', () => {
    const out = captureStdout(() => {
      logger.error(`E11000 duplicate key error collection: tgclients.users index: session_1 dup key: { session: "${SESSION}" }`);
      logger.warn(`call https://api.telegram.org/bot${BOT_TOKEN}/getMe failed`);
    });
    expect(out).not.toContain(SESSION);
    expect(out).not.toContain(BOT_TOKEN);
    expect(out).toContain('E11000 duplicate key');
  });

  test('parseError message (logged, notified, stored) has session strings scrubbed', () => {
    const err = new Error(`E11000 duplicate key error collection: tgclients.users index: session_1 dup key: { session: "${SESSION}" }`);
    const res = parseError(err, 'create user', false);
    expect(res.message).not.toContain(SESSION);
    expect(res.message).toContain('E11000 duplicate key');
    const tgErr = Object.assign(new Error('x'), { errorMessage: `AUTH_KEY_UNREGISTERED ${SESSION}` });
    expect(parseError(tgErr, 'p', false).message).not.toContain(SESSION);
    expect(parseError(tgErr, 'p', false).message).toContain('AUTH_KEY_UNREGISTERED');
  });

  test('short ordinary text is untouched', () => {
    const out = captureStdout(() => logger.log('Session rotated for 919000012345 (1 of 3)', { sessionCount: 2, session: '' }));
    expect(out).toContain('Session rotated for 919000012345 (1 of 3)');
    expect(out).toContain('"sessionCount"');
  });
});
