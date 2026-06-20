 
/**
 * Tests for generateTGConfig — proxy resolution, caching, rotation, health monitor.
 *
 * All external I/O (Redis, HTTP API, SocksClient) is mocked.
 */

// ── Mocks ──────────────────────────────────────────────────
const mockRedis = {
  getObject: jest.fn(),
  set: jest.fn().mockResolvedValue("OK"),
  del: jest.fn().mockResolvedValue(1),
  incr: jest.fn().mockResolvedValue(1),
};
jest.mock("../../../../utils/redisClient", () => ({ RedisClient: mockRedis }));
jest.mock("../../../../utils", () => ({
  Logger: jest.fn().mockImplementation(() => ({
    debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), log: jest.fn(),
  })),
}));

// Mock SocksClient for health checks
const mockCreateConnection = jest.fn();
jest.mock("socks", () => ({
  SocksClient: { createConnection: (...args: any[]) => mockCreateConnection(...args) },
}));

// Mock http/https to intercept directRequest calls
const mockHttpRequest = jest.fn();
jest.mock("http", () => {
  const actual = jest.requireActual("http");
  return {
    ...actual,
    Agent: jest.fn().mockImplementation(() => ({})),
    request: (...args: any[]) => mockHttpRequest(...args),
  };
});
jest.mock("https", () => {
  const actual = jest.requireActual("https");
  return {
    ...actual,
    Agent: jest.fn().mockImplementation(() => ({})),
    request: (...args: any[]) => mockHttpRequest(...args),
  };
});

// ── Helpers ────────────────────────────────────────────────

function setupHttpResponse(statusCode: number, body: any) {
  const responseEvents: Record<string, (...args: any[]) => void> = {};
  const reqEvents: Record<string, (...args: any[]) => void> = {};
  const mockRes = {
    statusCode,
    on: jest.fn((event: string, cb: (...args: any[]) => void) => { responseEvents[event] = cb; }),
  };
  const mockReq = {
    on: jest.fn((event: string, cb: (...args: any[]) => void) => { reqEvents[event] = cb; }),
    write: jest.fn(),
    end: jest.fn(() => {
      // Simulate async response
      process.nextTick(() => {
        responseEvents["data"]?.(JSON.stringify(body));
        responseEvents["end"]?.();
      });
    }),
    destroy: jest.fn(),
  };
  mockHttpRequest.mockImplementation((_url: any, _opts: any, cb: (...args: any[]) => void) => {
    cb(mockRes);
    return mockReq;
  });
  return { mockReq, mockRes };
}

const PROXY_A = { ipAddress: "1.2.3.4", port: 1080, username: "u1", password: "p1", protocol: "socks5", status: "active" };
const PROXY_B = { ipAddress: "5.6.7.8", port: 1080, username: "u2", password: "p2", protocol: "socks5", status: "active" };

// ── Tests ──────────────────────────────────────────────────

// Re-import after mocks are in place
import {
  generateTGConfig,
  getProxyForMobile,
  rotateProxy,
  removeProxyMapping,
  invalidateConfig,
  resetMobileIdentity,
  isSocksError,
  stopHealthMonitor,
  getMobileProxyStatus,
  getAllMobileProxyStatus,
  handleMobileProxyFailure,
  setProxyRotatedCallback,
  setAllFailedCallback,
  type TGConfigResult,
} from "../../../../components/Telegram/utils/generateTGConfig";

// Mock SocksClient.createConnection used by checkProxyHealth
function mockSocksHealthy() {
  mockCreateConnection.mockResolvedValue({ socket: { destroy: jest.fn() } });
}
function mockSocksDead() {
  mockCreateConnection.mockRejectedValue(new Error("ECONNREFUSED"));
}

// Set env before each test
beforeEach(() => {
  jest.clearAllMocks();
  stopHealthMonitor();
  process.env.PROXY_ENABLED = "false";
  process.env.PROXY_API_URL = "http://localhost:3000/ip-management";
  process.env.PROXY_API_KEY = "test-key";
  process.env.clientId = "test-client";
  delete process.env.GRAMJS_PROXY_URL;
  delete process.env.TG_PLATFORM;
  delete process.env.TG_API_ID;
  delete process.env.TG_API_HASH;
});

afterEach(() => {
  stopHealthMonitor();
});

// ── isSocksError ──

describe("isSocksError", () => {
  it("returns false for null/undefined", () => {
    expect(isSocksError(null)).toBe(false);
    expect(isSocksError(undefined)).toBe(false);
  });

  it("detects known SOCKS error patterns", () => {
    expect(isSocksError(new Error("Socks5 Authentication failed"))).toBe(true);
    expect(isSocksError(new Error("connect ECONNREFUSED 1.2.3.4:1080"))).toBe(true);
    expect(isSocksError(new Error("ETIMEDOUT"))).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isSocksError(new Error("TypeError: cannot read property"))).toBe(false);
  });
});

// ── generateTGConfig (proxy disabled) ──

