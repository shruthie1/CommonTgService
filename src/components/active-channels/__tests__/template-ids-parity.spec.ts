/**
 * One template-id list for every activeChannels insert (owner 2026-11-21): CMS `defaultMessages` and tg-platform
 * tg-db `ACTIVE_CHANNEL_MESSAGE_IDS` must hold the same ids in the same order. Both repos pin the literal "1".."21";
 * when the sibling tg-platform checkout is present (local and mirror layouts), its list is parsed and compared too.
 */
import * as fs from 'fs';
import * as path from 'path';
import { defaultMessages } from '../../../utils';

const EXPECTED = Array.from({ length: 21 }, (_, i) => String(i + 1));
const TG_FILE = path.resolve(__dirname, '../../../../../tg-platform/packages/tg-db/src/collections/channels.repository.ts');

describe('activeChannels insert template ids', () => {
  test('CMS defaultMessages is the shared 21-id list', () => {
    expect([...defaultMessages]).toEqual(EXPECTED);
  });

  const tgPresent = fs.existsSync(TG_FILE);
  (tgPresent ? test : test.skip)('tg-platform ACTIVE_CHANNEL_MESSAGE_IDS matches CMS defaultMessages', () => {
    const src = fs.readFileSync(TG_FILE, 'utf8');
    const m = src.match(/export const ACTIVE_CHANNEL_MESSAGE_IDS[^=]*=\s*\[([\s\S]*?)\]/);
    expect(m).not.toBeNull();
    const ids = [...m![1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
    expect(ids).toEqual([...defaultMessages]);
  });
});
