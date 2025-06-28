import { Api, TelegramClient } from 'telegram';
import bigInt from 'big-integer';

/**
 * Set 2FA (Two-Factor Authentication)
 */
export async function set2fa(client: TelegramClient): Promise<void> {
    // Implementation depends on specific 2FA requirements
    // This is a placeholder for the 2FA setup functionality
    console.log('2FA setup not implemented in this utility');
    throw new Error('2FA setup not implemented');
}

/**
 * Update privacy settings in batch
 */
export async function updatePrivacyBatch(client: TelegramClient, settings: {
    phoneNumber?: 'everybody' | 'contacts' | 'nobody';
    lastSeen?: 'everybody' | 'contacts' | 'nobody';
    profilePhotos?: 'everybody' | 'contacts' | 'nobody';
    forwards?: 'everybody' | 'contacts' | 'nobody';
    calls?: 'everybody' | 'contacts' | 'nobody';
    groups?: 'everybody' | 'contacts' | 'nobody';
}): Promise<boolean> {
    const updates: Promise<any>[] = [];

    for (const [key, value] of Object.entries(settings)) {
        const privacyRule = getPrivacyRule(value);
        let inputPrivacyKey: Api.TypeInputPrivacyKey;

        switch (key) {
            case 'phoneNumber':
                inputPrivacyKey = new Api.InputPrivacyKeyPhoneNumber();
                break;
            case 'lastSeen':
                inputPrivacyKey = new Api.InputPrivacyKeyStatusTimestamp();
                break;
            case 'profilePhotos':
                inputPrivacyKey = new Api.InputPrivacyKeyProfilePhoto();
                break;
            case 'forwards':
                inputPrivacyKey = new Api.InputPrivacyKeyForwards();
                break;
            case 'calls':
                inputPrivacyKey = new Api.InputPrivacyKeyPhoneCall();
                break;
            case 'groups':
                inputPrivacyKey = new Api.InputPrivacyKeyChatInvite();
                break;
            default:
                continue;
        }

        updates.push(client.invoke(new Api.account.SetPrivacy({
            key: inputPrivacyKey,
            rules: [privacyRule]
        })));
    }

    await Promise.all(updates);
    return true;
}

/**
 * Update privacy settings for the user account
 */
export async function updatePrivacy(client: TelegramClient): Promise<void> {
    try {
        // Disallow calls from everyone
        await client.invoke(
            new Api.account.SetPrivacy({
                key: new Api.InputPrivacyKeyPhoneCall(),
                rules: [
                    new Api.InputPrivacyValueDisallowAll()
                ],
            })
        );
        console.log("Calls Updated");
        
        // Allow profile photos to be seen by all
        await client.invoke(
            new Api.account.SetPrivacy({
                key: new Api.InputPrivacyKeyProfilePhoto(),
                rules: [
                    new Api.InputPrivacyValueAllowAll()
                ],
            })
        );
        console.log("PP Updated");

        // Allow forwards from all
        await client.invoke(
            new Api.account.SetPrivacy({
                key: new Api.InputPrivacyKeyForwards(),
                rules: [
                    new Api.InputPrivacyValueAllowAll()
                ],
            })
        );
        console.log("forwards Updated");

        // Hide phone number from all
        await client.invoke(
            new Api.account.SetPrivacy({
                key: new Api.InputPrivacyKeyPhoneNumber(),
                rules: [
                    new Api.InputPrivacyValueDisallowAll()
                ],
            })
        );
        console.log("Number Updated");

        // Allow last seen status to be seen by all
        await client.invoke(
            new Api.account.SetPrivacy({
                key: new Api.InputPrivacyKeyStatusTimestamp(),
                rules: [
                    new Api.InputPrivacyValueAllowAll(),
                ],
            })
        );
        console.log("LastSeen Updated");
        
        // Allow about/bio to be seen by all
        await client.invoke(
            new Api.account.SetPrivacy({
                key: new Api.InputPrivacyKeyAbout(),
                rules: [
                    new Api.InputPrivacyValueAllowAll()
                ],
            })
        );
        console.log("About Updated");
    } catch (e) {
        throw e;
    }
}

/**
 * Get session information
 */
export async function getSessionInfo(client: TelegramClient): Promise<{
    sessions: Array<{
        hash: string;
        deviceModel: string;
        platform: string;
        systemVersion: string;
        appName: string;
        dateCreated: Date;
        dateActive: Date;
        ip: string;
        country: string;
        region: string;
    }>;
    webSessions: Array<{
        hash: string;
        domain: string;
        browser: string;
        platform: string;
        dateCreated: Date;
        dateActive: Date;
        ip: string;
        region: string;
    }>;
}> {
    const [authorizationsResult, devicesResult] = await Promise.all([
        client.invoke(new Api.account.GetAuthorizations()),
        client.invoke(new Api.account.GetWebAuthorizations())
    ]);

    const sessions = authorizationsResult.authorizations.map((auth: any) => ({
        hash: auth.hash.toString(),
        deviceModel: auth.deviceModel,
        platform: auth.platform,
        systemVersion: auth.systemVersion,
        appName: auth.appName,
        dateCreated: new Date(auth.dateCreated * 1000),
        dateActive: new Date(auth.dateActive * 1000),
        ip: auth.ip,
        country: auth.country,
        region: auth.region
    }));

    const webSessions = devicesResult.authorizations.map((auth: any) => ({
        hash: auth.hash.toString(),
        domain: auth.domain,
        browser: auth.browser,
        platform: auth.platform,
        dateCreated: new Date(auth.dateCreated * 1000),
        dateActive: new Date(auth.dateActive * 1000),
        ip: auth.ip,
        region: auth.region
    }));

    return {
        sessions,
        webSessions
    };
}