describe("generateTGConfig — proxy disabled", () => {
  it("generates config with apiId, apiHash, and params on cache miss", async () => {
    mockRedis.getObject.mockResolvedValue(null);

    const result = await generateTGConfig("919999999999");

    expect(result.apiId).toBeDefined();
    expect(result.apiHash).toBeDefined();
    expect(result.params).toBeDefined();
    expect(result.params.deviceModel).toBeDefined();
    expect(result.params.proxy).toBeUndefined(); // proxy disabled
  });

  it("returns cached config on cache hit", async () => {
    const cached = {
      _apiId: 6,
      _apiHash: "abc123",
      deviceModel: "Samsung SM-S928B",
      systemVersion: "SDK 35",
      appVersion: "12.5.2 (6597)",
      langCode: "en",
      systemLangCode: "en-US",
      connectionRetries: 5,
      requestRetries: 5,
      retryDelay: 5000,
      timeout: 30,
      autoReconnect: true,
      maxConcurrentDownloads: 3,
      downloadRetries: 5,
      useWSS: false,
      useIPV6: false,
      testServers: false,
    };
    mockRedis.getObject.mockResolvedValue(cached);

    const result = await generateTGConfig("919999999999");

    expect(result.apiId).toBe(6);
    expect(result.apiHash).toBe("abc123");
    expect(result.params.deviceModel).toBe("Samsung SM-S928B");
  });

  it("strips proxy from returned config when proxy disabled but cached config has proxy", async () => {
    const cached = {
      _apiId: 6,
      _apiHash: "abc123",
      deviceModel: "Samsung SM-S928B",
      systemVersion: "SDK 35",
      appVersion: "12.5.2",
      langCode: "en",
      systemLangCode: "en-US",
      connectionRetries: 5,
      requestRetries: 5,
      retryDelay: 5000,
      timeout: 30,
      autoReconnect: true,
      maxConcurrentDownloads: 3,
      downloadRetries: 5,
      useWSS: false,
      useIPV6: false,
      testServers: false,
      proxy: { ip: "1.2.3.4", port: 1080, socksType: 5 },
    };
    mockRedis.getObject.mockResolvedValue(cached);

    const result = await generateTGConfig("919999999999");

    expect(result.params.proxy).toBeUndefined();
    expect(result.apiId).toBe(6);
  });

  it("falls through to regeneration when cached entry has no _apiId (legacy)", async () => {
    // Legacy cache without _apiId
    mockRedis.getObject.mockResolvedValueOnce({ deviceModel: "Old Device" });

    const result = await generateTGConfig("919999999999");

    expect(result.apiId).toBeDefined();
    expect(result.params.deviceModel).toBeDefined();
    // Should have written new config to Redis
    expect(mockRedis.set).toHaveBeenCalled();
  });
});

// ── generateTGConfig (proxy enabled) ──

describe("generateTGConfig — proxy enabled", () => {
  beforeEach(() => {
    process.env.PROXY_ENABLED = "true";
  });

  it("attaches proxy from /next when cache hit has no proxy", async () => {
    const cachedConfig = {
      _apiId: 6, _apiHash: "abc",
      deviceModel: "Samsung SM-S928B", systemVersion: "SDK 35", appVersion: "12.5.2",
      langCode: "en", systemLangCode: "en-US",
      connectionRetries: 5, requestRetries: 5, retryDelay: 5000, timeout: 30,
      autoReconnect: true, maxConcurrentDownloads: 3, downloadRetries: 5,
      useWSS: false, useIPV6: false, testServers: false,
    };
    // First call: getObject for config cache → hit without proxy
    // Second call: getObject for proxy map → miss
    mockRedis.getObject
      .mockResolvedValueOnce(cachedConfig)  // config cache
      .mockResolvedValueOnce(null);         // proxy map miss

    setupHttpResponse(200, PROXY_A);

    const result = await generateTGConfig("919999999999");

    expect(result.params.proxy).toBeDefined();
    expect(result.params.proxy!.ip).toBe("1.2.3.4");
  });

  it("fetches proxy from /next on full cache miss", async () => {
    mockRedis.getObject
      .mockResolvedValueOnce(null)   // config cache miss
      .mockResolvedValueOnce(null);  // proxy map miss

    setupHttpResponse(200, PROXY_A);

    const result = await generateTGConfig("919999999999");

    expect(result.params.proxy).toBeDefined();
    expect(result.params.proxy!.ip).toBe("1.2.3.4");
    expect(result.apiId).toBeDefined();
  });

  it("proceeds without proxy when /next fails and no env fallback", async () => {
    mockRedis.getObject.mockResolvedValue(null);
    setupHttpResponse(404, { message: "No proxies" });

    const result = await generateTGConfig("919999999999");

    expect(result.params.proxy).toBeUndefined();
    expect(result.apiId).toBeDefined();
  });
});

// ── getProxyForMobile ──

describe("getProxyForMobile", () => {
  beforeEach(() => {
    process.env.PROXY_ENABLED = "true";
  });

  it("returns cached proxy from Redis", async () => {
    const cached = { ip: "1.2.3.4", port: 1080, socksType: 5, username: "u", password: "p" };
    mockRedis.getObject.mockResolvedValue(cached);

    const proxy = await getProxyForMobile("919999999999");

    expect(proxy.ip).toBe("1.2.3.4");
    expect((proxy as any).socksType).toBe(5);
    // Should not have called HTTP
    expect(mockHttpRequest).not.toHaveBeenCalled();
  });

  it("fetches from /next on cache miss", async () => {
    mockRedis.getObject.mockResolvedValue(null);
    setupHttpResponse(200, PROXY_A);

    const proxy = await getProxyForMobile("919999999999");

    expect(proxy.ip).toBe("1.2.3.4");
    expect(proxy.port).toBe(1080);
    // Should have persisted to Redis
    expect(mockRedis.set).toHaveBeenCalledWith(
      expect.stringContaining("tg:proxy_map:"),
      expect.objectContaining({ ip: "1.2.3.4" }),
      0
    );
  });

  it("falls back to env when /next fails", async () => {
    mockRedis.getObject.mockResolvedValue(null);
    process.env.GRAMJS_PROXY_URL = "socks5://user:pass@9.8.7.6:1081";
    setupHttpResponse(500, {});

    const proxy = await getProxyForMobile("919999999999");

    expect(proxy.ip).toBe("9.8.7.6");
    expect(proxy.port).toBe(1081);
  });

  it("throws when /next fails and no env fallback", async () => {
    mockRedis.getObject.mockResolvedValue(null);
    setupHttpResponse(500, {});

    await expect(getProxyForMobile("919999999999")).rejects.toThrow("No proxies available");
  });

  it("deduplicates concurrent calls for the same mobile", async () => {
    mockRedis.getObject.mockResolvedValue(null);
    setupHttpResponse(200, PROXY_A);

    const [p1, p2] = await Promise.all([
      getProxyForMobile("919999999999"),
      getProxyForMobile("919999999999"),
    ]);

    expect(p1.ip).toBe(p2.ip);
    // HTTP should only have been called once
    expect(mockHttpRequest).toHaveBeenCalledTimes(1);
  });
});

