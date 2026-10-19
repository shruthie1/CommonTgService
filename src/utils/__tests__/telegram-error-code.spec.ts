import { RPCMessageToError } from 'telegram/errors';
import { hasTelegramErrorCode, isFloodWaitError } from '../telegram-error-code';

const real = (code: string, errorCode = 400) =>
  RPCMessageToError({ errorMessage: code, errorCode } as any, { className: 'channels.JoinChannel' } as any);

describe('telegram-error-code', () => {
  it('matches the bare code from a real GramJS RPCError', () => {
    expect(hasTelegramErrorCode(real('INVITE_REQUEST_SENT'), 'INVITE_REQUEST_SENT')).toBe(true);
    expect(hasTelegramErrorCode(real('CHANNELS_TOO_MUCH'), 'CHANNELS_TOO_MUCH')).toBe(true);
  });

  it('matches the code inside message text when errorMessage is absent', () => {
    expect(hasTelegramErrorCode(new Error('400: INVITE_REQUEST_SENT (caused by channels.JoinChannel)'), 'INVITE_REQUEST_SENT')).toBe(true);
    expect(hasTelegramErrorCode('400: CHANNELS_TOO_MUCH', 'CHANNELS_TOO_MUCH')).toBe(true);
    expect(hasTelegramErrorCode({ error: { errorMessage: 'CHANNELS_TOO_MUCH' } }, 'CHANNELS_TOO_MUCH')).toBe(true);
  });

  it('matches whole tokens only', () => {
    expect(hasTelegramErrorCode(real('USER_CHANNELS_TOO_MUCH'), 'CHANNELS_TOO_MUCH')).toBe(false);
    expect(hasTelegramErrorCode(real('CHANNEL_PRIVATE'), 'INVITE_REQUEST_SENT')).toBe(false);
    expect(hasTelegramErrorCode(null, 'CHANNELS_TOO_MUCH')).toBe(false);
  });

  it('detects flood waits in class, code and text forms', () => {
    expect(isFloodWaitError(real('FLOOD_WAIT_30', 420))).toBe(true);
    expect(isFloodWaitError(new Error('A wait of 30 seconds is required (caused by channels.JoinChannel)'))).toBe(true);
    expect(isFloodWaitError(new Error('420: FLOOD_WAIT_30'))).toBe(true);
    expect(isFloodWaitError({ errorMessage: 'FLOOD_PREMIUM_WAIT_5' })).toBe(true);
  });

  it('does not treat other errors as flood waits', () => {
    expect(isFloodWaitError(real('INVITE_REQUEST_SENT'))).toBe(false);
    expect(isFloodWaitError(new Error('TIMEOUT'))).toBe(false);
    expect(isFloodWaitError(new Error('A wait of 10 seconds is required before sending another message in this chat'))).toBe(false);
  });
});
