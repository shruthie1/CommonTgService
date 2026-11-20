/**
 * userData keys that only their owning workflow writes (userData audit A1/A2/A10, Codex reviews 2026-11-20).
 *
 * The schema declares them so CMS model writes (fake-payment bulkWrite, uncredit, reads through the model) keep them.
 * The generic routes (POST /userData, PATCH /userData/:profile/:chatId, PATCH /userData/updateAll/:chatId,
 * POST /updateUserData/:chatId and POST /getviddata, which all go through UserDataService) strip them, so declaring a
 * key never makes it writable from an arbitrary request body. No caller of those routes sends any of them (rg of
 * tg-platform, tg-chats, vcui-local, server-local and CMS, 2026-11-20):
 * - showsPaidTo: tg-aut payments/ladder.ts; CMS payment uncredit (raw collection).
 * - demoCompletions, showCompletions: tg-aut calls/service-completion.ts (guarded counters).
 * - lifetimePaid, lifetimeCredits, creditKeys, firstPaidAt, lastPaidAt: tg-aut creditPayment (the payer rule and the
 *   credit dedupe); CMS payment uncredit.
 * - fakePaymentAt/By/Reason/Prev, fakePaymentHistory, fakePaymentProofIds: CMS FakePaymentService (mark / unmark /
 *   not-fake).
 * - msgCount: the inbound counter, tg-aut recordInbound $inc only; the user-data reset zeroes it (user-data.reset.ts,
 *   owner 2026-11-20). New-row routing and parked attribution read it. windowCount, the daily counter, stays editable
 *   (tg-chats).
 */
export const USER_DATA_WORKFLOW_OWNED_KEYS = [
    'showsPaidTo',
    'demoCompletions',
    'showCompletions',
    'lifetimePaid',
    'lifetimeCredits',
    'creditKeys',
    'firstPaidAt',
    'lastPaidAt',
    'fakePaymentAt',
    'fakePaymentBy',
    'fakePaymentReason',
    'fakePaymentPrev',
    'fakePaymentHistory',
    'fakePaymentProofIds',
    'msgCount',
] as const;

/** Row identity: never changed by the generic update routes (the row filter owns it). Stripped without a log line. */
export const USER_DATA_IDENTITY_KEYS = ['_id', 'chatId', 'profile'] as const;

export type UserDataWorkflowOwnedKey = typeof USER_DATA_WORKFLOW_OWNED_KEYS[number];

/** True for an owned key or a dotted path under one ("fakePaymentHistory.0.by"). */
export function isWorkflowOwnedPath(path: string): boolean {
    return USER_DATA_WORKFLOW_OWNED_KEYS.some((k) => path === k || path.startsWith(`${k}.`));
}

/**
 * Counters tg-aut recordInbound $incs on every inbound (with msgCount, one atomic write) that the generic routes may
 * still set (tg-chats edits windowCount). Mongo rejects $inc on a non-number, which fails the whole inbound write, so a
 * generic body may set them only to a finite number (0 included). Codex review 2026-11-20.
 */
export const USER_DATA_INC_COUNTERS = ['windowCount'] as const;

function isInvalidCounterWrite(key: string, value: unknown): boolean {
    return (USER_DATA_INC_COUNTERS as readonly string[]).some((k) =>
        key.startsWith(`${k}.`) || (key === k && !(typeof value === 'number' && Number.isFinite(value))));
}

/**
 * A copy of `body` without workflow-owned paths and without non-numeric writes to an $inc counter, with the paths
 * removed for each reason (body order).
 */
export function stripWorkflowOwned<T extends Record<string, unknown>>(body: T): { kept: T; stripped: string[]; invalid: string[] } {
    const kept = { ...body } as Record<string, unknown>;
    const stripped: string[] = [];
    const invalid: string[] = [];
    for (const key of Object.keys(kept)) {
        if (isWorkflowOwnedPath(key)) {
            stripped.push(key);
            delete kept[key];
        } else if (isInvalidCounterWrite(key, kept[key])) {
            invalid.push(key);
            delete kept[key];
        }
    }
    return { kept: kept as T, stripped, invalid };
}
