import {
  obfuscateText,
  analyzeText,
  attemptReverse,
  attemptReverseFuzzy,
  testReverseCoverage,
  batchObfuscate,
  generateVariants,
  validateConfig,
  ObfuscationConfig,
  SeededRandom,
  homoglyphMap,
  numberMap,
  specialCharMap,
  invisibleChars,
} from '../obfuscateText';

describe('SeededRandom', () => {
  test('is deterministic for the same seed', () => {
    const a = new SeededRandom(42);
    const b = new SeededRandom(42);
    expect(a.next()).toBe(b.next());
    expect(a.next()).toBe(b.next());
  });

  test('next returns values in [0,1)', () => {
    const r = new SeededRandom(7);
    for (let i = 0; i < 50; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test('choice returns an element of the array', () => {
    const r = new SeededRandom(1);
    const arr = ['a', 'b', 'c'];
    for (let i = 0; i < 20; i++) expect(arr).toContain(r.choice(arr));
  });

  test('choice throws on empty array', () => {
    expect(() => new SeededRandom(1).choice([])).toThrow('Cannot choose from empty array');
  });

  test('chance(0) is always false and chance(1) is always true', () => {
    const r = new SeededRandom(99);
    for (let i = 0; i < 20; i++) {
      expect(r.chance(0)).toBe(false);
      expect(r.chance(1)).toBe(true);
    }
  });

  test('reset restores the sequence', () => {
    const r = new SeededRandom(5);
    const first = r.next();
    r.next();
    r.reset();
    expect(r.next()).toBe(first);
  });

  test('getSeed returns the provided seed', () => {
    expect(new SeededRandom(123).getSeed()).toBe(123);
  });

  test('null seed uses Math.random based seed', () => {
    const r = new SeededRandom(null);
    expect(typeof r.getSeed()).toBe('number');
  });
});

describe('ObfuscationConfig', () => {
  test('applies defaults', () => {
    const c = new ObfuscationConfig();
    expect(c.substitutionRate).toBe(0.4);
    expect(c.preserveSpecialChars).toBe(true);
    expect(c.useInvisibleChars).toBe(false);
    expect(Object.isFrozen(c.customSafeBlocks)).toBe(true);
  });

  test('overrides via options and round-trips through toJSON', () => {
    const c = new ObfuscationConfig({ substitutionRate: 0.7, customSafeBlocks: ['XYZ'], intensityVariation: true });
    expect(c.substitutionRate).toBe(0.7);
    const json = c.toJSON();
    expect(json.substitutionRate).toBe(0.7);
    expect(json.customSafeBlocks).toEqual(['XYZ']);
    expect(json.intensityVariation).toBe(true);
  });
});

describe('obfuscateText', () => {
  test('is deterministic with a fixed seed', () => {
    const out1 = obfuscateText('Hello World', { randomSeed: 123 });
    const out2 = obfuscateText('Hello World', { randomSeed: 123 });
    expect(out1).toBe(out2);
  });

  test('with substitutionRate 0 only wraps with ** formatting markers', () => {
    const out = obfuscateText('hello', { randomSeed: 1, substitutionRate: 0 });
    expect(out).toBe('**hello**');
  });

  test('maintainFormatting false omits the ** markers', () => {
    const out = obfuscateText('hello', { randomSeed: 1, substitutionRate: 0, maintainFormatting: false });
    expect(out).toBe('hello');
  });

  test('substitutes characters when substitutionRate is 1', () => {
    const out = obfuscateText('abc', { randomSeed: 5, substitutionRate: 1, maintainFormatting: false });
    // every letter should differ from the original ASCII
    expect(out).not.toBe('abc');
    expect(out.length).toBeGreaterThanOrEqual(3);
  });

  test('preserves blank lines', () => {
    const out = obfuscateText('a\n\nb', { randomSeed: 1, substitutionRate: 0 });
    expect(out).toContain('\n\n');
  });

  test('leaves safe blocks untouched', () => {
    const safe = '━━━━━━━━━━━━━━━━━━━━━━━━';
    const out = obfuscateText(safe, { randomSeed: 1, substitutionRate: 1 });
    expect(out).toContain(safe);
  });

  test('respects customSafeBlocks', () => {
    const out = obfuscateText('KEEPME', { randomSeed: 1, substitutionRate: 1, customSafeBlocks: ['KEEPME'], maintainFormatting: false });
    expect(out).toBe('KEEPME');
  });

  test('strips existing ** markers from input', () => {
    const out = obfuscateText('**bold**', { randomSeed: 1, substitutionRate: 0, maintainFormatting: false });
    expect(out).toBe('bold');
  });

  test('preserveCase keeps uppercase substitutes uppercase', () => {
    const out = obfuscateText('A', { randomSeed: 3, substitutionRate: 1, preserveCase: true, maintainFormatting: false });
    expect(out).toBe(out.toUpperCase());
  });

  test('substitutes numbers when not preserved', () => {
    const out = obfuscateText('123', { randomSeed: 9, substitutionRate: 1, preserveNumbers: false, maintainFormatting: false });
    expect(out).not.toBe('123');
  });

  test('preserveNumbers keeps digits intact', () => {
    const out = obfuscateText('123', { randomSeed: 9, substitutionRate: 1, preserveNumbers: true, maintainFormatting: false });
    expect(out).toBe('123');
  });

  test('substitutes special chars when preserveSpecialChars is false', () => {
    const out = obfuscateText('!!!!!!!!!!', { randomSeed: 2, substitutionRate: 1, preserveSpecialChars: false, maintainFormatting: false });
    // at least the structure is preserved length-wise
    expect(out.length).toBeGreaterThanOrEqual(10);
  });

  test('useInvisibleChars injects invisible characters', () => {
    const out = obfuscateText('hello world', {
      randomSeed: 4,
      substitutionRate: 1,
      useInvisibleChars: true,
      invisibleCharRate: 1,
      maxInvisibleCharsPerWord: 2,
      maintainFormatting: false,
    });
    const hasInvisible = invisibleChars.some((c) => out.includes(c));
    expect(hasInvisible).toBe(true);
  });

  test('intensityVariation runs without throwing and stays deterministic', () => {
    const a = obfuscateText('hello world test', { randomSeed: 11, intensityVariation: true });
    const b = obfuscateText('hello world test', { randomSeed: 11, intensityVariation: true });
    expect(a).toBe(b);
  });

  test('accepts a pre-built ObfuscationConfig instance', () => {
    const cfg = new ObfuscationConfig({ randomSeed: 1, substitutionRate: 0 });
    expect(obfuscateText('hi', cfg)).toBe('**hi**');
  });
});

describe('analyzeText', () => {
  test('counts letters, numbers, special chars, lines and words', () => {
    const stats = analyzeText('ab 12!\ncd');
    expect(stats.letters).toBe(4);
    expect(stats.numbers).toBe(2);
    expect(stats.specialChars).toBe(1);
    expect(stats.lines).toBe(2);
    expect(stats.words).toBe(3);
    expect(stats.obfuscatableLetters).toBe(4);
    expect(stats.obfuscatableNumbers).toBe(2);
    expect(stats.obfuscatableSpecial).toBe(1);
  });

  test('handles empty string', () => {
    const stats = analyzeText('');
    expect(stats.totalChars).toBe(0);
    expect(stats.words).toBe(0);
  });
});

describe('attemptReverse / attemptReverseFuzzy', () => {
  test('reverse removes invisible chars and ** formatting', () => {
    const text = `**he${invisibleChars[0]}llo**`;
    const out = attemptReverse(text);
    expect(out).toBe('hello');
  });

  test('reverse maps a known letter homoglyph back', () => {
    const sub = homoglyphMap['a'][0]; // 'а' cyrillic
    expect(attemptReverse(sub)).toBe('a');
  });

  test('reverse maps number and special homoglyphs back', () => {
    expect(attemptReverse(numberMap['0'][1])).toBe('0');
    expect(attemptReverse(specialCharMap['.'][0])).toBe('.');
  });

  test('fuzzy reverse restores BMP letter and special chars', () => {
    expect(attemptReverseFuzzy(homoglyphMap['e'][0])).toBe('e');
    expect(attemptReverseFuzzy(specialCharMap['!'][0])).toBe('!');
  });

  test('fuzzy reverse restores a single-code-unit number homoglyph', () => {
    // numberMap['3'] contains 'З' (Cyrillic, single code unit) at index 6.
    expect(attemptReverseFuzzy('З')).toBe('3');
  });

  test('fuzzy reverse preserves case for uppercase homoglyphs', () => {
    const upper = homoglyphMap['a'][0].toUpperCase();
    expect(attemptReverseFuzzy(upper)).toBe('A');
  });

  test('fuzzy reverse leaves unknown characters intact and strips **', () => {
    expect(attemptReverseFuzzy('**xyz**')).toBe('xyz');
  });

  test('round-trip: fuzzy reverse of obfuscated text returns close to original letters', () => {
    const original = 'hello';
    const obf = obfuscateText(original, { randomSeed: 50, substitutionRate: 1, maintainFormatting: true });
    const reversed = attemptReverseFuzzy(obf).toLowerCase();
    expect(reversed).toBe('hello');
  });
});

describe('testReverseCoverage', () => {
  test('reports 100% coverage for all categories', () => {
    const cov = testReverseCoverage();
    expect(cov.letters.coverage).toBe(100);
    expect(cov.numbers.coverage).toBe(100);
    expect(cov.special.coverage).toBe(100);
    expect(cov.letters.total).toBeGreaterThan(0);
  });
});

describe('batchObfuscate', () => {
  test('produces one result per config with analysis stats', () => {
    const results = batchObfuscate('hello', [
      { randomSeed: 1, substitutionRate: 0 },
      new ObfuscationConfig({ randomSeed: 2, substitutionRate: 1 }),
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].result).toBe('**hello**');
    expect(results[0].analysisStats.totalChars).toBeGreaterThan(0);
    expect(results[1].config).toBeInstanceOf(ObfuscationConfig);
  });
});

describe('generateVariants', () => {
  test('returns the requested number of variants', () => {
    const variants = generateVariants('hello world', { randomSeed: 1 }, 3);
    expect(variants).toHaveLength(3);
    variants.forEach((v) => expect(typeof v).toBe('string'));
  });

  test('defaults to 5 variants', () => {
    expect(generateVariants('hi')).toHaveLength(5);
  });
});

describe('validateConfig', () => {
  test('accepts valid configs', () => {
    expect(() => validateConfig({ substitutionRate: 0.5, invisibleCharRate: 0.2, maxInvisibleCharsPerWord: 1 })).not.toThrow();
    expect(() => validateConfig({})).not.toThrow();
  });

  test('rejects out-of-range substitutionRate', () => {
    expect(() => validateConfig({ substitutionRate: -0.1 })).toThrow('substitutionRate must be between 0 and 1');
    expect(() => validateConfig({ substitutionRate: 1.1 })).toThrow('substitutionRate must be between 0 and 1');
  });

  test('rejects out-of-range invisibleCharRate', () => {
    expect(() => validateConfig({ invisibleCharRate: 2 })).toThrow('invisibleCharRate must be between 0 and 1');
  });

  test('rejects negative maxInvisibleCharsPerWord', () => {
    expect(() => validateConfig({ maxInvisibleCharsPerWord: -1 })).toThrow('maxInvisibleCharsPerWord must be non-negative');
  });
});
