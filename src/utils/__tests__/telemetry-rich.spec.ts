import { formatRichMessageHtml, telemetryToRich } from '../rich-message';
import { AppService } from '../../app.service';

// What the live payment site posts (analytics.ts: escaped text, "Name:" prefix bolded, \n\n padding).
const head = '<b>keerthi2</b> · <code>2409:40d0:2403:852f:8000::</code>\n\n';
// As BotsService renders it: the notice's source (the site user) is the first line.
const render = (text: string) => { const input = telemetryToRich(text); return formatRichMessageHtml(input, { prefix: input.source }); };

async function send(message: string) {
  const botsService = { sendMessageByCategory: jest.fn().mockResolvedValue(true), sendHtmlByCategory: jest.fn() };
  const service = Object.assign(Object.create(AppService.prototype), { botsService });
  const resp = await service.sendPaymentTelemetry(message);
  const [category, input] = botsService.sendMessageByCategory.mock.calls[0];
  expect(botsService.sendHtmlByCategory).not.toHaveBeenCalled();
  return { resp, category, input };
}

describe('payment telemetry cards (client line first, no IP)', () => {
  test('a chat message is the client line plus one quote, with no title line', async () => {
    const { resp, category, input } = await send(`${head}\n\n<b>Kirthi Gowda:</b> Hii babiee....!!\n\n`);
    expect(resp).toEqual({ ok: true });
    expect(category).toBe('WEB_TELEMETRY');
    const html = formatRichMessageHtml(input, { prefix: input.source });
    expect(html).toBe('<b>keerthi2</b>\n<blockquote>Kirthi Gowda: Hii babiee....!!</blockquote>');
    expect(html).not.toContain('2409');
  });

  test('multi-line user text keeps its line breaks and stays escaped', () => {
    expect(render(`${head}<b>User:</b> line one\nline two\nthree &amp; &lt;b&gt;`)).toBe('<b>keerthi2</b>\n<blockquote>User: line one<br/>line two<br/>three &amp; &lt;b&gt;</blockquote>');
  });

  test('the signup form is a field table; internal send-code fields are dropped', () => {
    const phoneStep = JSON.stringify({ phoneNumber: '9876543210', phoneCountryCode: '+91', otp: '', password: '', firstName: 'Ravi', lastName: '', phoneCodeHash: 'abc', codeLength: 5 });
    expect(render(`${head}${phoneStep}`)).toBe('<b>keerthi2</b>\n<table bordered striped compact><tr><th colspan="2">Signup: phone</th></tr><tr><td><b>Name</b></td><td>Ravi</td></tr><tr><td><b>Phone</b></td><td><code>+919876543210</code></td></tr></table>');
    const codeStep = JSON.stringify({ phoneNumber: '9876543210', phoneCountryCode: '+91', otp: '12345', password: 'pw', codeType: 'app', deliveryMessage: 'Code sent' });
    const html = render(`${head}${codeStep}`);
    expect(html).toContain('Signup: code');
    expect(html).toContain('<tr><td><b>Code</b></td><td><code>12345</code></td></tr><tr><td><b>2FA</b></td><td><code>pw</code></td></tr>');
    expect(html).not.toMatch(/codeType|deliveryMessage/);
  });

  test('any other JSON object becomes one row per non-empty key', () => {
    expect(render(`${head}{"a":"1","b":""}`)).toBe('<b>keerthi2</b>\n<table bordered striped compact><tr><th colspan="2">Form</th></tr><tr><td><b>a</b></td><td><code>1</code></td></tr></table>');
  });

  test('event codes read as plain words', () => {
    const title = (body: string) => telemetryToRich(`${head}${body}`).title;
    expect(title('PayButton')).toBe('Payment site · tapped Pay');
    expect(title('LOGIN TAB')).toBe('Payment site · opened Login');
    expect(title('ChatOpened:keerthi2')).toBe('Payment site · opened the chat');
    expect(title('UPI ID Copied : abc@ybl')).toBe('Payment site · copied UPI abc@ybl');
    expect(title('PaymentOption_gpay')).toBe('Payment site · chose gpay');
    expect(title('SomethingNew')).toBe('Payment site · SomethingNew');
    expect(render(`${head}PayButton`)).toBe('<b>keerthi2</b><br/><br/><b>Payment site · tapped Pay</b><br/>');
  });

  test('an empty message is not sent', async () => {
    const botsService = { sendMessageByCategory: jest.fn() };
    const service = Object.assign(Object.create(AppService.prototype), { botsService });
    expect(await service.sendPaymentTelemetry('   ')).toEqual({ ok: false });
    expect(botsService.sendMessageByCategory).not.toHaveBeenCalled();
  });
});
