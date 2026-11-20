/**
 * userData keys that only their owning workflow writes (userData audit A1/A2/A10, Codex review 2026-11-20).
 *
 * The schema declares them so CMS model writes (fake-payment bulkWrite, reads through the model) keep them. The
 * generic routes (POST /userData, PATCH /userData/:profile/:chatId, PATCH /userData/updateAll/:chatId and
 * POST /updateUserData/:chatId, which all go through UserDataService) strip them, so declaring a key never makes it
 * writable from an arbitrary request body:
 * - showsPaidTo: tg-aut payments/ladder.ts; CMS payment uncredit (raw collection).
 * - demoCompletions, showCompletions: tg-aut calls/service-completion.ts (guarded counters).
 * - fakePaymentHistory, fakePaymentProofIds: CMS FakePaymentService (mark / unmark / not-fake).
 */
export const USER_DATA_WORKFLOW_OWNED_KEYS = [
    'showsPaidTo',
    'demoCompletions',
    'showCompletions',
    'fakePaymentHistory',
    'fakePaymentProofIds',
] as const;

export type UserDataWorkflowOwnedKey = typeof USER_DATA_WORKFLOW_OWNED_KEYS[number];

/** True for an owned key or a dotted path under one ("fakePaymentHistory.0.by"). */
export function isWorkflowOwnedPath(path: string): boolean {
    return USER_DATA_WORKFLOW_OWNED_KEYS.some((k) => path === k || path.startsWith(`${k}.`));
}

/** A copy of `body` without workflow-owned paths, and the paths removed (body order). */
export function stripWorkflowOwned<T extends Record<string, unknown>>(body: T): { kept: T; stripped: string[] } {
    const kept = { ...body } as Record<string, unknown>;
    const stripped: string[] = [];
    for (const key of Object.keys(kept)) {
        if (isWorkflowOwnedPath(key)) {
            stripped.push(key);
            delete kept[key];
        }
    }
    return { kept: kept as T, stripped };
}
