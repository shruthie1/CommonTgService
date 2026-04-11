import {
    getWarmupPhaseAction,
    WarmupPhase,
    isAccountReady,
    isAccountWarmingUp,
    WARMUP_PHASE_THRESHOLDS,
    MIN_DAYS_BETWEEN_IDENTITY_STEPS,
    MIN_CHANNELS_FOR_MATURING,
} from '../warmup-phases';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function makeDoc(overrides: Record<string, any> = {}) {
    return {
        warmupPhase: undefined,
        warmupJitter: 0,
        enrolledAt: undefined,
        channels: 0,
        privacyUpdatedAt: undefined,
        twoFASetAt: undefined,
        otherAuthsRemovedAt: undefined,
        profilePicsDeletedAt: undefined,
        nameBioUpdatedAt: undefined,
        usernameUpdatedAt: undefined,
        profilePicsUpdatedAt: undefined,
        organicActivityAt: undefined,
        createdAt: undefined,
        twoFA: false,
        ...overrides,
    };
}

function daysAgo(days: number, now: number): Date {
    return new Date(now - days * ONE_DAY_MS);
}

describe('getWarmupPhaseAction', () => {
    const now = Date.now();

    // ======= ENROLLED PHASE =======

    describe('ENROLLED phase', () => {
        test('freshly enrolled, jitter=0 → wait (not yet 1 day)', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.ENROLLED,
                enrolledAt: new Date(now - 0.5 * ONE_DAY_MS), // 12 hours ago
                warmupJitter: 0,
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('wait');
            expect(result.phase).toBe(WarmupPhase.ENROLLED);
        });

        test('enrolled 1.5 days ago, jitter=0 → transition to settling (set_privacy)', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.ENROLLED,
                enrolledAt: daysAgo(1.5, now),
                warmupJitter: 0,
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('set_privacy');
            expect(result.phase).toBe(WarmupPhase.SETTLING);
        });

        test('enrolled 2 days ago, jitter=3 → still wait (needs 1+3=4 days)', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.ENROLLED,
                enrolledAt: daysAgo(2, now),
                warmupJitter: 3,
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('wait');
        });

        test('enrolled 5 days ago, jitter=3 → set_privacy (1+3=4 days threshold met)', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.ENROLLED,
                enrolledAt: daysAgo(5, now),
                warmupJitter: 3,
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('set_privacy');
            expect(result.phase).toBe(WarmupPhase.SETTLING);
        });

        test('no enrolledAt, no createdAt → daysSinceEnrolled=0 → wait', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.ENROLLED,
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('wait');
        });

        test('no enrolledAt but has createdAt → uses createdAt as fallback', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.ENROLLED,
                createdAt: daysAgo(2, now),
                warmupJitter: 0,
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('set_privacy');
        });
    });

    // ======= SETTLING PHASE (privacy → 2FA → removeOtherAuths) =======

    describe('SETTLING phase', () => {
        test('settling, privacy NOT done → set_privacy', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.SETTLING,
                enrolledAt: daysAgo(3, now),
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('set_privacy');
        });

        test('settling, privacy done yesterday → organic_only (need 2-day gap for 2FA)', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.SETTLING,
                enrolledAt: daysAgo(3, now),
                privacyUpdatedAt: daysAgo(1, now),
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('organic_only');
        });

        test('settling, privacy done 3 days ago → set_2fa', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.SETTLING,
                enrolledAt: daysAgo(5, now),
                privacyUpdatedAt: daysAgo(3, now),
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('set_2fa');
        });

        test('settling, 2FA done yesterday → organic_only (need 2-day gap for removeOtherAuths)', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.SETTLING,
                enrolledAt: daysAgo(5, now),
                privacyUpdatedAt: daysAgo(4, now),
                twoFASetAt: daysAgo(1, now),
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('organic_only');
        });

        test('settling, 2FA done 3 days ago → remove_other_auths', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.SETTLING,
                enrolledAt: daysAgo(7, now),
                privacyUpdatedAt: daysAgo(6, now),
                twoFASetAt: daysAgo(3, now),
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('remove_other_auths');
        });

        test('settling, all done, day 5, jitter=0 → advance to identity (delete_photos)', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.SETTLING,
                enrolledAt: daysAgo(5, now),
                privacyUpdatedAt: daysAgo(4, now),
                twoFASetAt: daysAgo(3, now),
                otherAuthsRemovedAt: daysAgo(2, now),
                warmupJitter: 0,
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('delete_photos');
            expect(result.phase).toBe(WarmupPhase.IDENTITY);
        });

        test('settling, all done, day 3, jitter=2 → organic_only (needs 4+2=6 days)', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.SETTLING,
                enrolledAt: daysAgo(3, now),
                privacyUpdatedAt: daysAgo(2, now),
                twoFASetAt: daysAgo(1, now),
                otherAuthsRemovedAt: daysAgo(0.5, now),
                warmupJitter: 2,
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('organic_only');
        });
    });

    // ======= IDENTITY PHASE =======

    describe('IDENTITY phase', () => {
        test('identity, photos NOT deleted → delete_photos', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.IDENTITY,
                enrolledAt: daysAgo(10, now),
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('delete_photos');
        });

        test('identity, photos deleted yesterday → organic_only (need 2 day gap for name/bio)', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.IDENTITY,
                enrolledAt: daysAgo(10, now),
                profilePicsDeletedAt: daysAgo(1, now),
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('organic_only');
        });

        test('identity, photos deleted 3 days ago → update_name_bio', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.IDENTITY,
                enrolledAt: daysAgo(10, now),
                profilePicsDeletedAt: daysAgo(3, now),
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('update_name_bio');
        });

        test('identity, name/bio done yesterday → organic_only (need 2 day gap for username)', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.IDENTITY,
                enrolledAt: daysAgo(10, now),
                profilePicsDeletedAt: daysAgo(5, now),
                nameBioUpdatedAt: daysAgo(1, now),
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('organic_only');
        });

        test('identity, name/bio done 3 days ago → update_username', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.IDENTITY,
                enrolledAt: daysAgo(10, now),
                profilePicsDeletedAt: daysAgo(6, now),
                nameBioUpdatedAt: daysAgo(3, now),
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('update_username');
        });

        test('identity, all steps done, enrolled 9 days, jitter=0 → join_channels (growing)', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.IDENTITY,
                enrolledAt: daysAgo(9, now),
                profilePicsDeletedAt: daysAgo(6, now),
                nameBioUpdatedAt: daysAgo(4, now),
                usernameUpdatedAt: daysAgo(2, now),
                warmupJitter: 0,
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('join_channels');
            expect(result.phase).toBe(WarmupPhase.GROWING);
        });

        test('identity, all steps done, enrolled 6 days, jitter=3 → organic_only (needs 8+3=11)', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.IDENTITY,
                enrolledAt: daysAgo(6, now),
                profilePicsDeletedAt: daysAgo(4, now),
                nameBioUpdatedAt: daysAgo(2, now),
                usernameUpdatedAt: daysAgo(1, now),
                warmupJitter: 3,
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('organic_only');
        });
    });

    // ======= GROWING PHASE =======

    describe('GROWING phase', () => {
        const fullySettledIdentity = {
            privacyUpdatedAt: daysAgo(14, now),
            twoFASetAt: daysAgo(12, now),
            otherAuthsRemovedAt: daysAgo(10, now),
            profilePicsDeletedAt: daysAgo(8, now),
            nameBioUpdatedAt: daysAgo(6, now),
            usernameUpdatedAt: daysAgo(4, now),
        };

        test('growing, channels < 200 → join_channels', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.GROWING,
                enrolledAt: daysAgo(15, now),
                channels: 150,
                ...fullySettledIdentity,
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('join_channels');
        });

        test('growing, channels=200, enrolled 15 days, jitter=0 → organic_only (needs 18 days for maturing)', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.GROWING,
                enrolledAt: daysAgo(15, now),
                channels: 200,
                warmupJitter: 0,
                ...fullySettledIdentity,
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('organic_only');
        });

        test('growing, channels=250, enrolled 20 days, jitter=0 → upload_photo (maturing)', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.GROWING,
                enrolledAt: daysAgo(20, now),
                channels: 250,
                warmupJitter: 0,
                ...fullySettledIdentity,
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('upload_photo');
            expect(result.phase).toBe(WarmupPhase.MATURING);
        });

        test('growing, channels=250, enrolled 19 days, jitter=0, photo done → organic_only (needs day 20)', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.GROWING,
                enrolledAt: daysAgo(19, now),
                channels: 250,
                warmupJitter: 0,
                profilePicsUpdatedAt: daysAgo(1, now),
                ...fullySettledIdentity,
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('organic_only');
            expect(result.phase).toBe(WarmupPhase.MATURING);
        });

        test('growing, channels=250, enrolled 21 days, jitter=0, photo done → advance_to_ready', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.GROWING,
                enrolledAt: daysAgo(21, now),
                channels: 250,
                warmupJitter: 0,
                profilePicsUpdatedAt: daysAgo(1, now),
                ...fullySettledIdentity,
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('advance_to_ready');
            expect(result.phase).toBe(WarmupPhase.MATURING);
        });

        test('growing, channels=0 → join_channels (edge case: no channels at all)', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.GROWING,
                enrolledAt: daysAgo(10, now),
                channels: 0,
                ...fullySettledIdentity,
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('join_channels');
        });

        test('growing with missed settling work → catches up before joining channels', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.GROWING,
                enrolledAt: daysAgo(15, now),
                channels: 150,
                privacyUpdatedAt: daysAgo(5, now),
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('set_2fa');
        });
    });

    // ======= MATURING PHASE =======

    describe('MATURING phase', () => {
        const fullySettledIdentity = {
            privacyUpdatedAt: daysAgo(20, now),
            twoFASetAt: daysAgo(18, now),
            otherAuthsRemovedAt: daysAgo(16, now),
            profilePicsDeletedAt: daysAgo(14, now),
            nameBioUpdatedAt: daysAgo(12, now),
            usernameUpdatedAt: daysAgo(10, now),
        };

        test('maturing, no photo → upload_photo', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.MATURING,
                enrolledAt: daysAgo(25, now),
                channels: 250,
                ...fullySettledIdentity,
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('upload_photo');
        });

        test('maturing, photo done, day 19, jitter=0 → organic_only (needs day 20)', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.MATURING,
                enrolledAt: daysAgo(19, now),
                channels: 250,
                profilePicsUpdatedAt: daysAgo(1, now),
                warmupJitter: 0,
                ...fullySettledIdentity,
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('organic_only');
        });

        test('maturing, photo done, day 21, jitter=0 → advance_to_ready', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.MATURING,
                enrolledAt: daysAgo(21, now),
                channels: 250,
                profilePicsUpdatedAt: daysAgo(3, now),
                warmupJitter: 0,
                ...fullySettledIdentity,
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('advance_to_ready');
        });

        test('maturing with missed identity work → catches up before photo upload', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.MATURING,
                enrolledAt: daysAgo(25, now),
                channels: 250,
                privacyUpdatedAt: daysAgo(20, now),
                twoFASetAt: daysAgo(18, now),
                otherAuthsRemovedAt: daysAgo(16, now),
                profilePicsDeletedAt: daysAgo(14, now),
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('update_name_bio');
        });
    });

    // ======= READY & SESSION_ROTATED =======

    describe('READY and SESSION_ROTATED phases', () => {
        test('ready → rotate_session', () => {
            const doc = makeDoc({ warmupPhase: WarmupPhase.READY });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('rotate_session');
        });

        test('session_rotated → wait', () => {
            const doc = makeDoc({ warmupPhase: WarmupPhase.SESSION_ROTATED });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('wait');
        });
    });

    // ======= EDGE CASES =======

    describe('Edge cases', () => {
        test('unknown phase → treat as enrolled, wait', () => {
            const doc = makeDoc({ warmupPhase: 'garbage_phase' });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('wait');
            expect(result.phase).toBe(WarmupPhase.ENROLLED);
        });

        test('null warmupPhase → treat as enrolled', () => {
            const doc = makeDoc({ warmupPhase: null });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.phase).toBe(WarmupPhase.ENROLLED);
        });

        test('undefined warmupPhase → treat as enrolled', () => {
            const doc = makeDoc({});
            const result = getWarmupPhaseAction(doc, now);
            expect(result.phase).toBe(WarmupPhase.ENROLLED);
        });

        test('existing account with no warmup fields (migration) → enrolled, wait', () => {
            // Simulates an existing DB document before warmup was added
            const doc = {
                warmupPhase: undefined,
                warmupJitter: undefined,
                enrolledAt: undefined,
                channels: 300,
                privacyUpdatedAt: undefined,
                profilePicsDeletedAt: undefined,
                nameBioUpdatedAt: undefined,
                usernameUpdatedAt: undefined,
                profilePicsUpdatedAt: undefined,
                organicActivityAt: undefined,
                createdAt: undefined,
            };
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('wait');
        });

        test('channels undefined treated as 0', () => {
            const doc = makeDoc({
                warmupPhase: WarmupPhase.GROWING,
                enrolledAt: daysAgo(10, now),
                channels: undefined,
                privacyUpdatedAt: daysAgo(9, now),
                twoFASetAt: daysAgo(7, now),
                otherAuthsRemovedAt: daysAgo(5, now),
                profilePicsDeletedAt: daysAgo(4, now),
                nameBioUpdatedAt: daysAgo(3, now),
                usernameUpdatedAt: daysAgo(2, now),
            });
            const result = getWarmupPhaseAction(doc, now);
            expect(result.action).toBe('join_channels');
        });
    });

    // ======= FULL TIMELINE SIMULATION =======

    describe('Full timeline simulation (jitter=0)', () => {
        test('complete warmup journey over 25 days', () => {
            const enrolledAt = new Date(now - 25 * ONE_DAY_MS);

            // Day 0: enrolled, wait
            let doc = makeDoc({ warmupPhase: WarmupPhase.ENROLLED, enrolledAt, warmupJitter: 0 });
            let simNow = enrolledAt.getTime() + 0.5 * ONE_DAY_MS;
            expect(getWarmupPhaseAction(doc, simNow).action).toBe('wait');

            // Day 1.5: set_privacy (transition to settling)
            simNow = enrolledAt.getTime() + 1.5 * ONE_DAY_MS;
            let result = getWarmupPhaseAction(doc, simNow);
            expect(result.action).toBe('set_privacy');

            doc.warmupPhase = WarmupPhase.SETTLING;
            doc.privacyUpdatedAt = new Date(simNow);

            // Day 2.5: organic_only (need 2 day gap for 2FA)
            simNow = enrolledAt.getTime() + 2.5 * ONE_DAY_MS;
            expect(getWarmupPhaseAction(doc, simNow).action).toBe('organic_only');

            // Day 4: set_2fa (privacy was 2.5+ days ago)
            simNow = enrolledAt.getTime() + 4 * ONE_DAY_MS;
            expect(getWarmupPhaseAction(doc, simNow).action).toBe('set_2fa');
            doc.twoFASetAt = new Date(simNow);

            // Day 5: organic_only (need 2 day gap for removeOtherAuths)
            simNow = enrolledAt.getTime() + 5 * ONE_DAY_MS;
            expect(getWarmupPhaseAction(doc, simNow).action).toBe('organic_only');

            // Day 6.5: remove_other_auths (2FA was 2.5+ days ago)
            simNow = enrolledAt.getTime() + 6.5 * ONE_DAY_MS;
            expect(getWarmupPhaseAction(doc, simNow).action).toBe('remove_other_auths');
            doc.otherAuthsRemovedAt = new Date(simNow);

            // Day 7: all settling done, but still need day 4+ for identity (already past) → delete_photos
            simNow = enrolledAt.getTime() + 7 * ONE_DAY_MS;
            result = getWarmupPhaseAction(doc, simNow);
            expect(result.action).toBe('delete_photos');
            expect(result.phase).toBe(WarmupPhase.IDENTITY);

            doc.warmupPhase = WarmupPhase.IDENTITY;
            doc.profilePicsDeletedAt = new Date(simNow);

            // Day 8: organic_only (need 2 day gap for name/bio)
            simNow = enrolledAt.getTime() + 8 * ONE_DAY_MS;
            expect(getWarmupPhaseAction(doc, simNow).action).toBe('organic_only');

            // Day 9.5: update_name_bio
            simNow = enrolledAt.getTime() + 9.5 * ONE_DAY_MS;
            expect(getWarmupPhaseAction(doc, simNow).action).toBe('update_name_bio');
            doc.nameBioUpdatedAt = new Date(simNow);

            // Day 12: update_username (2+ days after name/bio AND 8+ days enrolled)
            simNow = enrolledAt.getTime() + 12 * ONE_DAY_MS;
            expect(getWarmupPhaseAction(doc, simNow).action).toBe('update_username');
            doc.usernameUpdatedAt = new Date(simNow);

            // Day 12: all identity done, 12 >= 8 → join_channels
            result = getWarmupPhaseAction(doc, simNow);
            expect(result.action).toBe('join_channels');

            doc.warmupPhase = WarmupPhase.GROWING;
            doc.channels = 50;

            // Day 14: still growing
            simNow = enrolledAt.getTime() + 14 * ONE_DAY_MS;
            expect(getWarmupPhaseAction(doc, simNow).action).toBe('join_channels');

            // Day 16: channels reached 200, but need day 18 for maturing
            doc.channels = 210;
            simNow = enrolledAt.getTime() + 16 * ONE_DAY_MS;
            expect(getWarmupPhaseAction(doc, simNow).action).toBe('organic_only');

            // Day 19: channels=210, day >= 18 → upload_photo (maturing)
            simNow = enrolledAt.getTime() + 19 * ONE_DAY_MS;
            result = getWarmupPhaseAction(doc, simNow);
            expect(result.action).toBe('upload_photo');
            expect(result.phase).toBe(WarmupPhase.MATURING);

            doc.warmupPhase = WarmupPhase.MATURING;
            doc.profilePicsUpdatedAt = new Date(simNow);

            // Day 19: photo done but day < 20 → organic_only (day-20 floor)
            result = getWarmupPhaseAction(doc, simNow);
            expect(result.action).toBe('organic_only');

            // Day 21: day >= 20 → advance_to_ready
            simNow = enrolledAt.getTime() + 21 * ONE_DAY_MS;
            result = getWarmupPhaseAction(doc, simNow);
            expect(result.action).toBe('advance_to_ready');

            // After ready
            doc.warmupPhase = WarmupPhase.READY;
            expect(getWarmupPhaseAction(doc, simNow).action).toBe('rotate_session');
        });
    });
});

