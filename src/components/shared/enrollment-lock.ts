/**
 * Process-wide per-mobile enrollment lock.
 *
 * Enrolling an account into bufferClients and promoteClients concurrently produces
 * TWO live sessions on ONE Telegram account, which Telegram revokes (permanent account
 * loss — the #1 operational risk). The cross-collection dedup guard in each service is a
 * non-atomic read-then-write, so two concurrent enrollments for the same mobile can both
 * pass the "is it already enrolled?" check before either writes.
 *
 * This serializes the check-then-write for a given canonical mobile across BOTH the buffer
 * and promote services within a single process. It is intentionally simple (in-process):
 * for multi-process deployments a DB-level cross-collection unique constraint remains the
 * durable backstop, but this closes the common single-process race.
 */
const chains = new Map<string, Promise<unknown>>();

/**
 * Run `fn` while holding the lock for `key`. Calls for the same key run strictly one at a
 * time (FIFO); calls for different keys run concurrently. The lock is always released, even
 * if `fn` throws.
 */
export async function withEnrollmentLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = chains.get(key) ?? Promise.resolve();

    // Chain this call after any in-flight call for the same key. We swallow the previous
    // result/error here so one caller's failure never rejects the next caller's turn.
    const run = previous.then(() => fn(), () => fn());

    // Record a settled-only marker as the new tail so the chain never rejects.
    const tail = run.then(() => undefined, () => undefined);
    chains.set(key, tail);

    // Best-effort cleanup: once this is the last link, drop the map entry to avoid growth.
    tail.finally(() => {
        if (chains.get(key) === tail) {
            chains.delete(key);
        }
    });

    return run;
}

/** Test helper: clear all in-flight chains. */
export function __resetEnrollmentLocks(): void {
    chains.clear();
}