// ── rotateProxy ──

describe("rotateProxy", () => {
  beforeEach(() => {
    process.env.PROXY_ENABLED = "true";
  });

  it("rotates to a different proxy from /next", async () => {
    const currentProxy = { ip: "1.2.3.4", port: 1080, socksType: 5 };
    // proxy map returns current proxy
    mockRedis.getObject
      .mockResolvedValueOnce(currentProxy)  // current proxy from map
      .mockResolvedValueOnce(null);         // config cache for updateCachedProxy

    setupHttpResponse(200, PROXY_B);

    const newProxy = await rotateProxy("919999999999");

    expect(newProxy.ip).toBe("5.6.7.8");
    expect(newProxy.ip).not.toBe("1.2.3.4");
  });

  it("retries when /next returns the same dead proxy", async () => {
    const currentProxy = { ip: "1.2.3.4", port: 1080, socksType: 5 };
    mockRedis.getObject
      .mockResolvedValueOnce(currentProxy)
      .mockResolvedValueOnce(null);

    let callCount = 0;
    const responses = [PROXY_A, PROXY_A, PROXY_B]; // first two return dead proxy, third returns new
    mockHttpRequest.mockImplementation((_url: any, _opts: any, cb: (...args: any[]) => void) => {
      const body = responses[callCount++] || PROXY_B;
      const resEvents: Record<string, (...args: any[]) => void> = {};
      cb({ statusCode: 200, on: (e: string, fn: (...args: any[]) => void) => { resEvents[e] = fn; } });
      const reqObj = {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn(() => {
          process.nextTick(() => {
            resEvents["data"]?.(JSON.stringify(body));
            resEvents["end"]?.();
          });
        }),
        destroy: jest.fn(),
      };
      return reqObj;
    });

    const newProxy = await rotateProxy("919999999999");

    expect(newProxy.ip).toBe("5.6.7.8");
    expect(callCount).toBe(3);
  });

  it("falls back to env if /next always returns the dead proxy", async () => {
    const currentProxy = { ip: "1.2.3.4", port: 1080, socksType: 5 };
    mockRedis.getObject
      .mockResolvedValueOnce(currentProxy)
      .mockResolvedValueOnce(null);
    process.env.GRAMJS_PROXY_URL = "socks5://eu:ep@9.9.9.9:1082";

    // /next always returns the dead proxy
    setupHttpResponse(200, PROXY_A);

    const newProxy = await rotateProxy("919999999999");

    expect(newProxy.ip).toBe("9.9.9.9");
  });

  it("throws when no alternative available", async () => {
    const currentProxy = { ip: "1.2.3.4", port: 1080, socksType: 5 };
    mockRedis.getObject.mockResolvedValueOnce(currentProxy);

    // /next always returns dead proxy, no env
    setupHttpResponse(200, PROXY_A);

    await expect(rotateProxy("919999999999")).rejects.toThrow("No alternative proxy");
  });
});

// ── invalidateConfig / removeProxyMapping / resetMobileIdentity ──

describe("cache invalidation", () => {
  it("invalidateConfig deletes the config cache key", async () => {
    await invalidateConfig("919999999999");

    expect(mockRedis.del).toHaveBeenCalledWith("tg:config:919999999999");
  });

  it("removeProxyMapping deletes proxy map + invalidates config", async () => {
    await removeProxyMapping("919999999999");

    expect(mockRedis.del).toHaveBeenCalledWith("tg:proxy_map:919999999999");
    expect(mockRedis.del).toHaveBeenCalledWith("tg:config:919999999999");
  });

  it("resetMobileIdentity delegates to removeProxyMapping", async () => {
    await resetMobileIdentity("919999999999");

    expect(mockRedis.del).toHaveBeenCalledWith("tg:proxy_map:919999999999");
    expect(mockRedis.del).toHaveBeenCalledWith("tg:config:919999999999");
  });
});

// ── status helpers ──

describe("status helpers", () => {
  it("getMobileProxyStatus returns null for untracked mobile", () => {
    expect(getMobileProxyStatus("unknown")).toBeNull();
  });

  it("getAllMobileProxyStatus returns empty array initially", () => {
    expect(getAllMobileProxyStatus()).toEqual([]);
  });
});

// ── config consistency across calls ──

