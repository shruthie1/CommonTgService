/* eslint-disable @typescript-eslint/no-require-imports */
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
  const responseEvents: Record<string, Function> = {};
  const reqEvents: Record<string, Function> = {};
  const mockRes = {
    statusCode,
    on: jest.fn((event: string, cb: Function) => { responseEvents[event] = cb; }),
  };
  const mockReq = {
    on: jest.fn((event: string, cb: Function) => { reqEvents[event] = cb; }),
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
  mockHttpRequest.mockImplementation((_url: any, _opts: any, cb: Function) => {
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
  type TGConfigResult,
} from "../../../../components/Telegram/utils/generateTGConfig";

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
    mockHttpRequest.mockImplementation((_url: any, _opts: any, cb: Function) => {
      const body = responses[callCount++] || PROXY_B;
      const resEvents: Record<string, Function> = {};
      cb({ statusCode: 200, on: (e: string, fn: Function) => { resEvents[e] = fn; } });
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
