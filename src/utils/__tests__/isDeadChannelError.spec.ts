import isDeadChannelError from '../isDeadChannelError';

describe('isDeadChannelError', () => {
  it('matches USERNAME_INVALID (whole token)', () => {
    expect(isDeadChannelError({ errorMessage: 'USERNAME_INVALID' })).toBe(true);
    expect(isDeadChannelError('RPCError: USERNAME_INVALID (400)')).toBe(true);
  });

  it('matches USERNAME_NOT_OCCUPIED', () => {
    expect(isDeadChannelError({ errorMessage: 'USERNAME_NOT_OCCUPIED' })).toBe(true);
  });

  it('matches the "No user has X as username" plain-text message', () => {
    expect(isDeadChannelError('sowmya2 :: No user has "parchayevahusnobod" as username')).toBe(true);
    expect(isDeadChannelError(new Error('No user has "batysregyon" as username'))).toBe(true);
  });

  it('reads from nested error wrapper', () => {
    expect(isDeadChannelError({ error: { errorMessage: 'USERNAME_INVALID' }, message: 'wrapped' })).toBe(true);
  });

  it('does NOT match private / invite / flood / approval errors (must not be deleted)', () => {
    expect(isDeadChannelError({ errorMessage: 'CHANNEL_PRIVATE' })).toBe(false);
    expect(isDeadChannelError({ errorMessage: 'INVITE_REQUEST_SENT' })).toBe(false);
    expect(isDeadChannelError({ errorMessage: 'CHANNELS_TOO_MUCH' })).toBe(false);
    expect(isDeadChannelError('A wait of 300 seconds is required (FLOOD_WAIT)')).toBe(false);
    expect(isDeadChannelError({ errorMessage: 'CHAT_INVALID' })).toBe(false);
  });

  it('handles null/empty/undefined safely', () => {
    expect(isDeadChannelError(null)).toBe(false);
    expect(isDeadChannelError(undefined)).toBe(false);
    expect(isDeadChannelError('')).toBe(false);
    expect(isDeadChannelError({})).toBe(false);
  });
});