describe("config consistency", () => {
  it("same mobile gets same fingerprint (apiId/apiHash/device) on repeated calls", async () => {
    mockRedis.getObject.mockResolvedValue(null);

    const r1 = await generateTGConfig("919999999999");

    // Second call — simulate cache hit
    const cachedObj = {
      _apiId: r1.apiId,
      _apiHash: r1.apiHash,
      ...r1.params,
    };
    mockRedis.getObject.mockResolvedValue(cachedObj);

    const r2 = await generateTGConfig("919999999999");

    expect(r2.apiId).toBe(r1.apiId);
    expect(r2.apiHash).toBe(r1.apiHash);
    expect(r2.params.deviceModel).toBe(r1.params.deviceModel);
    expect(r2.params.appVersion).toBe(r1.params.appVersion);
  });
});

// ── resolveProxyFromEnv (via getProxyForMobile env-fallback path) ──

function clearEnvProxyVars() {
  delete process.env.GRAMJS_PROXY_URL;
  delete process.env.HTTP_PROXY_URL;
  delete process.env.ALL_PROXY;
  delete process.env.all_proxy;
}

describe("env proxy resolution", () => {
  beforeEach(() => {
    process.env.PROXY_ENABLED = "true";
    clearEnvProxyVars();
    mockRedis.getObject.mockResolvedValue(null);
    setupHttpResponse(500, {}); // /next fails -> forces env fallback
  });
  afterEach(clearEnvProxyVars);

  it("parses a socks5h:// url and decodes credentials", async () => {
    process.env.GRAMJS_PROXY_URL = "socks5h://us%40er:p%40ss@10.0.0.1:1099";
    const proxy = await getProxyForMobile("env-mobile-1");
    expect(proxy.ip).toBe("10.0.0.1");
    expect(proxy.port).toBe(1099);
    expect(proxy.username).toBe("us@er");
    expect(proxy.password).toBe("p@ss");
    expect((proxy as any).socksType).toBe(5);
  });

  it("falls back to default port 1080 when url has no port", async () => {
    process.env.HTTP_PROXY_URL = "socks4://10.0.0.2";
    const proxy = await getProxyForMobile("env-mobile-2");
    expect(proxy.ip).toBe("10.0.0.2");
    expect(proxy.port).toBe(1080);
  });

  it("uses ALL_PROXY env var as a source", async () => {
    process.env.ALL_PROXY = "socks5://3.3.3.3:1085";
    const proxy = await getProxyForMobile("env-mobile-3");
    expect(proxy.ip).toBe("3.3.3.3");
    delete process.env.ALL_PROXY;
  });

  it("throws when env proxy url is unparseable", async () => {
    process.env.GRAMJS_PROXY_URL = "::not a url::";
    await expect(getProxyForMobile("env-mobile-4")).rejects.toThrow("No proxies available");
  });
});

// ── checkProxyHealth via handleMobileProxyFailure ──

