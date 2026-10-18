import { buttonsFromReplyMarkup, formatClassicNotificationHtml, formatRichMessageHtml, RICH_MESSAGE_MAX_CHARS, textToRichInput } from '../rich-message';

describe('formatRichMessageHtml', () => {
  test('client line, then icon + title, summary, and fields always in a table (ids as code)', () => {
    const html = formatRichMessageHtml({ title: 'Done', severity: 'success', summary: 'all good', fields: [{ label: 'Mobile', value: '91123' }, { label: 'Note', value: 'two words' }] }, { prefix: 'CMS' });
    expect(html.startsWith('<b>CMS</b><br/><b>Done</b><br/>')).toBe(true);
    expect(html).not.toContain('<h3>');
    expect(html).toContain('all good<br/>');
    expect(html).toContain('<table bordered striped compact><tr><td><b>Mobile</b></td><td><code>91123</code></td></tr><tr><td><b>Note</b></td><td>two words</td></tr></table>');
  });

  test('more than 3 fields, a long value, or fieldLayout table keeps the table', () => {
    const four = formatRichMessageHtml({ title: 'T', fields: [1, 2, 3, 4].map((n) => ({ label: `F${n}`, value: `v${n}` })) });
    expect(four).toContain('<tr><td><b>F1</b></td><td><code>v1</code></td></tr>');
    const long = formatRichMessageHtml({ title: 'T', fields: [{ label: 'Note', value: 'x'.repeat(41) }] });
    expect(long).toContain('<table');
    const forced = formatRichMessageHtml({ title: 'T', fields: [{ label: 'Survived', value: '2h 5m' }], fieldLayout: 'table' });
    expect(forced).toContain('<tr><td><b>Survived</b></td><td>2h 5m</td></tr>');
  });

  test('drops redundant client/username fields and empty values; escapes html', () => {
    const html = formatRichMessageHtml({ title: 'A<b>', fields: [{ label: 'Client', value: 'x' }, { label: 'Username', value: 'y' }, { label: 'Empty', value: '' }, { label: 'K', value: '<&>' }] });
    expect(html).not.toContain('<b>Client</b>');
    expect(html).not.toContain('Empty');
    expect(html).toContain('A&lt;b&gt;');
    expect(html).toContain('&lt;&amp;&gt;');
  });

  test('Date and ISO values become tg-time', () => {
    const html = formatRichMessageHtml({ title: 'T', fields: [{ label: 'At', value: new Date('2026-10-18T00:00:00Z') }, { label: 'Iso', value: '2026-10-18T00:00:00Z' }] });
    expect(html.match(/<tg-time unix="1792281600" format="wDT">/g)).toHaveLength(2);
  });

  test('multi-column table with caption and right-aligned numeric columns', () => {
    const html = formatRichMessageHtml({ title: 'T', tables: [{ title: 'Per client', columns: ['Client', 'N'], rows: [['a', 1], ['b', 2]], numeric: [1] }] });
    expect(html).toContain('<table bordered striped compact><caption>Per client</caption><tr><th>Client</th><th align="right">N</th></tr>');
    expect(html).toContain('<tr><td>b</td><td align="right">2</td></tr>');
  });

  test('message content: label paragraph + quote under the tables, spacing and line breaks preserved', () => {
    const html = formatRichMessageHtml({
      title: 'T',
      fields: [{ label: 'Mobile', value: '91' }],
      tables: [{ columns: ['A'], rows: [[1]] }],
      quote: 'Hi <b>\n  two  spaces\n\nend & done',
      quoteLabel: 'Login message',
      quotes: [{ label: 'Reply', text: 'ok' }],
    });
    expect(html).toContain('<b>Login message</b><br/><blockquote>Hi &lt;b&gt;<br/>&nbsp;&nbsp;two&nbsp;&nbsp;spaces<br/><br/>end &amp; done</blockquote>');
    expect(html).toContain('<b>Reply</b><br/><blockquote>ok</blockquote>');
    expect(html).not.toMatch(/<td[^>]*>[^<]*Hi/);
    expect(html).not.toContain('<code>Hi');
    expect(html.indexOf('</table>')).toBeLessThan(html.indexOf('<b>Login message</b>'));
  });

  test('quote label defaults to Message; text over 800 chars is an expandable quote', () => {
    expect(formatRichMessageHtml({ title: 'T', quote: 'short' })).toContain('<b>Message</b><br/><blockquote>short</blockquote>');
    const long = formatRichMessageHtml({ title: 'T', quote: 'x'.repeat(801) });
    expect(long).toContain('<blockquote expandable>');
    expect(long).toContain('</blockquote>');
  });

  test('multi-line summaries keep their line breaks', () => {
    expect(formatRichMessageHtml({ title: 'T', summary: 'one\ntwo' })).toContain('one<br/>two<br/>');
  });

  test('details are collapsible and clipped to the budget', () => {
    const html = formatRichMessageHtml({ title: 'T', details: 'x'.repeat(40000), detailsTitle: 'Error message' });
    expect(html).toContain('<details><summary>Error message</summary><pre>');
    expect(html.length).toBeLessThan(RICH_MESSAGE_MAX_CHARS + 2500);
    expect(html).toContain('more chars)');
  });

  test('buttons: emoji stripped, first URL primary, rows of 3, copy buttons supported', () => {
    const html = formatRichMessageHtml({ title: 'T', buttons: [1, 2, 3, 4].map((i) => ({ text: `🔗 Go ${i}`, url: `https://e.co/${i}` })).concat([{ text: 'Copy', url: undefined as any, copy: 'abc' } as any]) });
    expect(html).toContain('<tg-button type="url" style="primary" url="https://e.co/1">Go 1</tg-button>');
    expect(html.match(/<tg-button-row>/g)).toHaveLength(2);
    expect(html).toContain('<tg-button type="copy_text" text="abc">Copy</tg-button>');
  });
});

