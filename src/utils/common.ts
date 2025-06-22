export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function contains(str: string | null | undefined, arr: string[]): boolean {
  if (!str || !Array.isArray(arr)) return false;
  return arr.some(element => element && str.includes(element.toLowerCase()));
}

export function toBoolean(value: string | number | boolean | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    const normalizedValue = value.toLowerCase().trim();
    return normalizedValue === 'true' || normalizedValue === '1' || normalizedValue === 'yes';
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  return value;
}

export function fetchNumbersFromString(inputString: string | null | undefined): string {
  if (!inputString) return '';
  const regex = /\d+/g;
  const matches = inputString.match(regex);
  return matches ? matches.join('') : '';
}

export const defaultReactions = Object.freeze([
  '❤', '🔥', '👏', '🥰', '😁', '🤔',
  '🤯', '😱', '🤬', '😢', '🎉', '🤩',
  '🤮', '💩', '🙏', '👌', '🕊', '🤡',
  '🥱', '🥴', '😍', '🐳', '❤‍🔥', '💯',
  '🤣', '💔', '🏆', '😭', '😴', '👍',
  '🌚', '⚡', '🍌', '😐', '💋', '👻',
  '👀', '🙈', '🤝', '🤗', '🆒',
  '🗿', '🙉', '🙊', '🤷', '👎'
] as const);

export const defaultMessages = Object.freeze([
  "1", "2", "3", "4", "5", "6", "7", "8",
  "9", "10", "11", "12", "13", "14", "15",
  "16", "17", "18", "19", "20", "21"
] as const);

export function areJsonsNotSame(json1: unknown, json2: unknown): boolean {
  const keysToIgnore = ['id', '_id'];
  console.log('[areJsonsNotSame] Starting comparison...');

  function normalizeObject(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(normalizeObject);

    const normalized: Record<string, unknown> = {};
    const sortedKeys = Object.keys(obj as Record<string, unknown>)
      .filter(key => !keysToIgnore.includes(key))
      .sort();

    for (const key of sortedKeys) {
      normalized[key] = normalizeObject((obj as Record<string, unknown>)[key]);
    }
    return normalized;
  }
  const normalized1 = normalizeObject(json1);
  const normalized2 = normalizeObject(json2);
  const result = JSON.stringify(normalized1) !== JSON.stringify(normalized2);
  console.log(`[areJsonsNotSame] Comparison result: ${result ? 'Objects are different' : 'Objects are same'}`);
  return result;
}


export function mapToJson<K extends string | number | symbol, V>(map: Map<K, V>): Record<string, V> {
  if (!(map instanceof Map)) {
    throw new Error('Input must be a Map instance');
  }
  const obj: Record<string, V> = {};
  for (const [key, value] of map.entries()) {
    obj[String(key)] = value;
  }
  return obj;
}

export function shouldMatch(obj) {
    const regex = /(wife|adult|lanj|chat|𝑭𝒂𝒎𝒊𝒍𝒚|𝙏𝙖𝙢𝙞𝙡|𝐒𝐖𝐀𝐏|lesb|aunty|girl|boy|tamil|kannad|telugu|hindi|paid|coupl|cpl|randi|bhab|boy|girl|friend|frnd|boob|pussy|dating|swap|gay|sex|bitch|love|video|service|real|call|desi)/i
    const titleMatch = obj.title && regex.test(obj.title);
    const usernameMatch = obj.username && regex.test(obj.username);
    return !!(titleMatch || usernameMatch);
}