describe('isAccountReady', () => {
    test('ready → false', () => expect(isAccountReady(WarmupPhase.READY)).toBe(false));
    test('session_rotated → true', () => expect(isAccountReady(WarmupPhase.SESSION_ROTATED)).toBe(true));
    test('enrolled → false', () => expect(isAccountReady(WarmupPhase.ENROLLED)).toBe(false));
    test('growing → false', () => expect(isAccountReady(WarmupPhase.GROWING)).toBe(false));
    test('undefined → false', () => expect(isAccountReady(undefined)).toBe(false));
});

describe('isAccountWarmingUp', () => {
    test('enrolled → true', () => expect(isAccountWarmingUp(WarmupPhase.ENROLLED)).toBe(true));
    test('settling → true', () => expect(isAccountWarmingUp(WarmupPhase.SETTLING)).toBe(true));
    test('identity → true', () => expect(isAccountWarmingUp(WarmupPhase.IDENTITY)).toBe(true));
    test('growing → true', () => expect(isAccountWarmingUp(WarmupPhase.GROWING)).toBe(true));
    test('maturing → true', () => expect(isAccountWarmingUp(WarmupPhase.MATURING)).toBe(true));
    test('ready → false', () => expect(isAccountWarmingUp(WarmupPhase.READY)).toBe(false));
    test('session_rotated → false', () => expect(isAccountWarmingUp(WarmupPhase.SESSION_ROTATED)).toBe(false));
    test('undefined → true (treated as enrolled)', () => expect(isAccountWarmingUp(undefined)).toBe(true));
    test('null → true (treated as enrolled)', () => expect(isAccountWarmingUp(null)).toBe(true));
});

