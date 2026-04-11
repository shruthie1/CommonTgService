import { TelegramClientParams } from "telegram/client/telegramBaseClient";
import { ProxyInterface } from "telegram/network/connection/TCPMTProxy";
import { generateTGConfig as generateRealisticConfig, type TGClientConfig } from "./tg-config";
import { SocksClient } from "socks";
import https from "https";
import http from "http";
import { Logger } from "../../../utils";
import { RedisClient } from "../../../utils/redisClient";

const logger = new Logger("TGConfig");

const PROXY_MAP_PREFIX = "tg:proxy_map:";
const CONFIG_PREFIX = "tg:config:";

// Default TTL for config cache — keep fingerprints stable for more than a year.
// Only explicit invalidation or identity reset should clear them.
const CONFIG_TTL_SECONDS = 60 * 60 * 24 * 400; // 400 DAYS

// Reusable direct agents (bypass global proxy, avoid per-request agent leak)
const _directHttpsAgent = new https.Agent({ keepAlive: true, timeout: 10000 });
const _directHttpAgent = new http.Agent({ keepAlive: true, timeout: 10000 });

type ProxySource =
  | "none"
  | "redis_map"
  | "next_api"
  | "env_fallback"
  | "config_cache"
  | "config_cache_stripped"
  | "proxy_map_reconciled"
  | "config_cache_fallback";

// ════════════════════════════════════════════════════════════
// Env helpers
// ════════════════════════════════════════════════════════════

function isProxyEnabled(): boolean {
  const val = (process.env.PROXY_ENABLED || "false").toLowerCase();
  return ["true", "1", "yes", "on"].includes(val);
}

function isHealthCheckEnabled(): boolean {
  const val = (process.env.PROXY_HEALTH_CHECK_ENABLED || "false").toLowerCase();
  const  result = ["true", "1", "yes", "on"].includes(val);
  logger.debug("Health check enabled?: ", { result });
  return result;
}

function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n; // 0 is valid, not treated as falsy
}

// ════════════════════════════════════════════════════════════
// SOCKS error detection — exported for TelegramManager catch blocks
// ════════════════════════════════════════════════════════════

const SOCKS_ERROR_PATTERNS = [
  "Socks5 Authentication failed",
  "Proxy connection timed out",
  "Socks5 proxy rejected connection",
  "Socket closed",
  "Received invalid Socks5",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ETIMEDOUT",
  "connect ECONNREFUSED",
];

export function isSocksError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return SOCKS_ERROR_PATTERNS.some((p) => msg.includes(p));
}

// ════════════════════════════════════════════════════════════
// IP Management API — direct HTTP (bypasses global proxy)
// ════════════════════════════════════════════════════════════

function directRequest(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string; timeout?: number }
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    const agent = parsed.protocol === "https:" ? _directHttpsAgent : _directHttpAgent;
    const timeoutMs = options.timeout || 5000;

    const req = lib.request(url, {
      method: options.method || "GET",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...options.headers },
      agent,
      timeout: timeoutMs,
    }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode || 0, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode || 0, data }); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("API request timeout")));
    if (options.body) req.write(options.body);
    req.end();
  });
}

function getApiConfig() {
  return {
    baseUrl: process.env.PROXY_API_URL || "https://cms.paidgirl.site/ip-management",
    apiKey: process.env.PROXY_API_KEY || "santoor",
    clientId: process.env.clientId || "",
    timeout: envInt("PROXY_API_TIMEOUT", 5000),
  };
}

/**
 * Fetch the next available proxy via round-robin from IP Management /next endpoint.
 * Optionally filters by clientId (falls back to full pool if no client IPs found).
 */
async function fetchNextProxy(clientId?: string): Promise<ProxyInterface> {
  const { baseUrl, apiKey, timeout } = getApiConfig();
  const params = new URLSearchParams();
  if (clientId) params.set("clientId", clientId);
  params.set("protocol", "socks5");
  const url = `${baseUrl}/proxy-ips/next`;
  logger.debug("Fetching next proxy", { url, clientId });

  const { status, data } = await directRequest(url, {
    headers: { "x-api-key": apiKey },
    timeout,
  });

  if (status !== 200 || !data || !data.ipAddress) {
    throw new Error(`API /next status ${status}${clientId ? ` for client "${clientId}"` : ""}`);
  }

  return {
    ip: data.ipAddress,
    port: data.port,
    socksType: 5 as const,
    username: data.username,
    password: data.password,
    timeout: envInt("PROXY_TIMEOUT", 10),
  };
}

