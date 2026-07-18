"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonPathValidator = exports.JsonPathValidationError = void 0;
class JsonPathValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'JsonPathValidationError';
    }
}
exports.JsonPathValidationError = JsonPathValidationError;
class JsonPathValidator {
    static validate(path) {
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
    static validateJsonQuery(query) {
        const validQueryRegex = /^[\w.[\]]+$/;
        if (!validQueryRegex.test(query)) {
            throw new JsonPathValidationError('Invalid JSON query format');
        }
        return true;
    }
}
exports.JsonPathValidator = JsonPathValidator;
//# sourceMappingURL=json-path.validator.js.map