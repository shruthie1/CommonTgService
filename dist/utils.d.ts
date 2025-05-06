export declare function sleep(ms: number): Promise<void>;
export declare function contains(str: string | null | undefined, arr: string[]): boolean;
export declare function toBoolean(value: string | number | boolean | null | undefined): boolean;
export declare function fetchNumbersFromString(inputString: string | null | undefined): string;
export declare const defaultReactions: readonly ["❤", "🔥", "👏", "🥰", "😁", "🤔", "🤯", "😱", "🤬", "😢", "🎉", "🤩", "🤮", "💩", "🙏", "👌", "🕊", "🤡", "🥱", "🥴", "😍", "🐳", "❤‍🔥", "💯", "🤣", "💔", "🏆", "😭", "😴", "👍", "🌚", "⚡", "🍌", "😐", "💋", "👻", "👀", "🙈", "🤝", "🤗", "🆒", "🗿", "🙉", "🙊", "🤷", "👎"];
export declare const defaultMessages: readonly ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21"];
export declare function areJsonsNotSame(json1: unknown, json2: unknown): boolean;
export declare function mapToJson<K extends string | number | symbol, V>(map: Map<K, V>): Record<string, V>;
export declare function shouldMatch(obj: any): boolean;