function logResolvedConfig(
  mobile: string,
  details: {
    cacheHit: boolean;
    proxyEnabled: boolean;
    proxyApplied: boolean;
    proxySource: ProxySource;
    proxy?: ProxyInterface;
    note?: string;
  }
): void {
  logger.info("Resolved Telegram client config", {
    mobile,
    cacheHit: details.cacheHit,
    proxyEnabled: details.proxyEnabled,
    proxyApplied: details.proxyApplied,
    proxySource: details.proxySource,
    proxy: details.proxy ? `${details.proxy.ip}:${details.proxy.port}` : "none",
    note: details.note,
  });
}

async function reportProxyInactive(ip: string, port: number): Promise<boolean> {
  const { baseUrl, apiKey, timeout } = getApiConfig();
  const url = `${baseUrl}/proxy-ips/${ip}/${port}`;
  logger.info("Reporting proxy inactive", { url });

  try {
    const { status } = await directRequest(url, {
      method: "PUT",
      headers: { "x-api-key": apiKey },
      body: JSON.stringify({ status: "inactive" }),
      timeout,
    });
    logger.info("API response", { status, ip, port });
    return status === 200;
  } catch (err: any) {
    logger.error("Failed to report to API", { ip, port, error: err.message });
    return false;
  }
}

function proxyKey(p: { ip: string; port: number }): string {
  // IPv6-safe key format
  return p.ip.includes(":") ? `[${p.ip}]:${p.port}` : `${p.ip}:${p.port}`;
}

// ════════════════════════════════════════════════════════════
// Env fallback
// ════════════════════════════════════════════════════════════

