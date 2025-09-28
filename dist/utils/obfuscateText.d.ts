type HomoglyphMap = Record<string, string[]>;
interface TextAnalysis {
    totalChars: number;
    letters: number;
    numbers: number;
    specialChars: number;
    obfuscatableLetters: number;
    obfuscatableNumbers: number;
    obfuscatableSpecial: number;
    lines: number;
    words: number;
}
interface ObfuscationOptions {
    substitutionRate?: number;
    invisibleCharRate?: number;
    preserveCase?: boolean;
    preserveNumbers?: boolean;
    preserveSpecialChars?: boolean;
    useInvisibleChars?: boolean;
    maintainFormatting?: boolean;
    randomSeed?: number | null;
    maxInvisibleCharsPerWord?: number;
    customSafeBlocks?: string[];
    intensityVariation?: boolean;
}
interface BatchResult {
    config: ObfuscationConfig;
    result: string;
    analysisStats: TextAnalysis;
}
declare const homoglyphMap: HomoglyphMap;
declare const numberMap: HomoglyphMap;
declare const specialCharMap: HomoglyphMap;
declare const invisibleChars: readonly string[];
declare class ObfuscationConfig {
    readonly substitutionRate: number;
    readonly invisibleCharRate: number;
    readonly preserveCase: boolean;
    readonly preserveNumbers: boolean;
    readonly preserveSpecialChars: boolean;
    readonly useInvisibleChars: boolean;
    readonly maintainFormatting: boolean;
    readonly randomSeed: number | null;
    readonly maxInvisibleCharsPerWord: number;
    readonly customSafeBlocks: readonly string[];
    readonly intensityVariation: boolean;
    constructor(options?: ObfuscationOptions);
    toJSON(): ObfuscationOptions;
}
declare class SeededRandom {
    private current;
    private readonly seed;
    constructor(seed?: number | null);
    next(): number;
    choice<T>(array: readonly T[]): T;
    chance(probability: number): boolean;
    getSeed(): number;
    reset(): void;
}
export declare function obfuscateText(text: string, config?: ObfuscationOptions | ObfuscationConfig): string;
export declare function analyzeText(text: string): TextAnalysis;
export declare function attemptReverse(obfuscatedText: string): string;
export declare function attemptReverseFuzzy(obfuscatedText: string): string;
export declare function testReverseCoverage(): {
    letters: {
        total: number;
        mapped: number;
        coverage: number;
    };
    numbers: {
        total: number;
        mapped: number;
        coverage: number;
    };
    special: {
        total: number;
        mapped: number;
        coverage: number;
    };
};
export declare function batchObfuscate(text: string, configArray: (ObfuscationOptions | ObfuscationConfig)[]): BatchResult[];
export declare function generateVariants(text: string, baseConfig?: ObfuscationOptions, variants?: number): string[];
export declare function validateConfig(config: ObfuscationOptions): void;
export { ObfuscationConfig, SeededRandom, homoglyphMap, numberMap, specialCharMap, invisibleChars, type HomoglyphMap, type TextAnalysis, type ObfuscationOptions, type BatchResult };