// ======= CATCH-UP LOGIC (growing/maturing with missed settling/identity) =======

describe('Catch-up: growing phase with missed settling steps', () => {
    const now = Date.now();

    test('growing account with no privacy → set_privacy (catch-up)', () => {
        const doc = makeDoc({
            warmupPhase: WarmupPhase.GROWING,
            enrolledAt: daysAgo(15, now),
            channels: 250,
            // No settling steps done
        });
        const result = getWarmupPhaseAction(doc, now);
        expect(result.action).toBe('set_privacy');
        expect(result.phase).toBe(WarmupPhase.GROWING);
    });

    test('growing account with privacy done but no 2FA, gate passed → set_2fa', () => {
        const doc = makeDoc({
            warmupPhase: WarmupPhase.GROWING,
            enrolledAt: daysAgo(15, now),
            channels: 250,
            privacyUpdatedAt: daysAgo(5, now),
        });
        const result = getWarmupPhaseAction(doc, now);
        expect(result.action).toBe('set_2fa');
    });

    test('growing account with privacy done but no 2FA, gate NOT passed → organic_only', () => {
        const doc = makeDoc({
            warmupPhase: WarmupPhase.GROWING,
            enrolledAt: daysAgo(15, now),
            channels: 250,
            privacyUpdatedAt: daysAgo(1, now),
        });
        const result = getWarmupPhaseAction(doc, now);
        expect(result.action).toBe('organic_only');
    });

    test('growing account with settling done but no identity steps → delete_photos', () => {
        const doc = makeDoc({
            warmupPhase: WarmupPhase.GROWING,
            enrolledAt: daysAgo(15, now),
            channels: 250,
            privacyUpdatedAt: daysAgo(10, now),
            twoFASetAt: daysAgo(8, now),
            otherAuthsRemovedAt: daysAgo(6, now),
        });
        const result = getWarmupPhaseAction(doc, now);
        expect(result.action).toBe('delete_photos');
    });

    test('growing account with settling done, photos deleted, name/bio gate passed → update_name_bio', () => {
        const doc = makeDoc({
            warmupPhase: WarmupPhase.GROWING,
            enrolledAt: daysAgo(15, now),
            channels: 250,
            privacyUpdatedAt: daysAgo(10, now),
            twoFASetAt: daysAgo(8, now),
            otherAuthsRemovedAt: daysAgo(6, now),
            profilePicsDeletedAt: daysAgo(4, now),
        });
        const result = getWarmupPhaseAction(doc, now);
        expect(result.action).toBe('update_name_bio');
    });

    test('growing account with settling+identity done, channels < 200 → join_channels (normal flow)', () => {
        const doc = makeDoc({
            warmupPhase: WarmupPhase.GROWING,
            enrolledAt: daysAgo(15, now),
            channels: 150,
            privacyUpdatedAt: daysAgo(10, now),
            twoFASetAt: daysAgo(8, now),
            otherAuthsRemovedAt: daysAgo(6, now),
            profilePicsDeletedAt: daysAgo(10, now),
            nameBioUpdatedAt: daysAgo(5, now),
            usernameUpdatedAt: daysAgo(3, now),
        });
        const result = getWarmupPhaseAction(doc, now);
        expect(result.action).toBe('join_channels');
    });

    test('growing account fully caught up, channels >= 200, day >= 18 → maturing upload_photo', () => {
        const doc = makeDoc({
            warmupPhase: WarmupPhase.GROWING,
            enrolledAt: daysAgo(20, now),
            channels: 210,
            privacyUpdatedAt: daysAgo(15, now),
            twoFASetAt: daysAgo(13, now),
            otherAuthsRemovedAt: daysAgo(11, now),
            profilePicsDeletedAt: daysAgo(15, now),
            nameBioUpdatedAt: daysAgo(10, now),
            usernameUpdatedAt: daysAgo(8, now),
        });
        const result = getWarmupPhaseAction(doc, now);
        expect(result.phase).toBe(WarmupPhase.MATURING);
        expect(result.action).toBe('upload_photo');
    });
});