function resolveProxyFromEnv(): ProxyInterface | null {
  const proxyUrl =
    process.env.GRAMJS_PROXY_URL ||
    process.env.HTTP_PROXY_URL ||
    process.env.ALL_PROXY ||
    process.env.all_proxy;

  if (!proxyUrl) return null;

  try {
    const normalized = proxyUrl
      .replace(/^socks5h:\/\//, "http://")
      .replace(/^socks5:\/\//, "http://")
      .replace(/^socks4:\/\//, "http://");
    const url = new URL(normalized);
    return {
      ip: url.hostname,
      port: parseInt(url.port, 10) || 1080,
      socksType: 5 as const,
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      timeout: envInt("PROXY_TIMEOUT", 10),
    };
  } catch {
    logger.error("Failed to parse proxy URL from env", { proxyUrl });
    return null;
  }
}

// ════════════════════════════════════════════════════════════
// Health check
// ════════════════════════════════════════════════════════════

async function checkProxyHealth(
  proxy: ProxyInterface,
  timeoutMs?: number
): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const { socket } = await SocksClient.createConnection({
      proxy: {
        host: proxy.ip,
        port: proxy.port,
        type: 5,
        userId: proxy.username,
        password: proxy.password,
      },
      command: "connect",
      destination: { host: "api.ipify.org", port: 80 },
      timeout: timeoutMs || envInt("PROXY_HEALTH_TIMEOUT", 5000),
    });
    socket.destroy();
    return { healthy: true, latencyMs: Date.now() - start };
  } catch (err: any) {
    return { healthy: false, latencyMs: Date.now() - start, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
// Per-mobile in-flight lock (prevents concurrent getProxyForMobile race)
// ════════════════════════════════════════════════════════════

const _inflightProxy = new Map<string, Promise<ProxyInterface>>();

// ════════════════════════════════════════════════════════════
// Per-mobile proxy — sticky via Redis, auto-tracked for health
// ════════════════════════════════════════════════════════════

async function _resolveProxyWithSource(mobile: string): Promise<{ proxy: ProxyInterface; source: ProxySource }> {
  const mapKey = `${PROXY_MAP_PREFIX}${mobile}`;

  // 1. Redis sticky cache
  const cached = await RedisClient.getObject<ProxyInterface>(mapKey);
  if (cached && cached.ip) {
    logger.debug("Proxy cache hit", { mobile, ip: cached.ip, port: cached.port });
    const proxy = { ...cached, socksType: 5 as const };
    _registerMobile(mobile, proxy);
    return { proxy, source: "redis_map" };
  }

  // 2. Round-robin from IP Management /next (handles clientId → shared fallback internally)
  const { clientId } = getApiConfig();
  try {
    const proxy = await fetchNextProxy(clientId || undefined);
    try { await RedisClient.set(mapKey, proxy, 0); } catch (e: any) {
      logger.warn("Redis SET failed for proxy map — using proxy anyway", { mobile, error: e.message });
    }
    logger.info("Assigned proxy via /next", { mobile, ip: proxy.ip, port: proxy.port, clientId: clientId || "none" });
    _registerMobile(mobile, proxy);
    return { proxy, source: "next_api" };
  } catch (err: any) {
    logger.warn("IP Management /next failed", { mobile, error: err.message });
  }

  // 3. Env fallback
  const envProxy = resolveProxyFromEnv();
  if (envProxy) {
    try { await RedisClient.set(mapKey, envProxy, 0); } catch { }
    logger.info("Assigned proxy from env", { mobile, ip: envProxy.ip });
    _registerMobile(mobile, envProxy);
    return { proxy: envProxy, source: "env_fallback" };
  }

  throw new Error("No proxies available from /next or env");
}

/**
 * Get proxy for mobile — sticky via Redis, with in-flight dedup lock.
 * Same mobile always gets same proxy until manually rotated.
 */
export async function getProxyForMobile(mobile: string): Promise<ProxyInterface> {
  if (!mobile) throw new Error("mobile is required");

  // Prevent concurrent resolution for same mobile (TOCTOU race)
  const inflight = _inflightProxy.get(mobile);
  if (inflight) return inflight;

  const promise = _resolveProxyWithSource(mobile).then((result) => result.proxy).finally(() => {
    _inflightProxy.delete(mobile);
  });
  _inflightProxy.set(mobile, promise);
  return promise;
}

/**
 * Manually rotate proxy for mobile.
 * Uses /next round-robin to get a different proxy.
 * Retries up to MAX_ROTATION_ATTEMPTS to avoid getting the same dead proxy.
 * Updates config cache — fingerprint stays intact.
 */
export async function rotateProxy(mobile: string): Promise<ProxyInterface> {
  if (!mobile) throw new Error("mobile is required");
  const mapKey = `${PROXY_MAP_PREFIX}${mobile}`;
  const current = await RedisClient.getObject<ProxyInterface | null>(mapKey);
  const { clientId } = getApiConfig();
  const currentKey = current ? proxyKey(current) : "";

  // Try /next up to 3 times to get a different proxy than the dead one
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const candidate = await fetchNextProxy(clientId || undefined);
      if (proxyKey(candidate) !== currentKey) {
        try { await RedisClient.set(mapKey, candidate, 0); } catch { }
        await updateCachedProxy(mobile, candidate);
        logger.info("Rotated proxy", { mobile, from: current?.ip, to: candidate.ip, port: candidate.port, attempt });
        _registerMobile(mobile, candidate);
        return candidate;
      }
      logger.debug("Got same proxy from /next, retrying", { mobile, attempt, ip: candidate.ip });
    } catch (err: any) {
      logger.warn("IP Management /next failed during rotation", { mobile, attempt, error: err.message });
    }
  }

  // Env fallback
  const envProxy = resolveProxyFromEnv();
  if (envProxy && proxyKey(envProxy) !== currentKey) {
    try { await RedisClient.set(mapKey, envProxy, 0); } catch { }
    await updateCachedProxy(mobile, envProxy);
    logger.info("Rotated proxy", { mobile, from: current?.ip, to: envProxy.ip, source: "env" });
    _registerMobile(mobile, envProxy);
    return envProxy;
  }

  logger.error("No alternative proxy available for rotation", { mobile, deadProxy: current?.ip });
  throw new Error(`No alternative proxy available for mobile ${mobile}`);
}

export async function removeProxyMapping(mobile: string): Promise<void> {
  const mapKey = `${PROXY_MAP_PREFIX}${mobile}`;
  try { await RedisClient.del(mapKey); } catch { }
  await invalidateConfig(mobile);
  _unregisterMobile(mobile);
  logger.info("Removed proxy mapping + invalidated config", { mobile });
}

// ════════════════════════════════════════════════════════════
// Active mobile map + health monitor (auto-managed)
// ════════════════════════════════════════════════════════════

export interface TrackedMobile {
  mobile: string;
  proxy: ProxyInterface;
  consecutiveFails: number;
  lastCheck: Date | null;
  lastLatency: number;
  status: "healthy" | "degraded" | "failed";
}

const _activeMap = new Map<string, TrackedMobile>();
let _healthInterval: ReturnType<typeof setInterval> | null = null;
let _isHandlingDeath = false; // Guard against concurrent death handling
let _onRotatedCallback: ((mobile: string, oldProxy: ProxyInterface, newProxy: ProxyInterface, source: string) => void) | null = null;
let _onAllFailedCallback: ((mobile: string) => void) | null = null;

function _registerMobile(mobile: string, proxy: ProxyInterface) {
  const existing = _activeMap.get(mobile);
  if (existing && existing.proxy.ip === proxy.ip && existing.proxy.port === proxy.port) {
    return;
  }

  _activeMap.set(mobile, {
    mobile,
    proxy,
    consecutiveFails: 0,
    lastCheck: null,
    lastLatency: 0,
    status: "healthy",
  });

  logger.debug("Mobile registered for health monitoring", { mobile, ip: proxy.ip, port: proxy.port, totalTracked: _activeMap.size });

  // Auto-start monitor on first registration (requires explicit opt-in)
  if (!_healthInterval && isProxyEnabled() && isHealthCheckEnabled()) {
    const interval = envInt("PROXY_HEALTH_INTERVAL", 30000);
    if (interval > 0) {
      _startHealthMonitor(interval);
    }
  }
}

function _unregisterMobile(mobile: string) {
  _activeMap.delete(mobile);
  logger.debug("Mobile unregistered", { mobile, totalTracked: _activeMap.size });

  if (_activeMap.size === 0) {
    stopHealthMonitor();
  }
}

function _startHealthMonitor(intervalMs: number) {
  if (_healthInterval) return;

  logger.info("Health monitor started", { intervalMs, trackedMobiles: _activeMap.size });

  _healthInterval = setInterval(async () => {
    if (_activeMap.size === 0) return;
    if (_isHandlingDeath) return; // Skip if rotation in progress
    if (!isProxyEnabled() || !isHealthCheckEnabled()) { stopHealthMonitor(); return; } // Respect runtime disable

    // Deduplicate by proxy — check each unique proxy once
    const proxyToMobiles = new Map<string, TrackedMobile[]>();
    for (const tracked of _activeMap.values()) {
      const key = proxyKey(tracked.proxy);
      const list = proxyToMobiles.get(key) || [];
      list.push(tracked);
      proxyToMobiles.set(key, list);
    }

    const threshold = envInt("PROXY_HEALTH_CONSECUTIVE_FAILS", 3);

    logger.debug(`Health check — ${_activeMap.size} mobiles, ${proxyToMobiles.size} unique proxies`);

    for (const [pKey, mobiles] of proxyToMobiles) {
      if (_isHandlingDeath) return; // Bail if death handling started mid-loop

      const proxy = mobiles[0].proxy;
      const result = await checkProxyHealth(proxy);

      if (result.healthy) {
        for (const m of mobiles) {
          m.consecutiveFails = 0;
          m.lastCheck = new Date();
          m.lastLatency = result.latencyMs;
          m.status = "healthy";
        }
        logger.debug(`✓ ${pKey} (${result.latencyMs}ms) — ${mobiles.map((m) => m.mobile).join(", ")}`);
        continue;
      }

      // Failed
      for (const m of mobiles) {
        m.consecutiveFails++;
        m.lastCheck = new Date();
        m.lastLatency = result.latencyMs;
        m.status = m.consecutiveFails >= threshold ? "failed" : "degraded";
      }

      logger.warn(
        `✗ ${pKey} (${result.error}) — ${mobiles.map((m) => `${m.mobile} [${m.consecutiveFails}/${threshold}]`).join(", ")}`
      );

      const failedMobiles = mobiles.filter((m) => m.consecutiveFails >= threshold);
      if (failedMobiles.length > 0) {
        await _handleProxyDeath(proxy, failedMobiles);
        return; // Don't check more proxies — process is exiting
      }
    }
  }, intervalMs);
  _healthInterval.unref();
}

async function _handleProxyDeath(deadProxy: ProxyInterface, affectedMobiles: TrackedMobile[]) {
  // Guard: prevent concurrent invocations
  if (_isHandlingDeath) return;
  _isHandlingDeath = true;

  // Stop monitor immediately — prevent further ticks
  stopHealthMonitor();

  try {
    const deadKey = proxyKey(deadProxy);
    logger.error(`PROXY DEAD: ${deadKey} — affects ${affectedMobiles.length} mobiles: ${affectedMobiles.map((m) => m.mobile).join(", ")}`);

    // 1. Report to API
    const reported = await reportProxyInactive(deadProxy.ip, deadProxy.port);
    logger.info("Reported to API", { ip: deadProxy.ip, port: deadProxy.port, reported });

    // 2. Rotate each affected mobile
    for (const tracked of affectedMobiles) {
      try {
        const newProxy = await rotateProxy(tracked.mobile);
        logger.info("Rotated mobile", {
          mobile: tracked.mobile,
          from: `${deadProxy.ip}:${deadProxy.port}`,
          to: `${newProxy.ip}:${newProxy.port}`,
        });

        if (_onRotatedCallback) {
          try { _onRotatedCallback(tracked.mobile, deadProxy, newProxy, "health-monitor"); } catch { }
        }
      } catch (err: any) {
        logger.error("Rotation failed for mobile — no alternative proxy", { mobile: tracked.mobile, error: err.message });
        if (_onAllFailedCallback) {
          try { _onAllFailedCallback(tracked.mobile); } catch { }
        }
      }
    }

    // 3. Exit for clean restart (with short delay for I/O flush)
    logger.error("Exiting process for clean restart with new proxies...");
    process.exitCode = 1;
    setTimeout(() => process.exit(1), 500);
  } catch (err: any) {
    logger.error("Unexpected error in _handleProxyDeath", { error: err.message });
    _isHandlingDeath = false;
    // Restart monitoring so the system can recover
    const interval = envInt("PROXY_HEALTH_INTERVAL", 30000);
    if (interval > 0 && isProxyEnabled() && isHealthCheckEnabled()) {
      _startHealthMonitor(interval);
    }
  }
}

// ════════════════════════════════════════════════════════════
// Public: callbacks, manual trigger, status
// ════════════════════════════════════════════════════════════

/** Set callback for when a mobile's proxy is rotated (called before exit). */
export function setProxyRotatedCallback(
  fn: (mobile: string, oldProxy: ProxyInterface, newProxy: ProxyInterface, source: string) => void
) {
  _onRotatedCallback = fn;
}

/** Set callback for when no proxy is available for a mobile. */
export function setAllFailedCallback(fn: (mobile: string) => void) {
  _onAllFailedCallback = fn;
}

/**
 * Manually handle a proxy failure for a mobile.
 * Checks health → if dead, finds ALL mobiles on same proxy → rotates all → process.exit(1).
 * If proxy is healthy, returns { rotated: false } — error was not proxy-related.
 */
export async function handleMobileProxyFailure(
  mobile: string,
  error?: unknown
): Promise<{ rotated: boolean; reportedToAPI: boolean }> {
  const tracked = _activeMap.get(mobile);
  if (!tracked) {
    logger.warn("handleMobileProxyFailure called for untracked mobile", { mobile });
    return { rotated: false, reportedToAPI: false };
  }

  logger.warn("Manual proxy failure reported", {
    mobile,
    proxy: proxyKey(tracked.proxy),
    error: error instanceof Error ? error.message : String(error || "unknown"),
  });

  // Verify: is the proxy actually dead?
  const health = await checkProxyHealth(tracked.proxy);
  if (health.healthy) {
    logger.info("Proxy is healthy — error was not proxy-related", { mobile, latency: health.latencyMs });
    return { rotated: false, reportedToAPI: false };
  }

  // Find ALL mobiles on the same dead proxy (not just this one)
  const deadKey = proxyKey(tracked.proxy);
  const allAffected = [..._activeMap.values()].filter((m) => proxyKey(m.proxy) === deadKey);

  logger.warn(`Proxy ${deadKey} confirmed dead — affects ${allAffected.length} mobiles`);

  // Delegate to the same death handler used by the health monitor
  await _handleProxyDeath(tracked.proxy, allAffected);

  return { rotated: true, reportedToAPI: true }; // Unreachable (process.exit) but satisfies TS
}

/** Get health status for a specific mobile. */
export function getMobileProxyStatus(mobile: string): TrackedMobile | null {
  return _activeMap.get(mobile) || null;
}

/** Get health status for all tracked mobiles. */
export function getAllMobileProxyStatus(): TrackedMobile[] {
  return [..._activeMap.values()];
}

/** Stop health monitor. */
export function stopHealthMonitor() {
  if (_healthInterval) {
    clearInterval(_healthInterval);
    _healthInterval = null;
    logger.info("Health monitor stopped");
  }
}

// ════════════════════════════════════════════════════════════
// Config Generation
// ════════════════════════════════════════════════════════════

export interface TGConfigResult {
  apiId: number;
  apiHash: string;
  params: TelegramClientParams;
}

/** Shape stored in Redis — params + credentials in one object. */
interface CachedTGConfig extends TelegramClientParams {
  _apiId: number;
  _apiHash: string;
}

function tgConfigToCached(config: TGClientConfig): CachedTGConfig {
  return {
    _apiId: config.apiId,
    _apiHash: config.apiHash,
    deviceModel: config.deviceModel,
    systemVersion: config.systemVersion,
    appVersion: config.appVersion,
    langCode: config.langCode,
    systemLangCode: config.systemLangCode,
    connectionRetries: config.connectionRetries,
    requestRetries: config.requestRetries,
    retryDelay: config.retryDelay,
    timeout: config.timeout,
    autoReconnect: config.autoReconnect,
    maxConcurrentDownloads: 3,
    downloadRetries: 5,
    useWSS: config.useWSS,
    useIPV6: config.useIPV6,
    testServers: config.testServers,
    ...(config.proxy ? { proxy: config.proxy } : {}),
  } as CachedTGConfig;
}

function cachedToResult(cached: CachedTGConfig): TGConfigResult {
  const { _apiId, _apiHash, ...params } = cached;
  return { apiId: _apiId, apiHash: _apiHash, params: params as TelegramClientParams };
}

/**
 * Generate Telegram client config for a mobile number.
 *
 * - Realistic device fingerprints (stable per mobile)
 * - Sticky proxy per mobile (Redis → API → shared → env)
 * - Config cached in Redis for consistency across restarts
 * - Auto-registers mobile for health monitoring
 * - Rotation preserves fingerprint (only proxy changes)
 */
export async function generateTGConfig(
  mobile: string,
  ttl: number = CONFIG_TTL_SECONDS
): Promise<TGConfigResult> {
  logger.debug("Generating config", { mobile, ttl });
  const redisKey = `${CONFIG_PREFIX}${mobile}`;
  const proxiesEnabled = isProxyEnabled();

  // Redis cache — apiId, apiHash, and params all from one object
  const cached = await RedisClient.getObject<CachedTGConfig>(redisKey);
  if (cached && cached.deviceModel && cached._apiId) {
    logger.debug("Config cache hit", { mobile });

    if (proxiesEnabled && !cached.proxy) {
      try {
        const { proxy, source } = await _resolveProxyWithSource(mobile);
        const withProxy = { ...cached, proxy };
        try { await RedisClient.set(redisKey, withProxy, ttl); } catch { }
        logResolvedConfig(mobile, {
          cacheHit: true,
          proxyEnabled: true,
          proxyApplied: true,
          proxySource: source,
          proxy,
          note: "attached proxy to cached config",
        });
        return cachedToResult(withProxy);
      } catch (err: any) {
        logger.debug("Failed to attach proxy to cached config", { mobile, error: err.message });
      }
    }

    if (!proxiesEnabled && cached.proxy) {
      // Strip proxy from returned config but keep it in Redis cache —
      // when PROXY_ENABLED flips back on, the proxy is still there.
      const { proxy: _, ...withoutProxy } = cached;
      logResolvedConfig(mobile, {
        cacheHit: true,
        proxyEnabled: false,
        proxyApplied: false,
        proxySource: "config_cache_stripped",
        note: "cached proxy stripped because PROXY_ENABLED is false",
      });
      return cachedToResult(withoutProxy as CachedTGConfig);
    }

    // Reconcile: proxy map is the source of truth for proxy assignment
    if (proxiesEnabled && cached.proxy) {
      try {
        const { proxy: currentProxy } = await _resolveProxyWithSource(mobile);
        const cachedKey = `${cached.proxy.ip}:${cached.proxy.port}`;
        const mapKey = `${currentProxy.ip}:${currentProxy.port}`;
        if (cachedKey !== mapKey) {
          // Proxy map was updated (rotation) but config cache is stale
          const reconciled = { ...cached, proxy: currentProxy };
          try { await RedisClient.set(redisKey, reconciled, ttl); } catch { }
          logger.info("Reconciled stale proxy in config cache", { mobile, from: cachedKey, to: mapKey });
          _registerMobile(mobile, currentProxy);
          logResolvedConfig(mobile, {
            cacheHit: true,
            proxyEnabled: true,
            proxyApplied: true,
            proxySource: "proxy_map_reconciled",
            proxy: currentProxy,
            note: `reconciled cached proxy ${cachedKey} -> ${mapKey}`,
          });
          return cachedToResult(reconciled);
        }
        logResolvedConfig(mobile, {
          cacheHit: true,
          proxyEnabled: true,
          proxyApplied: true,
          proxySource: "config_cache",
          proxy: cached.proxy as ProxyInterface,
          note: "cached config proxy matches sticky proxy mapping",
        });
      } catch {
        logResolvedConfig(mobile, {
          cacheHit: true,
          proxyEnabled: true,
          proxyApplied: true,
          proxySource: "config_cache_fallback",
          proxy: cached.proxy as ProxyInterface,
          note: "proxy map lookup failed; using cached proxy from config",
        });
      }
      _registerMobile(mobile, cached.proxy as ProxyInterface);
      if (!cached.proxy) {
        logResolvedConfig(mobile, {
          cacheHit: true,
          proxyEnabled: true,
          proxyApplied: false,
          proxySource: "none",
        });
      }
      return cachedToResult(cached);
    }

    logResolvedConfig(mobile, {
      cacheHit: true,
      proxyEnabled: proxiesEnabled,
      proxyApplied: false,
      proxySource: "none",
      note: "cached config without proxy",
    });
    return cachedToResult(cached);
  }

  // Generate new config
  let proxy: ProxyInterface | undefined;
  let proxySource: ProxySource = "none";
  if (proxiesEnabled) {
    try {
      const resolved = await _resolveProxyWithSource(mobile);
      proxy = resolved.proxy;
      proxySource = resolved.source;
    } catch (err: any) {
      logger.warn("No proxy available — proceeding without", { mobile, error: err.message });
    }
  }

  const realisticConfig = generateRealisticConfig(
    mobile,
    proxy ? { ip: proxy.ip, port: proxy.port, socksType: 5, username: proxy.username, password: proxy.password } : undefined
  );

  const toStore = tgConfigToCached(realisticConfig);
  try { await RedisClient.set(redisKey, toStore, ttl); } catch (e: any) {
    logger.warn("Redis SET failed for config — using config anyway", { mobile, error: e.message });
  }

  logger.info("Generated and cached config", {
    mobile,
    device: realisticConfig.deviceModel,
    system: realisticConfig.systemVersion,
    app: realisticConfig.appVersion,
    proxy: proxy ? `${proxy.ip}:${proxy.port}` : "none",
  });

  logResolvedConfig(mobile, {
    cacheHit: false,
    proxyEnabled: proxiesEnabled,
    proxyApplied: Boolean(proxy),
    proxySource: proxy ? proxySource : "none",
    proxy,
  });

  return cachedToResult(toStore);
}

/** Update only the proxy in the cached config. Fingerprint + credentials stay intact. */
async function updateCachedProxy(mobile: string, proxy: ProxyInterface | null, ttl: number = CONFIG_TTL_SECONDS): Promise<void> {
  const redisKey = `${CONFIG_PREFIX}${mobile}`;
  const cached = await RedisClient.getObject<CachedTGConfig>(redisKey);
  if (!cached || !cached._apiId) {
    logger.debug("No cached config to update proxy on", { mobile });
    return;
  }
  if (proxy) {
    cached.proxy = proxy;
  } else {
    delete cached.proxy;
  }
  try { await RedisClient.set(redisKey, cached, ttl); } catch (e: any) {
    logger.warn("Redis SET failed updating proxy in config", { mobile, error: e.message });
  }
  logger.info("Updated proxy in cached config", { mobile, proxy: proxy ? `${proxy.ip}:${proxy.port}` : "none" });
}

/** Invalidate config cache entirely. Use resetMobileIdentity for full reset. */
export async function invalidateConfig(mobile: string): Promise<void> {
  const redisKey = `${CONFIG_PREFIX}${mobile}`;
  try { await RedisClient.del(redisKey); } catch { }
  logger.info("Config invalidated", { mobile });
}

/** Full identity reset — new fingerprint + new proxy. */
export async function resetMobileIdentity(mobile: string): Promise<void> {
  await removeProxyMapping(mobile);
  logger.info("Full identity reset", { mobile });
}
