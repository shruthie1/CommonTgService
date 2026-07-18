import type { Api } from 'telegram/tl';

/** Keeps the existing UMS-test channel predicate isolated from the worker orchestration. */
export function isEligibleDiscoveredChannel(channel: Api.Channel): boolean {
  // Keep the former UMS-test discovery behaviour exactly: candidate channels
  // are selected by a category match in their title or public username.
  const regex =
    /(wife|adult|lanj|chat|𝑭𝒂𝒎𝒊𝒍𝒚|𝙏𝙖𝙢𝙞𝙡|𝐒𝐖𝐀𝐏|lesb|aunty|girl|boy|tamil|kannad|telugu|hindi|paid|coupl|cpl|randi|bhab|boy|girl|friend|frnd|boob|pussy|dating|swap|gay|sex|bitch|love|video|service|real|call|desi)/i;

  return Boolean(
    (channel.title && regex.test(channel.title)) ||
    (channel.username && regex.test(channel.username)),
  );
}