/**
 * Terminate session
 */
export async function terminateSession(client: TelegramClient, options: {
    hash: string;
    type: 'app' | 'web';
    exceptCurrent?: boolean;
}): Promise<boolean> {
    if (options.exceptCurrent) {
        if (options.type === 'app') {
            await client.invoke(new Api.auth.ResetAuthorizations());
        } else {
            await client.invoke(new Api.account.ResetWebAuthorizations());
        }
    } else {
        if (options.type === 'app') {
            await client.invoke(new Api.account.ResetAuthorization({
                hash: bigInt(options.hash)
            }));
        } else {
            await client.invoke(new Api.account.ResetWebAuthorization({
                hash: bigInt(options.hash)
            }));
        }
    }
    return true;
}

/**
 * Delete profile photos
 */
export async function deleteProfilePhotos(client: TelegramClient): Promise<void> {
    const photos = await client.invoke(new Api.photos.GetUserPhotos({
        userId: new Api.InputUserSelf(),
        offset: 0,
        maxId: bigInt(0),
        limit: 100
    }));

    if ('photos' in photos && photos.photos.length > 0) {
        const photoIds = photos.photos.map((photo: any) => new Api.InputPhoto({
            id: photo.id,
            accessHash: photo.accessHash,
            fileReference: photo.fileReference
        }));

        await client.invoke(new Api.photos.DeletePhotos({
            id: photoIds
        }));

        console.log(`Deleted ${photoIds.length} profile photos`);
    }
}

/**
 * Create new session
 */
export async function createNewSession(client: TelegramClient): Promise<string> {
    // This typically involves creating a new string session
    // The actual implementation would depend on the specific requirements
    const sessionString = (client.session as any).save();
    return sessionString || '';
}

/**
 * Wait for OTP (One-Time Password)
 */
export async function waitForOtp(client: TelegramClient): Promise<string> {
    // This is a placeholder - actual implementation would need to handle OTP input
    // In a real scenario, this might involve waiting for user input or email/SMS
    throw new Error('OTP waiting functionality not implemented');
}

/**
 * Update user profile information
 */
export async function updateProfile(
    client: TelegramClient,
    firstName?: string,
    about?: string
): Promise<void> {
    const data: any = {
        lastName: "",
    };
    
    if (firstName !== undefined) {
        data["firstName"] = firstName;
    }
    if (about !== undefined) {
        data["about"] = about;
    }
    
    try {
        const result = await client.invoke(
            new Api.account.UpdateProfile(data)
        );
        console.log("Updated Name: ", firstName);
    } catch (error) {
        throw error;
    }
}

/**
 * Update username with automatic fallback to available variations
 */
export async function updateUsername(
    client: TelegramClient,
    baseUsername: string,
    sleep: (ms: number) => Promise<void>
): Promise<string> {
    let newUserName = '';
    let username = (baseUsername && baseUsername !== '') ? baseUsername : '';
    let increment = 0;

    if (username === '') {
        try {
            await client.invoke(new Api.account.UpdateUsername({ username }));
            console.log(`Removed Username successfully.`);
        } catch (error) {
            console.log(error);
        }
    } else {
        while (increment < 10) {
            try {
                const result = await client.invoke(
                    new Api.account.CheckUsername({ username })
                );
                console.log(result, " - ", username);
                
                if (result) {
                    await client.invoke(new Api.account.UpdateUsername({ username }));
                    console.log(`Username '${username}' updated successfully.`);
                    newUserName = username;
                    break;
                } else {
                    // Use random characters for last 4 attempts (6, 7, 8, 9)
                    if (increment >= 6) {
                        const randomChars = Math.random().toString(36).substring(2, 6);
                        username = baseUsername + randomChars;
                    } else {
                        username = baseUsername + increment;
                    }
                    increment++;
                    await sleep(2000);
                }
            } catch (error: any) {
                console.log(error.message);
                if (error.errorMessage === 'USERNAME_NOT_MODIFIED') {
                    newUserName = username;
                    break;
                }
                // Use random characters for last 4 attempts (6, 7, 8, 9)
                if (increment >= 6) {
                    const randomChars = Math.random().toString(36).substring(2, 6);
                    username = baseUsername + randomChars;
                } else {
                    username = baseUsername + increment;
                }
                increment++;
                await sleep(2000);
            }
        }
    }
    return newUserName;
}

// Helper functions
function getPrivacyRule(value: string): Api.TypeInputPrivacyRule {
    switch (value) {
        case 'everybody':
            return new Api.InputPrivacyValueAllowAll();
        case 'contacts':
            return new Api.InputPrivacyValueAllowContacts();
        case 'nobody':
            return new Api.InputPrivacyValueDisallowAll();
        default:
            return new Api.InputPrivacyValueAllowContacts();
    }
}
