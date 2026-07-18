export declare class JsonPathValidationError extends Error {
    constructor(message: string);
}
export declare class JsonPathValidator {
    static validate(path: string[]): boolean;
    static validateJsonQuery(query: string): boolean;
}
