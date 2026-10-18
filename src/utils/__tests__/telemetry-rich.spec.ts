import { formatClassicNotificationHtml, formatRichMessageHtml } from '../rich-message';
import { AppService } from '../../app.service';

// What the live payment site posts (analytics.ts: escaped text, "Name:" prefix bolded, \n\n padding).
const head = '<b>keerthi2</b> · <code>2409:40d0:2403:852f:8000::</code>\n\n';

async function send(message: string) {
  const botsService = { sendMessageByCategory: jest.fn().mockResolvedValue(true) };
  const service = Object.assign(Object.create(AppService.prototype), { botsService });
  const resp = await service.sendPaymentTelemetry(message);
  const [category, input, options, allowServiceName] = botsService.sendMessageByCategory.mock.calls[0];
  return { resp, category, input, options, allowServiceName, html: formatRichMessageHtml(input) };
}

describe('payment telemetry rendering', () => {
  test('a chat message is a labelled quote block, not a table; no "UMS ·" prefix', async () => {
    const { resp, category, input, allowServiceName, html } = await send(`${head}\n\n<b>Kirthi Gowda:</b> Hii babiee....!!\n\n`);
    expect(resp).toEqual({ ok: true });
    expect(category).toBe('WEB_TELEMETRY');
    expect(allowServiceName).toBe(false);
    expect(input.title).toBe('keerthi2');
    expect(input.details).toBeUndefined();
    expect(html).toContain('<h3>ℹ️ keerthi2</h3>');
    // IP hidden on the name line: no extra line, no details block
    expect(html).toContain('<p><b>Kirthi Gowda</b> · <tg-spoiler><code>2409:40d0:2403:852f:8000::</code></tg-spoiler></p><blockquote>');
    expect(html).not.toContain('<details');
    expect(input.fields).toBeUndefined();
    expect(html).not.toContain('<table');
    expect(html).toContain('</tg-spoiler></p><blockquote>Hii babiee....!!</blockquote>');
  });

  test('multi-line user text stays verbatim in the quote, never in the collapsed details', async () => {
    const { html } = await send(`${head}\n\n<b>User:</b> line one\nline two: with colon\nthree &amp; &lt;b&gt;\n\n`);
    expect(html).toContain('</tg-spoiler></p><blockquote>line one<br/>line two: with colon<br/>three &amp; &lt;b&gt;</blockquote>');
        expect(html).not.toContain('<table');
  });

  test('form JSON is pretty-printed in a code block', async () => {
    const { input, html } = await send(`${head}{&quot;phoneNumber&quot;:&quot;98&quot;,&quot;otp&quot;:&quot;&quot;}`);
    expect(input.code).toEqual({ text: '{\n  "phoneNumber": "98",\n  "otp": ""\n}', language: 'json' });
    expect(html).toContain('<h3>ℹ️ keerthi2 · <tg-spoiler><code>2409:40d0:2403:852f:8000::</code></tg-spoiler></h3>');
    expect(html).toContain('<pre><code class="language-json">{\n  "phoneNumber": "98",'); // syntax-highlighted
  });

  test('a short event stays a plain line; classic fallback keeps the label + quote', async () => {
    const tab = await send(`${head}LOGIN TAB`);
    expect(tab.input).toEqual({ title: 'keerthi2', spoiler: '2409:40d0:2403:852f:8000::', summary: 'LOGIN TAB' });
    expect(tab.html).toContain('<p>LOGIN TAB · <tg-spoiler>');
    const chat = await send(`${head}<b>User:</b> hi`);
    expect(formatClassicNotificationHtml(chat.input)).toContain('<b>User</b>\n<i>hi</i>');
    const json = await send(`${head}{"a":1}`);
    expect(formatClassicNotificationHtml(json.input)).toContain('<pre><code class="language-json">{\n  "a": 1\n}</code></pre>');
  });
});