describe('Catch-up: maturing phase with missed settling steps', () => {
    const now = Date.now();

    test('maturing account with no privacy → set_privacy (catch-up)', () => {
        const doc = makeDoc({
            warmupPhase: WarmupPhase.MATURING,
            enrolledAt: daysAgo(25, now),
            channels: 250,
        });
        const result = getWarmupPhaseAction(doc, now);
        expect(result.action).toBe('set_privacy');
        expect(result.phase).toBe(WarmupPhase.MATURING);
    });

    test('maturing account with all settling+identity done, no photo → upload_photo (normal)', () => {
        const doc = makeDoc({
            warmupPhase: WarmupPhase.MATURING,
            enrolledAt: daysAgo(25, now),
            channels: 250,
            privacyUpdatedAt: daysAgo(20, now),
            twoFASetAt: daysAgo(18, now),
            otherAuthsRemovedAt: daysAgo(16, now),
            profilePicsDeletedAt: daysAgo(20, now),
            nameBioUpdatedAt: daysAgo(15, now),
            usernameUpdatedAt: daysAgo(13, now),
        });
        const result = getWarmupPhaseAction(doc, now);
        expect(result.action).toBe('upload_photo');
    });

    test('maturing with all done including photo, day >= 20 → advance_to_ready', () => {
        const doc = makeDoc({
            warmupPhase: WarmupPhase.MATURING,
            enrolledAt: daysAgo(22, now),
            channels: 250,
            privacyUpdatedAt: daysAgo(20, now),
            twoFASetAt: daysAgo(18, now),
            otherAuthsRemovedAt: daysAgo(16, now),
            profilePicsDeletedAt: daysAgo(20, now),
            nameBioUpdatedAt: daysAgo(15, now),
            usernameUpdatedAt: daysAgo(13, now),
            profilePicsUpdatedAt: daysAgo(2, now),
        });
        const result = getWarmupPhaseAction(doc, now);
        expect(result.action).toBe('advance_to_ready');
    });
});

