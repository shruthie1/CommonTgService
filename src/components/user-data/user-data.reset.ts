/**
 * The user-data reset (owner 2026-11-20, userData audit A11). CMS DELETE /userData/:profile/:chatId, tg-aut /reset and
 * tg-aut POST /resetuser/:chatId reset a row; none of them deletes it.
 *
 * The reset $sets a fresh row's defaults (tg-platform packages/tg-db user-data.repository.ts USER_DATA_DEFAULTS) minus
 * the kept keys, plus the service-cycle fields a fresh row lacks at their "absent" value. It never $unsets.
 * MIRROR: tg-platform USER_DATA_RESET_KEEPS / USER_DATA_RESET_FIELDS (same keys, same values).
 */
export const USER_DATA_RESET_KEEPS = Object.freeze([
    'chatId', 'profile', 'clientId', 'username', 'accessHash', 'lastMsgTimeStamp',
    'lifetimePaid', 'lifetimeCredits', 'creditKeys', 'firstPaidAt', 'lastPaidAt',
    'fakePaymentAt', 'fakePaymentBy', 'fakePaymentReason', 'fakePaymentPrev', 'fakePaymentHistory', 'fakePaymentProofIds',
    'attributionChannelIds', 'attributionUpdatedAt',
    'demoCompletions', 'showCompletions',
] as const);

/** Field -> value the reset writes. A fresh copy per call (videos / callProgress are mutable). */
export function userDataResetFields(): Record<string, unknown> {
    return {
        fullShow: 0,
        callTime: 0,
        cheatCount: 0,
        graceFlag: false,
        highestPayAmount: 0,
        videos: [],
        picsSent: 0,
        picCount: 0,
        limitTime: 0,
        paidCount: 0,
        prfCount: 0,
        canReply: 1,
        payAmount: 0,
        paidReply: true,
        demoGiven: false,
        secondShow: false,
        msgCount: 0,
        windowCount: 0,
        cycleVideoBase: 0,
        cyclePaid: 0,
        showsPaidTo: 0,
        callProgress: {},
    };
}