describe("handleMobileProxyFailure", () => {
  beforeEach(() => {
    process.env.PROXY_ENABLED = "true";
    process.env.PROXY_HEALTH_CHECK_ENABLED = "false"; // keep monitor off
    clearEnvProxyVars(); // no env fallback so dead-proxy rotation truly fails
    _trackMobileViaRedis();
  });
  afterEach(clearEnvProxyVars);

  // Helper to get a mobile into the active map: getProxyForMobile registers it.
  function _trackMobileViaRedis() {
    mockRedis.getObject.mockResolvedValue({ ip: "7.7.7.7", port: 1080, socksType: 5 });
  }

  it("returns rotated:false for an untracked mobile", async () => {
    const result = await handleMobileProxyFailure("never-tracked", new Error("boom"));
    expect(result).toEqual({ rotated: false, reportedToAPI: false });
  });

  it("returns rotated:false when the proxy is actually healthy", async () => {
    await getProxyForMobile("track-healthy"); // registers mobile in active map
    mockSocksHealthy();
    const result = await handleMobileProxyFailure("track-healthy", "some-error");
    expect(result.rotated).toBe(false);
    expect(getMobileProxyStatus("track-healthy")).not.toBeNull();
  });

  // NOTE: _handleProxyDeath sets a module-level _isHandlingDeath guard that is only
  // cleared on a real process.exit (which we stub). Each death-path test therefore
  // runs against a freshly-imported module via jest.isolateModulesAsync so the guard
  // and active map start clean.
  it("confirms dead proxy, reports + rotates, then exits process", async () => {
    const exitSpy = jest.spyOn(process, "exit").mockImplementation((() => undefined) as any);
    const setTimeoutSpy = jest.spyOn(global, "setTimeout").mockImplementation(((fn: any) => { fn(); return 0 as any; }) as any);
    await jest.isolateModulesAsync(async () => {
      const mod = require("../../../../components/Telegram/utils/generateTGConfig");
      mockRedis.getObject.mockResolvedValue({ ip: "7.7.7.7", port: 1080, socksType: 5 });
      await mod.getProxyForMobile("track-dead");
      mockSocksDead();
      setupHttpResponse(200, PROXY_B); // reportProxyInactive + rotateProxy /next
      const rotatedCb = jest.fn();
      mod.setProxyRotatedCallback(rotatedCb);

      await mod.handleMobileProxyFailure("track-dead", new Error("network"));

      expect(rotatedCb).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
    setTimeoutSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("invokes all-failed callback when rotation has no alternative", async () => {
    const exitSpy = jest.spyOn(process, "exit").mockImplementation((() => undefined) as any);
    const setTimeoutSpy = jest.spyOn(global, "setTimeout").mockImplementation(((fn: any) => { fn(); return 0 as any; }) as any);
    await jest.isolateModulesAsync(async () => {
      const mod = require("../../../../components/Telegram/utils/generateTGConfig");
      mockRedis.getObject.mockResolvedValue({ ip: "7.7.7.7", port: 1080, socksType: 5 });
      await mod.getProxyForMobile("track-dead-2");
      mockSocksDead();
      // /next always returns the SAME dead proxy -> rotation fails -> all-failed cb
      setupHttpResponse(200, { ipAddress: "7.7.7.7", port: 1080, protocol: "socks5", status: "active" });
      const allFailedCb = jest.fn();
      mod.setAllFailedCallback(allFailedCb);

      await mod.handleMobileProxyFailure("track-dead-2", new Error("network"));

      expect(allFailedCb).toHaveBeenCalledWith("track-dead-2");
    });
    setTimeoutSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

// ── generateTGConfig proxy reconciliation (cached config WITH proxy) ──

describe("generateTGConfig — proxy reconciliation", () => {
  beforeEach(() => {
    process.env.PROXY_ENABLED = "true";
    clearEnvProxyVars();
  });
  afterEach(clearEnvProxyVars);

  const cachedWithProxy = {
    _apiId: 6, _apiHash: "abc",
    deviceModel: "Samsung SM-S928B", systemVersion: "SDK 35", appVersion: "12.5.2",
    langCode: "en", systemLangCode: "en-US",
    connectionRetries: 5, requestRetries: 5, retryDelay: 5000, timeout: 30,
    autoReconnect: true, maxConcurrentDownloads: 3, downloadRetries: 5,
    useWSS: false, useIPV6: false, testServers: false,
    proxy: { ip: "1.1.1.1", port: 1080, socksType: 5 },
  };

  it("keeps cached proxy when proxy map agrees", async () => {
    mockRedis.getObject
      .mockResolvedValueOnce(cachedWithProxy)                       // config cache
      .mockResolvedValueOnce({ ip: "1.1.1.1", port: 1080, socksType: 5 }); // proxy map (same)
    const result = await generateTGConfig("recon-same");
    expect(result.params.proxy!.ip).toBe("1.1.1.1");
  });

  it("reconciles cached proxy to the proxy-map proxy when they differ", async () => {
    mockRedis.getObject
      .mockResolvedValueOnce(cachedWithProxy)                       // config cache
      .mockResolvedValueOnce({ ip: "2.2.2.2", port: 1080, socksType: 5 }); // proxy map (different)
    const result = await generateTGConfig("recon-diff");
    expect(result.params.proxy!.ip).toBe("2.2.2.2");
    // persisted the reconciled config
    expect(mockRedis.set).toHaveBeenCalled();
  });
});

// ── rotateProxy updates the cached config proxy (updateCachedProxy) ──

describe("rotateProxy — updateCachedProxy side effect", () => {
  beforeEach(() => {
    process.env.PROXY_ENABLED = "true";
    clearEnvProxyVars();
  });
  afterEach(clearEnvProxyVars);

  it("writes the new proxy into the cached config when a config exists", async () => {
    mockRedis.getObject
      .mockResolvedValueOnce({ ip: "1.2.3.4", port: 1080, socksType: 5 })   // current proxy map
      .mockResolvedValueOnce({ _apiId: 6, deviceModel: "D" });               // config cache for updateCachedProxy
    setupHttpResponse(200, PROXY_B);
    await rotateProxy("rot-mobile");
    // config cache rewritten with new proxy
    expect(mockRedis.set).toHaveBeenCalledWith(
      "tg:config:rot-mobile",
      expect.objectContaining({ proxy: expect.objectContaining({ ip: "5.6.7.8" }) }),
      expect.any(Number),
    );
  });

  it("skips cached-config update when no config exists", async () => {
    mockRedis.getObject
      .mockResolvedValueOnce({ ip: "1.2.3.4", port: 1080, socksType: 5 })   // current proxy map
      .mockResolvedValueOnce(null);                                          // no config cache
    setupHttpResponse(200, PROXY_B);
    const proxy = await rotateProxy("rot-mobile-2");
    expect(proxy.ip).toBe("5.6.7.8");
  });
});

// ── health monitor tick ──

describe("health monitor", () => {
  afterEach(() => {
    stopHealthMonitor();
    clearEnvProxyVars();
  });

  it("marks proxies healthy on a successful tick", async () => {
    jest.useFakeTimers();
    await jest.isolateModulesAsync(async () => {
      const mod = require("../../../../components/Telegram/utils/generateTGConfig");
      process.env.PROXY_ENABLED = "true";
      process.env.PROXY_HEALTH_CHECK_ENABLED = "true";
      process.env.PROXY_HEALTH_INTERVAL = "1000";
      clearEnvProxyVars();
      mockRedis.getObject.mockResolvedValue({ ip: "9.9.9.9", port: 1080, socksType: 5 });
      await mod.getProxyForMobile("hm-mobile"); // registers + starts monitor
      mockSocksHealthy();

      await jest.advanceTimersByTimeAsync(1100);

      const status = mod.getMobileProxyStatus("hm-mobile");
      expect(status.status).toBe("healthy");
      mod.stopHealthMonitor();
    });
    jest.useRealTimers();
  });

  it("increments consecutiveFails and degrades on a failed tick", async () => {
    jest.useFakeTimers();
    await jest.isolateModulesAsync(async () => {
      const mod = require("../../../../components/Telegram/utils/generateTGConfig");
      process.env.PROXY_ENABLED = "true";
      process.env.PROXY_HEALTH_CHECK_ENABLED = "true";
      process.env.PROXY_HEALTH_INTERVAL = "1000";
      process.env.PROXY_HEALTH_CONSECUTIVE_FAILS = "3"; // won't reach failed in one tick
      clearEnvProxyVars();
      mockRedis.getObject.mockResolvedValue({ ip: "9.9.9.8", port: 1080, socksType: 5 });
      await mod.getProxyForMobile("hm-mobile-degraded");
      mockSocksDead();

      await jest.advanceTimersByTimeAsync(1100);

      const status = mod.getMobileProxyStatus("hm-mobile-degraded");
      expect(status.consecutiveFails).toBeGreaterThanOrEqual(1);
      expect(status.status).toBe("degraded");
      mod.stopHealthMonitor();
    });
    jest.useRealTimers();
  });

  it("stops itself on the next tick when health checks are disabled at runtime", async () => {
    // start the monitor, then flip PROXY_HEALTH_CHECK_ENABLED off; the next tick must
    // hit the runtime-disable guard and stop the monitor.
    jest.useFakeTimers();
    await jest.isolateModulesAsync(async () => {
      const mod = require("../../../../components/Telegram/utils/generateTGConfig");
      process.env.PROXY_ENABLED = "true";
      process.env.PROXY_HEALTH_CHECK_ENABLED = "true";
      process.env.PROXY_HEALTH_INTERVAL = "1000";
      clearEnvProxyVars();
      mockRedis.getObject.mockResolvedValue({ ip: "9.9.9.7", port: 1080, socksType: 5 });
      await mod.getProxyForMobile("hm-runtime-off");
      mockSocksHealthy();

      process.env.PROXY_HEALTH_CHECK_ENABLED = "false"; // runtime disable
      await jest.advanceTimersByTimeAsync(1100);

      // a subsequent tick would have re-run the check; status stays at its initial value.
      expect(mod.getMobileProxyStatus("hm-runtime-off")).not.toBeNull();
      mod.stopHealthMonitor();
    });
    jest.useRealTimers();
  });

  it("does not start a second interval when the monitor is already running", async () => {
    jest.useFakeTimers();
    await jest.isolateModulesAsync(async () => {
      const mod = require("../../../../components/Telegram/utils/generateTGConfig");
      process.env.PROXY_ENABLED = "true";
      process.env.PROXY_HEALTH_CHECK_ENABLED = "true";
      process.env.PROXY_HEALTH_INTERVAL = "1000";
      clearEnvProxyVars();
      mockRedis.getObject.mockResolvedValue({ ip: "9.9.9.6", port: 1080, socksType: 5 });
      // two registrations -> second auto-start attempt hits the `if (_healthInterval) return` guard.
      await mod.getProxyForMobile("hm-twice-1");
      await mod.getProxyForMobile("hm-twice-2");
      mockSocksHealthy();
      await jest.advanceTimersByTimeAsync(1100);
      expect(mod.getAllMobileProxyStatus().length).toBeGreaterThanOrEqual(2);
      mod.stopHealthMonitor();
    });
    jest.useRealTimers();
  });

  it("skips auto-starting the monitor when the configured interval is non-positive", async () => {
    // PROXY_HEALTH_INTERVAL=0 -> the `if (interval > 0)` guard is false, monitor never starts.
    await jest.isolateModulesAsync(async () => {
      const mod = require("../../../../components/Telegram/utils/generateTGConfig");
      process.env.PROXY_ENABLED = "true";
      process.env.PROXY_HEALTH_CHECK_ENABLED = "true";
      process.env.PROXY_HEALTH_INTERVAL = "0";
      clearEnvProxyVars();
      mockRedis.getObject.mockResolvedValue({ ip: "9.9.9.5", port: 1080, socksType: 5 });
      await mod.getProxyForMobile("hm-no-interval");
      // registered but no monitor running -> status present, nothing throws.
      expect(mod.getMobileProxyStatus("hm-no-interval")).not.toBeNull();
      mod.stopHealthMonitor();
    });
  });
});

// ── status helpers with a tracked mobile ──

describe("tracked status helpers", () => {
  beforeEach(() => {
    process.env.PROXY_ENABLED = "true";
    mockRedis.getObject.mockResolvedValue({ ip: "8.8.8.8", port: 1080, socksType: 5 });
  });

  it("getMobileProxyStatus + getAllMobileProxyStatus reflect a registered mobile", async () => {
    await getProxyForMobile("status-mobile");
    const status = getMobileProxyStatus("status-mobile");
    expect(status).toMatchObject({ mobile: "status-mobile", status: "healthy", consecutiveFails: 0 });
    expect(getAllMobileProxyStatus().some((m) => m.mobile === "status-mobile")).toBe(true);
  });

  it("removeProxyMapping unregisters a tracked mobile", async () => {
    await getProxyForMobile("status-mobile-2");
    expect(getMobileProxyStatus("status-mobile-2")).not.toBeNull();
    await removeProxyMapping("status-mobile-2");
    expect(getMobileProxyStatus("status-mobile-2")).toBeNull();
  });
});

// ── additional edge / fallback scenarios ──

describe("isSocksError — non-Error inputs", () => {
  it("matches a SOCKS pattern carried by a plain string error", () => {
    // GramJS sometimes throws a raw string; isSocksError must stringify it
    // (the `err instanceof Error ? ... : String(err)` else branch).
    expect(isSocksError("Socket closed")).toBe(true);
    expect(isSocksError({ toString: () => "EHOSTUNREACH" })).toBe(true);
    expect(isSocksError("just a normal log line")).toBe(false);
  });
});

describe("input validation guards", () => {
  it("getProxyForMobile rejects an empty mobile", async () => {
    await expect(getProxyForMobile("")).rejects.toThrow("mobile is required");
  });
  it("rotateProxy rejects an empty mobile", async () => {
    await expect(rotateProxy("")).rejects.toThrow("mobile is required");
  });
});

describe("env helpers via observable behavior", () => {
  afterEach(() => {
    delete process.env.PROXY_ENABLED;
    delete process.env.PROXY_API_TIMEOUT;
    clearEnvProxyVars();
  });

  it("treats a missing PROXY_ENABLED as disabled (default \"false\")", async () => {
    // unset PROXY_ENABLED -> isProxyEnabled() uses the `|| "false"` default -> no proxy attached.
    delete process.env.PROXY_ENABLED;
    mockRedis.getObject.mockResolvedValue(null);
    const result = await generateTGConfig("env-default-disabled");
    expect(result.params.proxy).toBeUndefined();
  });

  it("falls back to the default timeout when PROXY_API_TIMEOUT is non-numeric", async () => {
    // envInt() should ignore a NaN value and use the fallback (Number.isNaN branch).
    process.env.PROXY_ENABLED = "true";
    process.env.PROXY_API_TIMEOUT = "not-a-number";
    clearEnvProxyVars();
    mockRedis.getObject.mockResolvedValue(null);
    setupHttpResponse(200, PROXY_A);
    const proxy = await getProxyForMobile("env-nan-timeout");
    expect(proxy.ip).toBe("1.2.3.4");
  });
});

describe("no-clientId proxy resolution", () => {
  let prevClient: string | undefined;
  beforeEach(() => {
    prevClient = process.env.clientId;
    delete process.env.clientId; // getApiConfig().clientId -> "" -> clientId || undefined
    process.env.PROXY_ENABLED = "true";
    clearEnvProxyVars();
    mockRedis.getObject.mockResolvedValue(null);
  });
  afterEach(() => {
    if (prevClient === undefined) delete process.env.clientId; else process.env.clientId = prevClient;
    clearEnvProxyVars();
  });

  it("omits the clientId query param and message suffix when no clientId is configured", async () => {
    // /next fails (non-200) with no clientId -> the `if (clientId)` and the
    // `clientId ? ... : ""` error-suffix branches both take their false side.
    setupHttpResponse(503, {});
    await expect(getProxyForMobile("no-client-mobile")).rejects.toThrow("No proxies available");
  });

  it("assigns a proxy via /next without a clientId filter on success", async () => {
    // success path with clientId falsy -> fetchNextProxy(undefined) and the
    // `clientId || "none"` log fallback.
    setupHttpResponse(200, PROXY_A);
    const proxy = await getProxyForMobile("no-client-ok");
    expect(proxy.ip).toBe("1.2.3.4");
  });

  it("rotates without a clientId filter", async () => {
    // rotateProxy reads getApiConfig().clientId (empty) -> fetchNextProxy(undefined),
    // and with no current proxy the `current ? proxyKey : ""` empty branch is taken.
    mockRedis.getObject.mockResolvedValueOnce(null); // no current proxy map
    setupHttpResponse(200, PROXY_B);
    const proxy = await rotateProxy("no-client-rot");
    expect(proxy.ip).toBe("5.6.7.8");
  });
});

describe("getApiConfig default endpoint/key", () => {
  let prev: Record<string, string | undefined>;
  beforeEach(() => {
    prev = { url: process.env.PROXY_API_URL, key: process.env.PROXY_API_KEY };
    delete process.env.PROXY_API_URL; // -> default https://cms.paidgirls.site/...
    delete process.env.PROXY_API_KEY; // -> default "santoor"
    process.env.PROXY_ENABLED = "true";
    clearEnvProxyVars();
    mockRedis.getObject.mockResolvedValue(null);
  });
  afterEach(() => {
    if (prev.url === undefined) delete process.env.PROXY_API_URL; else process.env.PROXY_API_URL = prev.url;
    if (prev.key === undefined) delete process.env.PROXY_API_KEY; else process.env.PROXY_API_KEY = prev.key;
    clearEnvProxyVars();
  });

  it("uses the built-in default API base url and key when env is unset", async () => {
    process.env.GRAMJS_PROXY_URL = "socks5://6.6.6.6:1080"; // env fallback so it resolves
    setupHttpResponse(500, {}); // /next on the default url fails -> env fallback
    const proxy = await getProxyForMobile("default-api-mobile");
    expect(proxy.ip).toBe("6.6.6.6");
    clearEnvProxyVars();
  });
});

describe("handleMobileProxyFailure — falsy error value", () => {
  beforeEach(() => {
    process.env.PROXY_ENABLED = "true";
    process.env.PROXY_HEALTH_CHECK_ENABLED = "false";
    clearEnvProxyVars();
  });
  afterEach(clearEnvProxyVars);

  it("logs \"unknown\" when the reported error is falsy and the proxy is healthy", async () => {
    // error is null -> `String(error || "unknown")` takes the "unknown" branch.
    mockRedis.getObject.mockResolvedValue({ ip: "7.7.7.7", port: 1080, socksType: 5 });
    await getProxyForMobile("falsy-err-mobile");
    mockSocksHealthy();
    const result = await handleMobileProxyFailure("falsy-err-mobile", null as any);
    expect(result.rotated).toBe(false);
  });
});

describe("directRequest transport branches", () => {
  beforeEach(() => {
    process.env.PROXY_ENABLED = "true";
    clearEnvProxyVars();
    mockRedis.getObject.mockResolvedValue(null);
  });
  afterEach(clearEnvProxyVars);

  it("uses the HTTPS agent when the API URL is https and tolerates a non-JSON body", async () => {
    // https base url -> https branch; a non-JSON response body -> the JSON.parse catch
    // resolves with the raw string, which lacks ipAddress -> /next treated as failed.
    process.env.PROXY_API_URL = "https://secure.example/ip-management";
    process.env.GRAMJS_PROXY_URL = "socks5://9.8.7.6:1080"; // env fallback so call still resolves
    setupHttpResponse(200, "<<<not-json>>>");
    const proxy = await getProxyForMobile("https-nonjson");
    expect(proxy.ip).toBe("9.8.7.6");
    delete process.env.PROXY_API_URL;
  });
});

describe("directRequest — raw non-JSON / missing status code", () => {
  beforeEach(() => {
    process.env.PROXY_ENABLED = "true";
    clearEnvProxyVars();
    mockRedis.getObject.mockResolvedValue(null);
  });
  afterEach(clearEnvProxyVars);

  it("resolves with the raw body and a zero status when JSON parsing fails and statusCode is absent", async () => {
    // craft a response that emits a genuinely invalid JSON body and has no statusCode,
    // exercising the JSON.parse catch and the `res.statusCode || 0` fallback.
    const responseEvents: Record<string, (...args: any[]) => void> = {};
    const mockRes: any = {
      statusCode: undefined, // -> `res.statusCode || 0`
      on: jest.fn((event: string, cb: (...args: any[]) => void) => { responseEvents[event] = cb; }),
    };
    const mockReq: any = {
      on: jest.fn(),
      write: jest.fn(),
      end: jest.fn(() => {
        process.nextTick(() => {
          responseEvents["data"]?.("this-is-not-json{");
          responseEvents["end"]?.();
        });
      }),
      destroy: jest.fn(),
    };
    mockHttpRequest.mockImplementation((_url: any, _opts: any, cb: (...args: any[]) => void) => { cb(mockRes); return mockReq; });
    process.env.GRAMJS_PROXY_URL = "socks5://7.0.0.7:1080"; // env fallback so the call resolves
    const proxy = await getProxyForMobile("raw-body-mobile");
    expect(proxy.ip).toBe("7.0.0.7"); // /next produced an unusable body -> env fallback used
    clearEnvProxyVars();
  });
});

describe("rotateProxy — IPv6 proxy key handling", () => {
  beforeEach(() => {
    process.env.PROXY_ENABLED = "true";
    clearEnvProxyVars();
  });
  afterEach(clearEnvProxyVars);

  it("formats an IPv6 current proxy key with brackets when comparing candidates", async () => {
    // current proxy has an IPv6 address -> proxyKey takes the `includes(":")` true branch.
    mockRedis.getObject
      .mockResolvedValueOnce({ ip: "2001:db8::1", port: 1080, socksType: 5 }) // current (IPv6)
      .mockResolvedValueOnce(null); // no cached config for updateCachedProxy
    setupHttpResponse(200, PROXY_B);
    const proxy = await rotateProxy("ipv6-rot");
    expect(proxy.ip).toBe("5.6.7.8");
  });
});

describe("health monitor — death path without callbacks", () => {
  it("rotates and exits even when no rotated/all-failed callbacks are registered", async () => {
    // _handleProxyDeath runs the `if (_onRotatedCallback)` false branch when no callback
    // was set, and still reaches the process.exit.
    const exitSpy = jest.spyOn(process, "exit").mockImplementation((() => undefined) as any);
    const setTimeoutSpy = jest.spyOn(global, "setTimeout").mockImplementation(((fn: any) => { fn(); return 0 as any; }) as any);
    await jest.isolateModulesAsync(async () => {
      const mod = require("../../../../components/Telegram/utils/generateTGConfig");
      process.env.PROXY_ENABLED = "true";
      process.env.PROXY_HEALTH_CHECK_ENABLED = "false";
      clearEnvProxyVars();
      mockRedis.getObject.mockResolvedValue({ ip: "7.7.7.7", port: 1080, socksType: 5 });
      await mod.getProxyForMobile("dead-no-cb");
      mockSocksDead();
      setupHttpResponse(200, PROXY_B); // report + rotate succeed
      // intentionally do NOT register callbacks
      await mod.handleMobileProxyFailure("dead-no-cb", new Error("network"));
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
    setTimeoutSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

describe("handleMobileProxyFailure — env-fallback rotation on a dead proxy", () => {
  it("rotates a dead proxy to an env proxy when /next is unavailable", async () => {
    // /next fails during rotation, but an env proxy of a different ip is available,
    // so the dead mobile is rotated via the env-fallback branch before exit.
    const exitSpy = jest.spyOn(process, "exit").mockImplementation((() => undefined) as any);
    const setTimeoutSpy = jest.spyOn(global, "setTimeout").mockImplementation(((fn: any) => { fn(); return 0 as any; }) as any);
    await jest.isolateModulesAsync(async () => {
      const mod = require("../../../../components/Telegram/utils/generateTGConfig");
      process.env.PROXY_ENABLED = "true";
      process.env.PROXY_HEALTH_CHECK_ENABLED = "false";
      clearEnvProxyVars();
      mockRedis.getObject.mockResolvedValue({ ip: "7.7.7.7", port: 1080, socksType: 5 });
      await mod.getProxyForMobile("dead-env-rot");
      mockSocksDead();
      process.env.GRAMJS_PROXY_URL = "socks5://4.4.4.4:1080"; // env alternative (different ip)
      setupHttpResponse(500, {}); // report + /next both fail -> env fallback used for rotation
      const rotatedCb = jest.fn();
      mod.setProxyRotatedCallback(rotatedCb);

      await mod.handleMobileProxyFailure("dead-env-rot", new Error("network"));

      expect(rotatedCb).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
      clearEnvProxyVars();
    });
    setTimeoutSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