describe('textToRichInput', () => {
  test('first line = title, Key: value lines = fields, short remainder = summary', () => {
    const input = textToRichInput('Swap complete\nMobile: 91\nStatus : ok\nnote');
    expect(input.title).toBe('Swap complete');
    expect(input.fields).toEqual([{ label: 'Mobile', value: '91', code: false }, { label: 'Status', value: 'ok', code: false }]);
    expect(input.summary).toBe('note');
  });

  test('HTML input is stripped and decoded; long remainder becomes details', () => {
    const input = textToRichInput('<b>Title &amp; co</b>\n' + 'line\n'.repeat(5), { html: true });
    expect(input.title).toBe('Title & co');
    expect(Array.isArray(input.details)).toBe(true);
  });

  test('empty text yields a placeholder title', () => {
    expect(textToRichInput('').title).toBe('Notification');
  });
});

describe('classic fallback + markup helpers', () => {
  test('formatClassicNotificationHtml degrades tables to lines and keeps the prefix', () => {
    const text = formatClassicNotificationHtml({ title: 'T', severity: 'error', tables: [{ columns: ['A', 'B'], rows: [[1, 2]] }], details: 'd' }, 'CMS');
    expect(text).toContain('<b>CMS · T</b>');
    expect(text).toContain('<b>A | B</b>\n1 | 2');
  });

  test('buttonsFromReplyMarkup extracts URL buttons only', () => {
    expect(buttonsFromReplyMarkup({ inline_keyboard: [[{ text: 'a', url: 'https://x' }, { text: 'b', callback_data: 'c' }]] })).toEqual([{ text: 'a', url: 'https://x' }]);
    expect(buttonsFromReplyMarkup('not json')).toEqual([]);
  });
});

describe('textToRichInput: frontend MarkdownV2 text (vcui /sendtochannel)', () => {
  it('drops single *bold* markers so they never show literally', () => {
    const input = textToRichInput('ErrorExceHS:\n\nChatId:*123*\nclient:*sowmya1*');
    expect(JSON.stringify(input)).not.toContain('*');
  });
});

