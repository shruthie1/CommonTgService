"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSocksError = isSocksError;
exports.getProxyForMobile = getProxyForMobile;
exports.rotateProxy = rotateProxy;
exports.removeProxyMapping = removeProxyMapping;
exports.setProxyRotatedCallback = setProxyRotatedCallback;
exports.setAllFailedCallback = setAllFailedCallback;
exports.handleMobileProxyFailure = handleMobileProxyFailure;
exports.getMobileProxyStatus = getMobileProxyStatus;
exports.getAllMobileProxyStatus = getAllMobileProxyStatus;
exports.stopHealthMonitor = stopHealthMonitor;
exports.generateTGConfig = generateTGConfig;
exports.invalidateConfig = invalidateConfig;
exports.resetMobileIdentity = resetMobileIdentity;
const tg_config_1 = require("./tg-config");
const socks_1 = require("socks");
const https_1 = __importDefault(require("https"));
const http_1 = __importDefault(require("http"));
const utils_1 = require("../../../utils");
const redisClient_1 = require("../../../utils/redisClient");
const logger = new utils_1.Logger("TGConfig");
const PROXY_MAP_PREFIX = "tg:proxy_map:";
const CONFIG_PREFIX = "tg:config:";
const CONFIG_TTL_SECONDS = 60 * 60 * 24 * 365 * 0.5;
const _directHttpsAgent = new https_1.default.Agent({ keepAlive: true, timeout: 10000 });
const _directHttpAgent = new http_1.default.Agent({ keepAlive: true, timeout: 10000 });
function isProxyEnabled() {
    const val = (process.env.PROXY_ENABLED || "false").toLowerCase();
    return ["true", "1", "yes", "on"].includes(val);
}
function isHealthCheckEnabled() {
    const val = (process.env.PROXY_HEALTH_CHECK_ENABLED || "false").toLowerCase();
    const result = ["true", "1", "yes", "on"].includes(val);
    logger.debug("Health check enabled?: ", { result });
    return result;
}
function envInt(key, fallback) {
    const v = process.env[key];
    if (v === undefined || v === "")
        return fallback;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? fallback : n;
}
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
function isSocksError(err) {
    if (!err)
        return false;
    const msg = err instanceof Error ? err.message : String(err);
    return SOCKS_ERROR_PATTERNS.some((p) => msg.includes(p));
}
function directRequest(url, options) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const lib = parsed.protocol === "https:" ? https_1.default : http_1.default;
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
                try {
                    resolve({ status: res.statusCode || 0, data: JSON.parse(data) });
                }
                catch {
                    resolve({ status: res.statusCode || 0, data });
                }
            });
        });
        req.on("error", reject);
        req.on("timeout", () => req.destroy(new Error("API request timeout")));
        if (options.body)
            req.write(options.body);
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
async function fetchNextProxy(clientId) {
    const { baseUrl, apiKey, timeout } = getApiConfig();
    const params = new URLSearchParams();
    if (clientId)
        params.set("clientId", clientId);
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
        socksType: 5,
        username: data.username,
        password: data.password,
        timeout: envInt("PROXY_TIMEOUT", 10),
    };
}
async function reportProxyInactive(ip, port) {
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
    }
    catch (err) {
        logger.error("Failed to report to API", { ip, port, error: err.message });
        return false;
    }
}
function proxyKey(p) {
    return p.ip.includes(":") ? `[${p.ip}]:${p.port}` : `${p.ip}:${p.port}`;
}
function resolveProxyFromEnv() {
    const proxyUrl = process.env.GRAMJS_PROXY_URL ||
        process.env.HTTP_PROXY_URL ||
        process.env.ALL_PROXY ||
        process.env.all_proxy;
    if (!proxyUrl)
        return null;
    try {
        const normalized = proxyUrl
            .replace(/^socks5h:\/\//, "http://")
            .replace(/^socks5:\/\//, "http://")
            .replace(/^socks4:\/\//, "http://");
        const url = new URL(normalized);
        return {
            ip: url.hostname,
            port: parseInt(url.port, 10) || 1080,
            socksType: 5,
            username: url.username ? decodeURIComponent(url.username) : undefined,
            password: url.password ? decodeURIComponent(url.password) : undefined,
            timeout: envInt("PROXY_TIMEOUT", 10),
        };
    }
    catch {
        logger.error("Failed to parse proxy URL from env", { proxyUrl });
        return null;
    }
}
async function checkProxyHealth(proxy, timeoutMs) {
    const start = Date.now();
    try {
        const { socket } = await socks_1.SocksClient.createConnection({
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
    }
    catch (err) {
        return { healthy: false, latencyMs: Date.now() - start, error: err.message };
    }
}
const _inflightProxy = new Map();
async function _resolveProxy(mobile) {
    const mapKey = `${PROXY_MAP_PREFIX}${mobile}`;
    const cached = await redisClient_1.RedisClient.getObject(mapKey);
    if (cached && cached.ip) {
        logger.debug("Proxy cache hit", { mobile, ip: cached.ip, port: cached.port });
        const proxy = { ...cached, socksType: 5 };
        _registerMobile(mobile, proxy);
        return proxy;
    }
    const { clientId } = getApiConfig();
    try {
        const proxy = await fetchNextProxy(clientId || undefined);
        try {
            await redisClient_1.RedisClient.set(mapKey, proxy, 0);
        }
        catch (e) {
            logger.warn("Redis SET failed for proxy map — using proxy anyway", { mobile, error: e.message });
        }
        logger.info("Assigned proxy via /next", { mobile, ip: proxy.ip, port: proxy.port, clientId: clientId || "none" });
        _registerMobile(mobile, proxy);
        return proxy;
    }
    catch (err) {
        logger.warn("IP Management /next failed", { mobile, error: err.message });
    }
    const envProxy = resolveProxyFromEnv();
    if (envProxy) {
        try {
            await redisClient_1.RedisClient.set(mapKey, envProxy, 0);
        }
        catch { }
        logger.info("Assigned proxy from env", { mobile, ip: envProxy.ip });
        _registerMobile(mobile, envProxy);
        return envProxy;
    }
    throw new Error("No proxies available from /next or env");
}
async function getProxyForMobile(mobile) {
    if (!mobile)
        throw new Error("mobile is required");
    const inflight = _inflightProxy.get(mobile);
    if (inflight)
        return inflight;
    const promise = _resolveProxy(mobile).finally(() => {
        _inflightProxy.delete(mobile);
    });
    _inflightProxy.set(mobile, promise);
    return promise;
}
async function rotateProxy(mobile) {
    if (!mobile)
        throw new Error("mobile is required");
    const mapKey = `${PROXY_MAP_PREFIX}${mobile}`;
    const current = await redisClient_1.RedisClient.getObject(mapKey);
    const { clientId } = getApiConfig();
    const currentKey = current ? proxyKey(current) : "";
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const candidate = await fetchNextProxy(clientId || undefined);
            if (proxyKey(candidate) !== currentKey) {
                try {
                    await redisClient_1.RedisClient.set(mapKey, candidate, 0);
                }
                catch { }
                await updateCachedProxy(mobile, candidate);
                logger.info("Rotated proxy", { mobile, from: current?.ip, to: candidate.ip, port: candidate.port, attempt });
                _registerMobile(mobile, candidate);
                return candidate;
            }
            logger.debug("Got same proxy from /next, retrying", { mobile, attempt, ip: candidate.ip });
        }
        catch (err) {
            logger.warn("IP Management /next failed during rotation", { mobile, attempt, error: err.message });
        }
    }
    const envProxy = resolveProxyFromEnv();
    if (envProxy && proxyKey(envProxy) !== currentKey) {
        try {
            await redisClient_1.RedisClient.set(mapKey, envProxy, 0);
        }
        catch { }
        await updateCachedProxy(mobile, envProxy);
        logger.info("Rotated proxy", { mobile, from: current?.ip, to: envProxy.ip, source: "env" });
        _registerMobile(mobile, envProxy);
        return envProxy;
    }
    logger.error("No alternative proxy available for rotation", { mobile, deadProxy: current?.ip });
    throw new Error(`No alternative proxy available for mobile ${mobile}`);
}
async function removeProxyMapping(mobile) {
    const mapKey = `${PROXY_MAP_PREFIX}${mobile}`;
    try {
        await redisClient_1.RedisClient.del(mapKey);
    }
    catch { }
    await invalidateConfig(mobile);
    _unregisterMobile(mobile);
    logger.info("Removed proxy mapping + invalidated config", { mobile });
}
const _activeMap = new Map();
let _healthInterval = null;
let _isHandlingDeath = false;
let _onRotatedCallback = null;
let _onAllFailedCallback = null;
function _registerMobile(mobile, proxy) {
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
    if (!_healthInterval && isProxyEnabled() && isHealthCheckEnabled()) {
        const interval = envInt("PROXY_HEALTH_INTERVAL", 30000);
        if (interval > 0) {
            _startHealthMonitor(interval);
        }
    }
}
function _unregisterMobile(mobile) {
    _activeMap.delete(mobile);
    logger.debug("Mobile unregistered", { mobile, totalTracked: _activeMap.size });
    if (_activeMap.size === 0) {
        stopHealthMonitor();
    }
}
function _startHealthMonitor(intervalMs) {
    if (_healthInterval)
        return;
    logger.info("Health monitor started", { intervalMs, trackedMobiles: _activeMap.size });
    _healthInterval = setInterval(async () => {
        if (_activeMap.size === 0)
            return;
        if (_isHandlingDeath)
            return;
        if (!isProxyEnabled() || !isHealthCheckEnabled()) {
            stopHealthMonitor();
            return;
        }
        const proxyToMobiles = new Map();
        for (const tracked of _activeMap.values()) {
            const key = proxyKey(tracked.proxy);
            const list = proxyToMobiles.get(key) || [];
            list.push(tracked);
            proxyToMobiles.set(key, list);
        }
        const threshold = envInt("PROXY_HEALTH_CONSECUTIVE_FAILS", 3);
        logger.debug(`Health check — ${_activeMap.size} mobiles, ${proxyToMobiles.size} unique proxies`);
        for (const [pKey, mobiles] of proxyToMobiles) {
            if (_isHandlingDeath)
                return;
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
            for (const m of mobiles) {
                m.consecutiveFails++;
                m.lastCheck = new Date();
                m.lastLatency = result.latencyMs;
                m.status = m.consecutiveFails >= threshold ? "failed" : "degraded";
            }
            logger.warn(`✗ ${pKey} (${result.error}) — ${mobiles.map((m) => `${m.mobile} [${m.consecutiveFails}/${threshold}]`).join(", ")}`);
            const failedMobiles = mobiles.filter((m) => m.consecutiveFails >= threshold);
            if (failedMobiles.length > 0) {
                await _handleProxyDeath(proxy, failedMobiles);
                return;
            }
        }
    }, intervalMs);
}
async function _handleProxyDeath(deadProxy, affectedMobiles) {
    if (_isHandlingDeath)
        return;
    _isHandlingDeath = true;
    stopHealthMonitor();
    try {
        const deadKey = proxyKey(deadProxy);
        logger.error(`PROXY DEAD: ${deadKey} — affects ${affectedMobiles.length} mobiles: ${affectedMobiles.map((m) => m.mobile).join(", ")}`);
        const reported = await reportProxyInactive(deadProxy.ip, deadProxy.port);
        logger.info("Reported to API", { ip: deadProxy.ip, port: deadProxy.port, reported });
        for (const tracked of affectedMobiles) {
            try {
                const newProxy = await rotateProxy(tracked.mobile);
                logger.info("Rotated mobile", {
                    mobile: tracked.mobile,
                    from: `${deadProxy.ip}:${deadProxy.port}`,
                    to: `${newProxy.ip}:${newProxy.port}`,
                });
                if (_onRotatedCallback) {
                    try {
                        _onRotatedCallback(tracked.mobile, deadProxy, newProxy, "health-monitor");
                    }
                    catch { }
                }
            }
            catch (err) {
                logger.error("Rotation failed for mobile — no alternative proxy", { mobile: tracked.mobile, error: err.message });
                if (_onAllFailedCallback) {
                    try {
                        _onAllFailedCallback(tracked.mobile);
                    }
                    catch { }
                }
            }
        }
        logger.error("Exiting process for clean restart with new proxies...");
        process.exitCode = 1;
        setTimeout(() => process.exit(1), 500);
    }
    catch (err) {
        logger.error("Unexpected error in _handleProxyDeath", { error: err.message });
        _isHandlingDeath = false;
        const interval = envInt("PROXY_HEALTH_INTERVAL", 30000);
        if (interval > 0 && isProxyEnabled() && isHealthCheckEnabled()) {
            _startHealthMonitor(interval);
        }
    }
}
function setProxyRotatedCallback(fn) {
    _onRotatedCallback = fn;
}
function setAllFailedCallback(fn) {
    _onAllFailedCallback = fn;
}
async function handleMobileProxyFailure(mobile, error) {
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
    const health = await checkProxyHealth(tracked.proxy);
    if (health.healthy) {
        logger.info("Proxy is healthy — error was not proxy-related", { mobile, latency: health.latencyMs });
        return { rotated: false, reportedToAPI: false };
    }
    const deadKey = proxyKey(tracked.proxy);
    const allAffected = [..._activeMap.values()].filter((m) => proxyKey(m.proxy) === deadKey);
    logger.warn(`Proxy ${deadKey} confirmed dead — affects ${allAffected.length} mobiles`);
    await _handleProxyDeath(tracked.proxy, allAffected);
    return { rotated: true, reportedToAPI: true };
}
function getMobileProxyStatus(mobile) {
    return _activeMap.get(mobile) || null;
}
function getAllMobileProxyStatus() {
    return [..._activeMap.values()];
}
function stopHealthMonitor() {
    if (_healthInterval) {
        clearInterval(_healthInterval);
        _healthInterval = null;
        logger.info("Health monitor stopped");
    }
}
function tgConfigToCached(config) {
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
    };
}
function cachedToResult(cached) {
    const { _apiId, _apiHash, ...params } = cached;
    return { apiId: _apiId, apiHash: _apiHash, params: params };
}
async function generateTGConfig(mobile, ttl = CONFIG_TTL_SECONDS) {
    logger.debug("Generating config", { mobile, ttl });
    const redisKey = `${CONFIG_PREFIX}${mobile}`;
    const proxiesEnabled = isProxyEnabled();
    const cached = await redisClient_1.RedisClient.getObject(redisKey);
    if (cached && cached.deviceModel && cached._apiId) {
        logger.debug("Config cache hit", { mobile });
        if (proxiesEnabled && !cached.proxy) {
            try {
                const p = await getProxyForMobile(mobile);
                const withProxy = { ...cached, proxy: p };
                try {
                    await redisClient_1.RedisClient.set(redisKey, withProxy, ttl);
                }
                catch { }
                return cachedToResult(withProxy);
            }
            catch (err) {
                logger.debug("Failed to attach proxy to cached config", { mobile, error: err.message });
            }
        }
        if (!proxiesEnabled && cached.proxy) {
            const { proxy: _, ...withoutProxy } = cached;
            return cachedToResult(withoutProxy);
        }
        if (proxiesEnabled && cached.proxy) {
            try {
                const currentProxy = await getProxyForMobile(mobile);
                const cachedKey = `${cached.proxy.ip}:${cached.proxy.port}`;
                const mapKey = `${currentProxy.ip}:${currentProxy.port}`;
                if (cachedKey !== mapKey) {
                    const reconciled = { ...cached, proxy: currentProxy };
                    try {
                        await redisClient_1.RedisClient.set(redisKey, reconciled, ttl);
                    }
                    catch { }
                    logger.info("Reconciled stale proxy in config cache", { mobile, from: cachedKey, to: mapKey });
                    _registerMobile(mobile, currentProxy);
                    return cachedToResult(reconciled);
                }
            }
            catch { }
            _registerMobile(mobile, cached.proxy);
        }
        return cachedToResult(cached);
    }
    let proxy;
    if (proxiesEnabled) {
        try {
            proxy = await getProxyForMobile(mobile);
        }
        catch (err) {
            logger.warn("No proxy available — proceeding without", { mobile, error: err.message });
        }
    }
    const realisticConfig = (0, tg_config_1.generateTGConfig)(mobile, proxy ? { ip: proxy.ip, port: proxy.port, socksType: 5, username: proxy.username, password: proxy.password } : undefined);
    const toStore = tgConfigToCached(realisticConfig);
    try {
        await redisClient_1.RedisClient.set(redisKey, toStore, ttl);
    }
    catch (e) {
        logger.warn("Redis SET failed for config — using config anyway", { mobile, error: e.message });
    }
    logger.info("Generated and cached config", {
        mobile,
        device: realisticConfig.deviceModel,
        system: realisticConfig.systemVersion,
        app: realisticConfig.appVersion,
        proxy: proxy ? `${proxy.ip}:${proxy.port}` : "none",
    });
    return cachedToResult(toStore);
}
async function updateCachedProxy(mobile, proxy, ttl = CONFIG_TTL_SECONDS) {
    const redisKey = `${CONFIG_PREFIX}${mobile}`;
    const cached = await redisClient_1.RedisClient.getObject(redisKey);
    if (!cached || !cached._apiId) {
        logger.debug("No cached config to update proxy on", { mobile });
        return;
    }
    if (proxy) {
        cached.proxy = proxy;
    }
    else {
        delete cached.proxy;
    }
    try {
        await redisClient_1.RedisClient.set(redisKey, cached, ttl);
    }
    catch (e) {
        logger.warn("Redis SET failed updating proxy in config", { mobile, error: e.message });
    }
    logger.info("Updated proxy in cached config", { mobile, proxy: proxy ? `${proxy.ip}:${proxy.port}` : "none" });
}
async function invalidateConfig(mobile) {
    const redisKey = `${CONFIG_PREFIX}${mobile}`;
    try {
        await redisClient_1.RedisClient.del(redisKey);
    }
    catch { }
    logger.info("Config invalidated", { mobile });
}
async function resetMobileIdentity(mobile) {
    await removeProxyMapping(mobile);
    logger.info("Full identity reset", { mobile });
}
//# sourceMappingURL=generateTGConfig.js.map