describe('Catch-up: identity sub-step 2-day gates respected during catch-up', () => {
    const now = Date.now();

    test('growing: photos deleted 1 day ago, name/bio gate NOT passed → organic_only', () => {
        const doc = makeDoc({
            warmupPhase: WarmupPhase.GROWING,
            enrolledAt: daysAgo(15, now),
            channels: 250,
            privacyUpdatedAt: daysAgo(10, now),
            twoFASetAt: daysAgo(8, now),
            otherAuthsRemovedAt: daysAgo(6, now),
            profilePicsDeletedAt: daysAgo(1, now),
        });
        const result = getWarmupPhaseAction(doc, now);
        expect(result.action).toBe('organic_only');
    });

    test('growing: name/bio done 1 day ago, username gate NOT passed → organic_only', () => {
        const doc = makeDoc({
            warmupPhase: WarmupPhase.GROWING,
            enrolledAt: daysAgo(15, now),
            channels: 250,
            privacyUpdatedAt: daysAgo(10, now),
            twoFASetAt: daysAgo(8, now),
            otherAuthsRemovedAt: daysAgo(6, now),
            profilePicsDeletedAt: daysAgo(5, now),
            nameBioUpdatedAt: daysAgo(1, now),
        });
        const result = getWarmupPhaseAction(doc, now);
        expect(result.action).toBe('organic_only');
    });
});

