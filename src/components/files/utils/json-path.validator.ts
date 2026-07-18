export class JsonPathValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JsonPathValidationError';
  }
}

export class JsonPathValidator {
  static validate(path: string[]): boolean {
    if (!Array.isArray(path) || path.length === 0) {
      throw new JsonPathValidationError('Path must be a non-empty array');
    }

    const validKeyRegex = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
    for (const segment of path) {
      if (!validKeyRegex.test(segment)) {
        throw new JsonPathValidationError(`Invalid path segment: ${segment}`);
      }
    }
    return true;
  }

  static validateJsonQuery(query: string): boolean {
    const validQueryRegex = /^[\w.[\]]+$/;
    if (!validQueryRegex.test(query)) {
      throw new JsonPathValidationError('Invalid JSON query format');
    }
    return true;
  }
}
