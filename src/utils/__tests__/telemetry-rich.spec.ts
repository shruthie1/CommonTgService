import { telemetryToHtml } from '../rich-message';
import { AppService } from '../../app.service';

// What the live payment site posts (analytics.ts: escaped text, "Name:" prefix bolded, \n\n padding).
const head = '<b>keerthi2</b> · <code>2409:40d0:2403:852f:8000::</code>\n\n';

async function send(message: string) {
  const botsService = { sendHtmlByCategory: jest.fn().mockResolvedValue(true), sendMessageByCategory: jest.fn() };
  const service = Object.assign(Object.create(AppService.prototype), { botsService });
  const resp = await service.sendPaymentTelemetry(message);
  const [category, html] = botsService.sendHtmlByCategory.mock.calls[0];
  expect(botsService.sendMessageByCategory).not.toHaveBeenCalled();
  return { resp, category, html };
}

describe('payment telemetry rendering (compact classic HTML, no IP)', () => {
  test('a chat message is one quote "Name: text" under the client name; the IP is dropped', async () => {
    const { resp, category, html } = await send(`${head}\n\n<b>Kirthi Gowda:</b> Hii babiee....!!\n\n`);
    expect(resp).toEqual({ ok: true });
    expect(category).toBe('WEB_TELEMETRY');
    expect(html).toBe('<b>keerthi2</b>\n<blockquote><b>Kirthi Gowda:</b> Hii babiee....!!</blockquote>');
    expect(html).not.toContain('2409');
  });

  test('multi-line user text keeps its line breaks and stays escaped', async () => {
    const { html } = await send(`${head}\n\n<b>User:</b> line one\nline two: with colon\nthree &amp; &lt;b&gt;\n\n`);
    expect(html).toBe('<b>keerthi2</b>\n<blockquote><b>User:</b> line one\nline two: with colon\nthree &amp; &lt;b&gt;</blockquote>');
  });

  test('a long message is an expandable quote', () => {
    expect(telemetryToHtml(`${head}<b>User:</b> ${'x'.repeat(900)}`)).toContain('<blockquote expandable><b>User:</b> xxx');
  });

  test('form JSON becomes key: value lines without empty values', async () => {
    const { html } = await send(`${head}{&quot;phoneNumber&quot;:&quot;98&quot;,&quot;otp&quot;:&quot;&quot;}`);
    expect(html).toBe('<b>keerthi2</b>\nphoneNumber: <code>98</code>');
  });

  test('a short event is one line; an empty message is not sent', async () => {
    expect((await send(`${head}LOGIN TAB`)).html).toBe('<b>keerthi2</b> · LOGIN TAB');
    expect(telemetryToHtml(head)).toBe('<b>keerthi2</b>');
    const botsService = { sendHtmlByCategory: jest.fn() };
    const service = Object.assign(Object.create(AppService.prototype), { botsService });
    expect(await service.sendPaymentTelemetry('   ')).toEqual({ ok: false });
    expect(botsService.sendHtmlByCategory).not.toHaveBeenCalled();
  });
});
