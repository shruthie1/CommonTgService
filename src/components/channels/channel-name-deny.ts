/**
 * Join-selection name deny-list for the `channels` collection, precomputed at write time.
 *
 * Why: `ChannelsService.getActiveChannels` filtered every candidate with two ~90-branch
 * case-insensitive regexes on `title`/`username`. Measured read-only on 2026-10-25 (secondary,
 * 100,210 docs): the `$match` examined 52,103 docs via `username_1` in ~1.52 s per call, while the
 * same flags without the regexes took 91 ms as a full COLLSCAN. The regex evaluation is the cost,
 * and no index can serve a regex `$not`. So the verdict is stored as `nameDenied` on every write
 * that can change `title`/`username`, and the read checks the flag first; docs written before the
 * flag existed (no `nameDenied`) still go through the regexes, so results are identical before
 * and after a backfill.
 */

// Exact patterns previously inlined in getActiveChannels (title and username differ slightly).
export const CHANNEL_TITLE_DENY_REGEX = /online|realestat|propert|freefire|bgmi|promo|agent|board|design|realt|clas|PROFIT|wholesale|retail|topper|exam|motivat|medico|shop|follower|insta|traini|cms|cma|subject|currency|color|amity|game|gamin|like|earn|popcorn|TANISHUV|bitcoin|crypto|mall|work|folio|health|civil|win|casino|shop|promot|english|invest|fix|money|book|anim|angime|support|cinema|bet|predic|study|youtube|sub|open|trad|cric|quot|exch|movie|search|film|offer|ott|deal|quiz|academ|insti|talkies|screen|series|webser/i;
export const CHANNEL_USERNAME_DENY_REGEX = /online|freefire|bgmi|promo|agent|realestat|propert|board|design|realt|clas|PROFIT|wholesale|retail|topper|exam|motivat|medico|shop|follower|insta|traini|cms|cma|subject|currency|color|amity|game|gamin|like|earn|popcorn|TANISHUV|bitcoin|crypto|mall|work|folio|health|civil|win|casino|shop|promot|english|invest|fix|money|book|anim|angime|support|cinema|bet|predic|study|youtube|sub|open|trad|cric|quot|exch|movie|search|film|offer|ott|deal|quiz|academ|insti|talkies|screen|series|webser/i;

/** True when the title or username hits the deny-list. Non-string / missing values never match. */
export function computeChannelNameDenied(title: unknown, username: unknown): boolean {
  return (typeof title === 'string' && CHANNEL_TITLE_DENY_REGEX.test(title))
    || (typeof username === 'string' && CHANNEL_USERNAME_DENY_REGEX.test(username));
}

const regexMatchIfString = (field: string, regex: RegExp) => ({
  $cond: [
    { $eq: [{ $type: `$${field}` }, 'string'] },
    { $regexMatch: { input: `$${field}`, regex: regex.source, options: 'i' } },
    false,
  ],
});

/**
 * Aggregation-pipeline stage computing `nameDenied` from the document's final title/username.
 * Appended to pipeline upserts (createMultiple), so it sees the merged result of the update.
 */
export const NAME_DENIED_PIPELINE_STAGE = {
  $set: {
    nameDenied: {
      $or: [
        regexMatchIfString('title', CHANNEL_TITLE_DENY_REGEX),
        regexMatchIfString('username', CHANNEL_USERNAME_DENY_REGEX),
      ],
    },
  },
};

/**
 * Read-side filter: a doc carrying the precomputed flag is decided by it (no regex evaluated);
 * a legacy doc without it falls back to the original regex `$not` checks.
 */
export function channelNameAllowedFilter(): Record<string, unknown> {
  return {
    $or: [
      { nameDenied: false },
      {
        nameDenied: { $exists: false },
        title: { $not: { $regex: CHANNEL_TITLE_DENY_REGEX } },
        username: { $not: { $regex: CHANNEL_USERNAME_DENY_REGEX } },
      },
    ],
  };
}
