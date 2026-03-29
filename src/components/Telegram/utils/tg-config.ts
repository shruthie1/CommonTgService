/**
 * Telegram Client Config Generator — Self-contained, realistic fingerprints
 *
 * Generates TelegramClient configuration with:
 *  - Realistic device fingerprints matching official Telegram clients
 *  - API ID + hash matched to the correct platform
 *  - Stable per-mobile fingerprints (same mobile always gets same device)
 *  - Proxy config from ProxyManager or env
 *
 * Env vars:
 *  TG_PLATFORM          — "android"|"ios"|"desktop"|"web"|"macos" (default: "android")
 *  TG_API_ID            — Override API ID (default: picked from platform)
 *  TG_API_HASH          — Override API hash (default: picked from platform)
 *  TG_LANG_CODE         — Language code (default: "en")
 *  TG_SYSTEM_LANG_CODE  — System language code (default: "en-US")
 */

// ════════════════════════════════════════════════════════════
// Official Telegram API credentials (from open-source clients)
// ════════════════════════════════════════════════════════════

export interface TGPlatformConfig {
  apiId: number;
  apiHash: string;
  langPack: string;
  devices: { deviceModel: string; systemVersion: string }[];
  appVersions: string[];
}

const PLATFORMS: Record<string, TGPlatformConfig> = {
  android: {
    apiId: 6,
    apiHash: "eb06d4abfb49dc3eeb1aeb98ae0f581e",
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
    apiId: 10840,
    apiHash: "33c45224029d59cb3ad0c16134215aeb",
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
    apiId: 2040,
    apiHash: "b18441a1ff607e10a989891a5462e627",
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
    apiId: 2496,
    apiHash: "8da85b0d5bfe62527e5b244c209159c3",
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
    apiId: 2834,
    apiHash: "68875f756c9b437a8b916ca3de215815",
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

// ════════════════════════════════════════════════════════════
// Stable hash — same input always gives same output
// ════════════════════════════════════════════════════════════

export function stableHash(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function stablePick<T>(arr: T[], seed: string): T {
  return arr[stableHash(seed) % arr.length];
}

// ════════════════════════════════════════════════════════════
// Proxy config type (matches GramJS ProxyInterface)
// ════════════════════════════════════════════════════════════

export interface TGProxyConfig {
  ip: string;
  port: number;
  socksType: 4 | 5;
  username?: string;
  password?: string;
  timeout?: number;
}

// ════════════════════════════════════════════════════════════
// Output type (matches TelegramClientParams)
// ════════════════════════════════════════════════════════════

export interface TGClientConfig {
  apiId: number;
  apiHash: string;
  deviceModel: string;
  systemVersion: string;
  appVersion: string;
  langCode: string;
  systemLangCode: string;
  langPack: string;
  connectionRetries: number;
  requestRetries: number;
  retryDelay: number;
  timeout: number;
  autoReconnect: boolean;
  useWSS: boolean;
  useIPV6: boolean;
  testServers: boolean;
  proxy?: TGProxyConfig;
}

// ════════════════════════════════════════════════════════════
// Main: generateTGConfig
// ════════════════════════════════════════════════════════════

/**
 * Generate a realistic Telegram client config.
 *
 * @param mobile  — Phone number (used as seed for stable fingerprint)
 * @param proxy   — Optional proxy config (GramJS ProxyInterface format)
 * @param options — Override platform, apiId, apiHash
 *
 * Same mobile always gets the same device/version (stable across restarts).
 */
export function generateTGConfig(
  mobile: string,
  proxy?: TGProxyConfig,
  options?: {
    platform?: string;
    apiId?: number;
    apiHash?: string;
    langCode?: string;
    systemLangCode?: string;
    connectionRetries?: number;
    requestRetries?: number;
    retryDelay?: number;
    timeout?: number;
  }
): TGClientConfig {
  const platformName = (
    options?.platform ||
    process.env.TG_PLATFORM ||
    "android"
  ).toLowerCase();

  const platform = PLATFORMS[platformName];
  if (!platform) {
    throw new Error(
      `Unknown platform "${platformName}". Valid: ${Object.keys(PLATFORMS).join(", ")}`
    );
  }

  // Stable selection seeded by mobile + clientId (so different clients get different fingerprints)
  const seed = `${mobile}-${process.env.clientId || "default"}`;
  const device = stablePick(platform.devices, seed);
  const appVersion = stablePick(platform.appVersions, seed + "-app");

  const apiId = options?.apiId || parseInt(process.env.TG_API_ID || "") || platform.apiId;
  const apiHash = options?.apiHash || process.env.TG_API_HASH || platform.apiHash;
  const langCode = options?.langCode || process.env.TG_LANG_CODE || "en";
  const systemLangCode = options?.systemLangCode || process.env.TG_SYSTEM_LANG_CODE || "en-US";

  const config: TGClientConfig = {
    apiId,
    apiHash,
    deviceModel: device.deviceModel,
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

// ════════════════════════════════════════════════════════════
// Convenience: generate config with proxy from ProxyManager
// ════════════════════════════════════════════════════════════

/**
 * Generate config + inject proxy from the active ProxyManager.
 *
 * Usage:
 *   import { initProxy } from "./proxy-manager.js";
 *   import { generateTGConfigWithProxy } from "./tg-config.js";
 *
 *   const manager = await initProxy();
 *   const config = generateTGConfigWithProxy("916383356167", manager.getActive());
 *   const client = new TelegramClient(session, config.apiId, config.apiHash, config);
 */
export function generateTGConfigWithProxy(
  mobile: string,
  proxyConfig: { host: string; port: number; username?: string; password?: string; timeout?: number } | null,
  options?: Parameters<typeof generateTGConfig>[2]
): TGClientConfig {
  const proxy: TGProxyConfig | undefined = proxyConfig
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

// ════════════════════════════════════════════════════════════
// Utility: get available platforms
// ════════════════════════════════════════════════════════════

export function getAvailablePlatforms(): string[] {
  return Object.keys(PLATFORMS);
}

export function getPlatformConfig(platform: string): TGPlatformConfig | undefined {
  return PLATFORMS[platform.toLowerCase()];
}
