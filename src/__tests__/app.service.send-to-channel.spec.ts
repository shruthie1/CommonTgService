jest.mock('../utils/bot-notice', () => ({
  sendBotNotice: jest.fn(),
}));
import * as utils from '../utils';
import { sendBotNotice } from '../utils/bot-notice';
import { AppService } from '../app.service';

describe('AppService.sendToChannel (rich message)', () => {
  const fetchSpy = jest.spyOn(utils, 'fetchWithTimeout');
  const notice = sendBotNotice as jest.Mock;
  const sendMessageByCategory = jest.fn();

  const service = (): AppService =>
    Object.assign(Object.create(AppService.prototype), { botsService: { sendMessageByCategory } });

  beforeEach(() => {
    jest.clearAllMocks();
    fetchSpy.mockResolvedValue({ data: { ok: true, result: 'legacy' } } as any);
    notice.mockResolvedValue({ sent: true, data: { ok: true, result: { message_id: 7 } } });
  });

  it('known VC channel without a token still goes through the category bots (unchanged)', async () => {
    sendMessageByCategory.mockResolvedValue(true);
    const res = await service().sendToChannel('-1002529408777', '', 'Opened VcUI');
    expect(res).toEqual({ ok: true });
    expect(sendMessageByCategory).toHaveBeenCalledWith('VC_NOTIFICATIONS', expect.objectContaining({ title: 'Opened VcUI' }));
    expect(notice).not.toHaveBeenCalled();
  });

  it('other chats are sent as a rich message to the same chat, returning Telegram\'s body', async () => {
    const res = await service().sendToChannel('-555', '', 'Video%20Data%20Fetch%20Error');
    expect(notice).toHaveBeenCalledWith('pppl', expect.objectContaining({ title: 'Video Data Fetch Error' }), { chatId: '-555', token: undefined });
    expect(res).toEqual({ ok: true, result: { message_id: 7 } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a failed send returns Telegram\'s error body instead of throwing', async () => {
    notice.mockResolvedValue({ sent: false, data: { ok: false, description: 'chat not found' } });
    expect(await service().sendToChannel('-555', '', 'x')).toEqual({ ok: false, description: 'chat not found' });
  });

  it('forwards an explicit bot token', async () => {
    await service().sendToChannel('-555', 'mytoken', 'hi');
    expect(notice).toHaveBeenCalledWith('pppl', expect.objectContaining({ title: 'hi' }), { chatId: '-555', token: 'mytoken' });
  });
});
