"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stableHash = stableHash;
exports.getTelegramCredentialsForMobile = getTelegramCredentialsForMobile;
exports.getTelegramCredentialPool = getTelegramCredentialPool;
exports.generateTGConfig = generateTGConfig;
exports.generateTGConfigWithProxy = generateTGConfigWithProxy;
exports.getAvailablePlatforms = getAvailablePlatforms;
exports.getPlatformConfig = getPlatformConfig;
exports.getExpectedAuthFingerprint = getExpectedAuthFingerprint;
exports.isAuthAllowlisted = isAuthAllowlisted;
exports.isAuthFingerprintMatch = isAuthFingerprintMatch;
const API_CREDENTIALS = [
    { apiId: 27919939, apiHash: "5ed3834e741b57a560076a1d38d2fa94" },
    { apiId: 25328268, apiHash: "b4e654dd2a051930d0a30bb2add80d09" },
    { apiId: 12777557, apiHash: "05054fc7885dcfa18eb7432865ea3500" },
    { apiId: 27565391, apiHash: "a3a0a2e895f893e2067dae111b20f2d9" },
    { apiId: 27586636, apiHash: "f020539b6bb5b945186d39b3ff1dd998" },
    { apiId: 29210552, apiHash: "f3dbae7e628b312c829e1bd341f1e9a9" },
];
const DEFAULT_PLATFORM = "android";
const DEFAULT_LANG_CODE = "en";
const DEFAULT_SYSTEM_LANG_CODE = "en-US";
const DEVICE_MODEL_TAGS = {
    android: "PGA",
    ios: "PGI",
    desktop: "PGD",
    web: "PGW",
    macos: "PGM",
};
const PLATFORMS = {
    android: {
        langPack: "android",
        devices: [
            { deviceModel: "Samsung SM-S928B", systemVersion: "SDK 35" },
            { deviceModel: "Samsung SM-S926B", systemVersion: "SDK 34" },
            { deviceModel: "Samsung SM-S918B", systemVersion: "SDK 34" },
            { deviceModel: "Samsung SM-A556B", systemVersion: "SDK 34" },
            { deviceModel: "Samsung SM-A155M", systemVersion: "SDK 34" },
            { deviceModel: "Samsung SM-G998B", systemVersion: "SDK 33" },
            { deviceModel: "Google Pixel 9 Pro", systemVersion: "SDK 35" },
            { deviceModel: "Google Pixel 9", systemVersion: "SDK 35" },
            { deviceModel: "Google Pixel 8 Pro", systemVersion: "SDK 34" },
            { deviceModel: "Google Pixel 8", systemVersion: "SDK 34" },
            { deviceModel: "Google Pixel 7a", systemVersion: "SDK 33" },
            { deviceModel: "Xiaomi 23049PCD8G", systemVersion: "SDK 34" },
            { deviceModel: "Xiaomi 2201116SG", systemVersion: "SDK 33" },
            { deviceModel: "OnePlus CPH2449", systemVersion: "SDK 34" },
            { deviceModel: "OnePlus LE2115", systemVersion: "SDK 33" },
        ],
        appVersions: ["12.5.2 (6597)", "12.5.1 (6595)", "12.4.3 (6590)", "12.4.1 (6585)"],
    },
    ios: {
        langPack: "ios",
        devices: [
            { deviceModel: "iPhone 16 Pro Max", systemVersion: "18.3.2" },
            { deviceModel: "iPhone 16 Pro", systemVersion: "18.3.1" },
            { deviceModel: "iPhone 16 Plus", systemVersion: "18.3.1" },
            { deviceModel: "iPhone 16", systemVersion: "18.2" },
            { deviceModel: "iPhone 15 Pro Max", systemVersion: "18.3.2" },
            { deviceModel: "iPhone 15 Pro", systemVersion: "18.3.1" },
            { deviceModel: "iPhone 15 Plus", systemVersion: "18.1.1" },
            { deviceModel: "iPhone 15", systemVersion: "18.1.1" },
            { deviceModel: "iPhone 14 Pro Max", systemVersion: "17.7" },
            { deviceModel: "iPhone 14 Pro", systemVersion: "17.6.1" },
            { deviceModel: "iPhone 14", systemVersion: "17.7" },
            { deviceModel: "iPhone 13 Pro Max", systemVersion: "17.7" },
            { deviceModel: "iPhone 13", systemVersion: "17.6.1" },
            { deviceModel: "iPhone SE (3rd gen)", systemVersion: "18.3.1" },
        ],
        appVersions: ["12.5.2 (32493)", "12.5.1 (32487)", "12.4.1 (32360)"],
    },
    desktop: {
        langPack: "tdesktop",
        devices: [
            { deviceModel: "DESKTOP-PC", systemVersion: "Windows 11 Version 23H2" },
            { deviceModel: "DESKTOP-PC", systemVersion: "Windows 10 Version 22H2" },
            { deviceModel: "MacBook-Pro", systemVersion: "macOS 15.3" },
            { deviceModel: "MacBook-Pro", systemVersion: "macOS 14.2" },
            { deviceModel: "ubuntu-workstation", systemVersion: "Ubuntu 24.04.1 LTS" },
            { deviceModel: "archlinux", systemVersion: "Arch Linux" },
            { deviceModel: "fedora-pc", systemVersion: "Fedora Linux 41 (Workstation Edition)" },
        ],
        appVersions: ["6.6.4", "6.6.3", "6.6.2", "6.5.7"],
    },
    web: {
        langPack: "",
        devices: [
            {
                deviceModel: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
                systemVersion: "Windows",
            },
            {
                deviceModel: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
                systemVersion: "macOS",
            },
            {
                deviceModel: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
                systemVersion: "Linux",
            },
            {
                deviceModel: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0",
                systemVersion: "Windows",
            },
        ],
        appVersions: ["1.28.3 Z", "1.28.2 Z", "1.27.1 Z"],
    },
    macos: {
        langPack: "macos",
        devices: [
            { deviceModel: "MacBook Pro", systemVersion: "macOS 15.3" },
            { deviceModel: "MacBook Pro", systemVersion: "macOS 14.2" },
            { deviceModel: "MacBook Air", systemVersion: "macOS 15.3" },
            { deviceModel: "iMac", systemVersion: "macOS 14.2" },
            { deviceModel: "Mac mini", systemVersion: "macOS 15.3" },
        ],
        appVersions: ["12.5.2 (32493)", "12.5.1 (32487)", "12.4.1 (32360)"],
    },
};
function stableHash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
}
function stablePick(arr, seed) {
    return arr[stableHash(seed) % arr.length];
}
function pickTelegramCredentials(seed) {
    return stablePick(API_CREDENTIALS, `${seed}-credentials`);
}
function getTelegramCredentialsForMobile(mobile) {
    return pickTelegramCredentials(mobile);
}
function getTelegramCredentialPool() {
    return API_CREDENTIALS;
}
function buildCustomDeviceModel(platformName, baseDeviceModel, seed) {
    const tag = stableHash(`${seed}-${platformName}-device`)
        .toString(36)
        .toUpperCase()
        .slice(0, 6)
        .padStart(6, "0");
    const prefix = DEVICE_MODEL_TAGS[platformName] || "PG";
    return `${baseDeviceModel} ${prefix}-${tag}`;
}
function normalizeAuthField(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}
function generateTGConfig(mobile, proxy, options) {
    const platformName = (options?.platform ||
        DEFAULT_PLATFORM).toLowerCase();
    const platform = PLATFORMS[platformName];
    if (!platform) {
        throw new Error(`Unknown platform "${platformName}". Valid: ${Object.keys(PLATFORMS).join(", ")}`);
    }
    const seed = mobile;
    const device = stablePick(platform.devices, seed);
    const appVersion = stablePick(platform.appVersions, seed + "-app");
    const deviceModel = buildCustomDeviceModel(platformName, device.deviceModel, seed);
    const selectedCredentials = pickTelegramCredentials(seed);
    const apiId = options?.apiId || selectedCredentials.apiId;
    const apiHash = options?.apiHash || selectedCredentials.apiHash;
    const langCode = options?.langCode || DEFAULT_LANG_CODE;
    const systemLangCode = options?.systemLangCode || DEFAULT_SYSTEM_LANG_CODE;
    const config = {
        apiId,
        apiHash,
        deviceModel,
        systemVersion: device.systemVersion,
        appVersion,
        langCode,
        systemLangCode,
        langPack: platform.langPack,
        connectionRetries: options?.connectionRetries ?? 5,
        requestRetries: options?.requestRetries ?? 5,
        retryDelay: options?.retryDelay ?? 5000,
        timeout: options?.timeout ?? 30,
        autoReconnect: true,
        useWSS: false,
        useIPV6: false,
        testServers: false,
    };
    if (proxy) {
        config.proxy = proxy;
    }
    return config;
}
function generateTGConfigWithProxy(mobile, proxyConfig, options) {
    const proxy = proxyConfig
        ? {
            ip: proxyConfig.host,
            port: proxyConfig.port,
            socksType: 5,
            username: proxyConfig.username,
            password: proxyConfig.password,
            timeout: proxyConfig.timeout ? proxyConfig.timeout / 1000 : 10,
        }
        : undefined;
    return generateTGConfig(mobile, proxy, options);
}
function getAvailablePlatforms() {
    return Object.keys(PLATFORMS);
}
function getPlatformConfig(platform) {
    return PLATFORMS[platform.toLowerCase()];
}
function getExpectedAuthFingerprint(mobile, options) {
    const platform = (options?.platform || DEFAULT_PLATFORM).toLowerCase();
    const config = generateTGConfig(mobile, undefined, options);
    return {
        apiId: config.apiId,
        apiHash: config.apiHash,
        platform,
        deviceModel: config.deviceModel,
        systemVersion: config.systemVersion,
        appVersion: config.appVersion,
        langCode: config.langCode,
        systemLangCode: config.systemLangCode,
        langPack: config.langPack,
    };
}
const OUR_API_IDS = new Set(API_CREDENTIALS.map(c => c.apiId));
const AUTH_ALLOWLIST = {
    countries: ['singapore'],
    deviceModelSubstrings: ['oneplus 11', 'cli', 'linux', 'windows'],
    deviceModelSuffixes: ['-ssk'],
    appNameSubstrings: ['lik', 'ram', 'sru', 'shru', 'han'],
};
function isAuthAllowlisted(auth) {
    if (auth.apiId && OUR_API_IDS.has(auth.apiId))
        return true;
    const country = normalizeAuthField(auth.country);
    const device = normalizeAuthField(auth.deviceModel);
    const app = normalizeAuthField(auth.appName);
    if (country && AUTH_ALLOWLIST.countries.includes(country))
        return true;
    if (device && AUTH_ALLOWLIST.deviceModelSubstrings.some(s => device.includes(s)))
        return true;
    if (device && AUTH_ALLOWLIST.deviceModelSuffixes.some(s => device.endsWith(s)))
        return true;
    if (app && AUTH_ALLOWLIST.appNameSubstrings.some(s => app.includes(s)))
        return true;
    return false;
}
function isAuthFingerprintMatch(mobile, auth) {
    if (auth.current) {
        return true;
    }
    if (isAuthAllowlisted(auth)) {
        return true;
    }
    const expected = getExpectedAuthFingerprint(mobile);
    return (normalizeAuthField(auth.deviceModel) === normalizeAuthField(expected.deviceModel) &&
        normalizeAuthField(auth.systemVersion) === normalizeAuthField(expected.systemVersion));
}
//# sourceMappingURL=tg-config.js.map