describe('Normal phases unaffected by catch-up', () => {
    const now = Date.now();

    test('settling account with all steps done transitions normally', () => {
        const doc = makeDoc({
            warmupPhase: WarmupPhase.SETTLING,
            enrolledAt: daysAgo(5, now),
            privacyUpdatedAt: daysAgo(4, now),
            twoFASetAt: daysAgo(2, now),
            otherAuthsRemovedAt: daysAgo(0.5, now),
        });
        const result = getWarmupPhaseAction(doc, now);
        // All settling done, day >= 4 → should transition to identity
        expect(result.phase).toBe(WarmupPhase.IDENTITY);
        expect(result.action).toBe('delete_photos');
    });

    test('enrolled phase unchanged — no catch-up applied', () => {
        const doc = makeDoc({
            warmupPhase: WarmupPhase.ENROLLED,
            enrolledAt: daysAgo(0.5, now),
        });
        const result = getWarmupPhaseAction(doc, now);
        expect(result.action).toBe('wait');
    });

    test('session_rotated unchanged — no catch-up applied', () => {
        const doc = makeDoc({
            warmupPhase: WarmupPhase.SESSION_ROTATED,
            enrolledAt: daysAgo(30, now),
        });
        const result = getWarmupPhaseAction(doc, now);
        expect(result.action).toBe('wait');
    });
});
