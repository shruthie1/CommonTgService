export declare function withEnrollmentLock<T>(key: string, fn: () => Promise<T>): Promise<T>;
export declare function __resetEnrollmentLocks(): void;
