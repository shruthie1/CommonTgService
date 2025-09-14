"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fetch_1 = __importDefault(require("node-fetch"));
const configs = {
    "TELEGRAM_CHANNEL_CONFIG_USER_WARNINGS": "-1002655370556::USER_WARNINGS::7320035091:AAEnEihMUCnHKws7TD1OdMtaeUI68bfclEE,7593446076:AAFN5bX1e3KfWlsVsC1ck5lpJVhQ1G-Kk8g,7388081928:AAFBhTnpKuAvasO8hNU7DQ8ZZhLaZdXDUos",
    "TELEGRAM_CHANNEL_CONFIG_LOGIN_FAILURES": "-1002325911569::ACCOUNT_LOGIN_FAILURES::8007951766:AAGSZzAR9pUope_1-oBTINy5hTZSUwE9cYU",
    "TELEGRAM_CHANNEL_CONFIG_CHANNEL_NOTIFIZ": "-1002639688532::CHANNEL_NOTIFICATIONS::7539484691:AAF6qcwQmcvqm7NUSsZuatNIScrlUp1MBs0,7792050387:AAGwIpvodjgfXDWrmMgESgt9KyyWh3m93YQ,7492946640:AAETFIRyJVHhPLTWLU3gIy5lhOGp54URxiA",
    "TELEGRAM_CHANNEL_CONFIG_SAVED": "-1002501941276::SAVED_MESSAGES::7895193503:AAH87hGXw5xqxGAHAoR7DtXojWZ2tUArSa8,7555943945:AAG0A42gMmyyO-8_deMLXKkiLlqwy1eDhno,7618051158:AAGbFhqNcHuf5xuFKPtlCnfH5R7vocC4drs",
    "TELEGRAM_CHANNEL_CONFIG_CLIENT_UPDATES": "-1001972065816::CLIENT_UPDATES::8058256883:AAGbfWhgrttJgnCzO6cMeJItXd-veiP825Q,7796186973:AAH9NQiMYHMgZQi5qVr-Bae-eC48KAeOrpU",
    "TELEGRAM_CHANNEL_CONFIG_HTTP_FAILURES": "-1002619234692::HTTP_FAILURES::8075104137:AAG67nrNiuwWQycDAAPMamIgKBvSMTJNzvU",
    "TELEGRAM_CHANNEL_CONFIG_UNVDS": "-1002698617642::UNVDS::7437673062:AAE8GysoeBPZilc0zQuBv_5XQl45bQ-ZZRo",
    "TELEGRAM_CHANNEL_CONFIG_PROM_LOGS1": "-1002782942700::PROM_LOGS1::7384145001:AAF4Nl2pSazwu38-XWTJmet5FlrDxashEuU,7680874957:AAE1mGeePmCICi806D6kx8otQ4UbEMXOZS0,7464291326:AAH7NCQ6dT7YVwFypv5H2K9Og2xaLXiQPSs",
    "TELEGRAM_CHANNEL_CONFIG_PROM_LOGS2": "-1002697351341::PROM_LOGS2::7433483604:AAEX84KOmBgdixxxwFFFbjmQ1jCX9Mz7Mfw,7885356543:AAH2NQHh-tg-18mx4Esfxii-KvqFmqX_oTY",
    "TELEGRAM_CHANNEL_CONFIG_UNAUTH_CALLS": "-1002862072346::UNAUTH_CALLS::7798359218:AAGoO1uQNR_KlZIRp2zxdlRbTmPcDBUj7Gk,7550633721:AAHvhEXoItDRk7V6is-1J6woXyBOC6EVz2M",
    "TELEGRAM_CHANNEL_CONFIG_ACCOUNT_NOTIFICATIONS": "-1001801844217::ACCOUNT_NOTIFICATIONS::8378638396:AAHTS0xbB5602YwDISPptsAdS36kvzickZA,8443253087:AAEMs1p9-Y-jdoaW5Zuf2GQnuZXNbgUE67M"
};
const API_URL = 'http://localhost:9002/bots';
async function parseConfig(configValue) {
    const [channelId, category, tokens] = configValue.split('::');
    return {
        channelId,
        category,
        tokens: tokens.split(',')
    };
}
async function createBot(token, channelId, category) {
    try {
        const response = await (0, node_fetch_1.default)(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                token,
                channelId,
                category,
                description: `Bot for ${category}`
            })
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to create bot: ${JSON.stringify(errorData)}`);
        }
        const data = await response.json();
        console.log(`✅ Successfully created bot for ${category} with token ${token.substring(0, 10)}...`);
        return data;
    }
    catch (error) {
        console.error(`❌ Error creating bot for ${category} with token ${token.substring(0, 10)}...`, error);
        throw error;
    }
}
async function main() {
    console.log('Starting bot creation process...');
    const results = {
        success: 0,
        failed: 0,
        errors: []
    };
    for (const [configKey, configValue] of Object.entries(configs)) {
        try {
            const config = await parseConfig(configValue);
            console.log(`\nProcessing ${configKey}...`);
            console.log(`Category: ${config.category}`);
            console.log(`Channel ID: ${config.channelId}`);
            console.log(`Number of bots: ${config.tokens.length}`);
            for (const token of config.tokens) {
                try {
                    await createBot(token, config.channelId, config.category);
                    results.success++;
                }
                catch (error) {
                    results.failed++;
                    results.errors.push(`${configKey} - ${error.message}`);
                }
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        catch (error) {
            console.error(`Failed to process ${configKey}:`, error);
            results.errors.push(`${configKey} - ${error.message}`);
        }
    }
    console.log('\n=== Summary ===');
    console.log(`Total successful creations: ${results.success}`);
    console.log(`Total failed creations: ${results.failed}`);
    if (results.errors.length > 0) {
        console.log('\nErrors:');
        results.errors.forEach((error, index) => {
            console.log(`${index + 1}. ${error}`);
        });
    }
}
main().catch(console.error);
//# sourceMappingURL=add-bots.js.map