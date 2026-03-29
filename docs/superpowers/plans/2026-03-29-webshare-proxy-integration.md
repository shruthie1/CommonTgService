# Webshare Proxy Integration & IP Management Enhancement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a pluggable Webshare proxy module that syncs proxies into the existing IP pool, enhance the ip-management module with round-robin `getNextIp`, and make client assignment optional while maintaining backward compatibility.

**Architecture:** Two separate NestJS modules — `WebshareProxyModule` (new, owns Webshare API integration, sync, replacement) and enhanced `IpManagementModule` (upgraded schema, round-robin serving, client-agnostic pool). Webshare module injects `IpManagementService` to push synced proxies. The existing HTTP-based consumption from `generateTGConfig.ts` stays unchanged — new endpoints are added to the controller.

**Tech Stack:** NestJS 11, Mongoose 9, axios (already installed), ioredis (via existing `RedisClient`), class-validator, class-transformer, Swagger/OpenAPI decorators.

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/components/webshare-proxy/webshare-proxy.module.ts` | NestJS module registration |
| `src/components/webshare-proxy/webshare-proxy.service.ts` | Webshare API client — fetch, sync, replace, refresh |
| `src/components/webshare-proxy/webshare-proxy.controller.ts` | HTTP endpoints for manual sync/status/replace triggers |
| `src/components/webshare-proxy/dto/sync-proxies.dto.ts` | DTOs for sync request/response |
| `src/components/webshare-proxy/dto/replace-proxy.dto.ts` | DTOs for proxy replacement |
| `src/components/webshare-proxy/dto/webshare-config.dto.ts` | DTO for runtime config updates |
| `src/components/webshare-proxy/interfaces/webshare-types.ts` | TypeScript interfaces matching Webshare API responses |
| `src/components/webshare-proxy/index.ts` | Barrel exports |
| `src/components/ip-management/dto/get-next-ip.dto.ts` | DTO for round-robin request with optional filters |

### Modified Files

| File | Changes |
|------|---------|
| `src/components/ip-management/schemas/proxy-ip.schema.ts` | Add fields: `source`, `webshareId`, `countryCode`, `cityName`, `lastVerified`, `lastUsed`, `consecutiveFails`, `roundRobinIndex` |
| `src/components/ip-management/ip-management.service.ts` | Add `getNextIp()` round-robin, `syncFromExternal()`, `markLastUsed()`, `resetConsecutiveFails()`, `incrementConsecutiveFails()` |
| `src/components/ip-management/ip-management.controller.ts` | Add `GET /proxy-ips/next` endpoint, enable search endpoint |
| `src/components/ip-management/ip-management.module.ts` | No changes needed (already exports service) |
| `src/components/ip-management/dto/create-proxy-ip.dto.ts` | Add new optional fields matching schema additions |
| `src/components/ip-management/dto/update-proxy-ip.dto.ts` | No changes (already PartialType) |
| `src/components/ip-management/index.ts` | Export new DTO |
| `src/app.module.ts` | Import `WebshareProxyModule` |
| `src/components/index.ts` | Export webshare-proxy barrel |

---

## Task 1: Enhance ProxyIp Schema with New Fields

**Files:**
- Modify: `src/components/ip-management/schemas/proxy-ip.schema.ts`

- [ ] **Step 1: Add new fields to the ProxyIp schema**

Open `src/components/ip-management/schemas/proxy-ip.schema.ts` and add the new fields after the existing `assignedToClient` field. The full updated class:

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Document } from 'mongoose';

export type ProxyIpDocument = ProxyIp & Document;

@Schema({
    collection: 'proxy_ips',
    versionKey: false,
    autoIndex: true,
    timestamps: true,
    toJSON: {
        virtuals: true,
        transform: (doc, ret) => {
            delete ret._id;
        },
    },
})
export class ProxyIp {
    @ApiProperty({ example: '192.168.1.100', description: 'IP address of the proxy' })
    @Prop({ required: true, unique: true })
    ipAddress: string;

    @ApiProperty({ example: 8080, description: 'Port number of the proxy' })
    @Prop({ required: true })
    port: number;

    @ApiProperty({ example: 'http', description: 'Protocol type (http, https, socks5)', enum: ['http', 'https', 'socks5'] })
    @Prop({ required: true, enum: ['http', 'https', 'socks5'] })
    protocol: string;

    @ApiProperty({ example: 'username', description: 'Username for proxy authentication' })
    @Prop({ required: false })
    username?: string;

    @ApiProperty({ example: 'password', description: 'Password for proxy authentication' })
    @Prop({ required: false })
    password?: string;

    @ApiProperty({ example: 'active', description: 'Status of the proxy IP', enum: ['active', 'inactive'] })
    @Prop({ required: true, default: 'active', enum: ['active', 'inactive'] })
    status: string;

    @ApiProperty({ example: false, description: 'Whether this IP is currently assigned to a mobile number' })
    @Prop({ required: false, default: false })
    isAssigned: boolean;

    @ApiProperty({ example: 'client1', description: 'Client ID that owns this IP' })
    @Prop({ required: false })
    assignedToClient?: string;

    // ==================== NEW FIELDS ====================

    @ApiProperty({ example: 'manual', description: 'Source of the proxy', enum: ['manual', 'webshare'] })
    @Prop({ required: false, default: 'manual', enum: ['manual', 'webshare'] })
    source: string;

    @ApiProperty({ example: 'abc123', description: 'Webshare proxy ID for replacement API' })
    @Prop({ required: false })
    webshareId?: string;

    @ApiProperty({ example: 'US', description: 'ISO 3166-1 two-letter country code' })
    @Prop({ required: false })
    countryCode?: string;

    @ApiProperty({ example: 'New York', description: 'City name of the proxy location' })
    @Prop({ required: false })
    cityName?: string;

    @ApiProperty({ description: 'Last time the proxy was verified healthy' })
    @Prop({ required: false })
    lastVerified?: Date;

    @ApiProperty({ description: 'Last time the proxy was served via getNextIp' })
    @Prop({ required: false })
    lastUsed?: Date;

    @ApiProperty({ example: 0, description: 'Number of consecutive health check failures' })
    @Prop({ required: false, default: 0 })
    consecutiveFails: number;

    @ApiProperty({ example: 0, description: 'Index used for round-robin ordering' })
    @Prop({ required: false, default: 0 })
    roundRobinIndex: number;
}

export const ProxyIpSchema = SchemaFactory.createForClass(ProxyIp);

// Create indexes for better performance
ProxyIpSchema.index({ ipAddress: 1, port: 1 }, { unique: true });
ProxyIpSchema.index({ status: 1, isAssigned: 1 });
ProxyIpSchema.index({ assignedToClient: 1 });
ProxyIpSchema.index({ source: 1 });
ProxyIpSchema.index({ status: 1, lastUsed: 1 }); // For round-robin queries
ProxyIpSchema.index({ webshareId: 1 }, { sparse: true });
```

- [ ] **Step 2: Verify the schema compiles**

Run: `cd /home/SaiKumar.Shetty/Documents/Projects/local/CommonTgService-local && npx tsc --noEmit --pretty 2>&1 | head -30`

Expected: No errors related to `proxy-ip.schema.ts`

- [ ] **Step 3: Commit**

```bash
git add src/components/ip-management/schemas/proxy-ip.schema.ts
git commit -m "feat(ip-management): extend ProxyIp schema with source, geo, health tracking, and round-robin fields"
```

---

## Task 2: Update CreateProxyIpDto and Add GetNextIpDto

**Files:**
- Modify: `src/components/ip-management/dto/create-proxy-ip.dto.ts`
- Create: `src/components/ip-management/dto/get-next-ip.dto.ts`
- Modify: `src/components/ip-management/index.ts`

- [ ] **Step 1: Update CreateProxyIpDto with new optional fields**

Replace `src/components/ip-management/dto/create-proxy-ip.dto.ts` with:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsEnum, IsBoolean, IsDate, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProxyIpDto {
    @ApiProperty({ example: '192.168.1.100', description: 'IP address of the proxy' })
    @IsString()
    ipAddress: string;

    @ApiProperty({ example: 8080, description: 'Port number of the proxy' })
    @IsNumber()
    @Min(1)
    @Max(65535)
    port: number;

    @ApiProperty({ example: 'http', description: 'Protocol type', enum: ['http', 'https', 'socks5'] })
    @IsEnum(['http', 'https', 'socks5'])
    protocol: string;

    @ApiProperty({ example: 'username', description: 'Username for proxy authentication', required: false })
    @IsOptional()
    @IsString()
    username?: string;

    @ApiProperty({ example: 'password', description: 'Password for proxy authentication', required: false })
    @IsOptional()
    @IsString()
    password?: string;

    @ApiProperty({ example: 'active', description: 'Status of the proxy IP', enum: ['active', 'inactive'], required: false })
    @IsOptional()
    @IsEnum(['active', 'inactive'])
    status?: string;

    @ApiProperty({ example: false, description: 'Whether this IP is currently assigned', required: false })
    @IsOptional()
    @IsBoolean()
    isAssigned?: boolean;

    @ApiProperty({ example: 'client1', description: 'Client ID that owns this IP', required: false })
    @IsOptional()
    @IsString()
    assignedToClient?: string;

    @ApiProperty({ example: 'manual', description: 'Source of the proxy', enum: ['manual', 'webshare'], required: false })
    @IsOptional()
    @IsEnum(['manual', 'webshare'])
    source?: string;

    @ApiProperty({ example: 'abc123', description: 'Webshare proxy ID', required: false })
    @IsOptional()
    @IsString()
    webshareId?: string;

    @ApiProperty({ example: 'US', description: 'Country code', required: false })
    @IsOptional()
    @IsString()
    countryCode?: string;

    @ApiProperty({ example: 'New York', description: 'City name', required: false })
    @IsOptional()
    @IsString()
    cityName?: string;
}
```

- [ ] **Step 2: Create GetNextIpDto**

Create `src/components/ip-management/dto/get-next-ip.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';

export class GetNextIpDto {
    @ApiProperty({ example: 'client1', description: 'Optional client ID to filter IPs by assignment', required: false })
    @IsOptional()
    @IsString()
    clientId?: string;

    @ApiProperty({ example: 'US', description: 'Optional country code filter', required: false })
    @IsOptional()
    @IsString()
    countryCode?: string;

    @ApiProperty({ example: 'socks5', description: 'Optional protocol filter', enum: ['http', 'https', 'socks5'], required: false })
    @IsOptional()
    @IsEnum(['http', 'https', 'socks5'])
    protocol?: string;
}
```

- [ ] **Step 3: Update barrel export**

Add to `src/components/ip-management/index.ts`:

```typescript
export * from './ip-management.module';
export * from './ip-management.service';
export * from './ip-management.controller';
export * from './schemas/proxy-ip.schema';
export * from './dto/create-proxy-ip.dto';
export * from './dto/update-proxy-ip.dto';
export * from './dto/search-ip.dto';
export * from './dto/get-next-ip.dto';
```

- [ ] **Step 4: Verify compilation**

Run: `cd /home/SaiKumar.Shetty/Documents/Projects/local/CommonTgService-local && npx tsc --noEmit --pretty 2>&1 | head -30`

Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/components/ip-management/dto/create-proxy-ip.dto.ts src/components/ip-management/dto/get-next-ip.dto.ts src/components/ip-management/index.ts
git commit -m "feat(ip-management): add port validation to CreateProxyIpDto, create GetNextIpDto for round-robin"
```

---

## Task 3: Add Round-Robin `getNextIp` and Sync Helpers to IpManagementService

**Files:**
- Modify: `src/components/ip-management/ip-management.service.ts`

This is the core enhancement. We add:
1. `getNextIp()` — global round-robin with optional clientId/country/protocol filters
2. `syncFromExternal()` — upsert proxies from an external source (used by Webshare module)
3. `removeBySource()` — remove all proxies from a given source
4. Health tracking helpers: `markLastUsed()`, `updateHealthStatus()`, `incrementConsecutiveFails()`, `resetConsecutiveFails()`

- [ ] **Step 1: Add the round-robin counter (Redis-based) and new imports**

Replace the full `src/components/ip-management/ip-management.service.ts`:

```typescript
import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery } from 'mongoose';
import { ProxyIp, ProxyIpDocument } from './schemas/proxy-ip.schema';
import { CreateProxyIpDto } from './dto/create-proxy-ip.dto';
import { UpdateProxyIpDto } from './dto/update-proxy-ip.dto';
import { GetNextIpDto } from './dto/get-next-ip.dto';
import { Logger } from '../../utils';
import { RedisClient } from '../../utils/redisClient';

const ROUND_ROBIN_KEY = 'ip-mgmt:round-robin:counter';

@Injectable()
export class IpManagementService {
    private readonly logger = new Logger(IpManagementService.name);

    constructor(
        @InjectModel(ProxyIp.name) private proxyIpModel: Model<ProxyIpDocument>,
    ) {}

    // ==================== PROXY IP CRUD ====================

    async createProxyIp(createProxyIpDto: CreateProxyIpDto): Promise<ProxyIp> {
        if (!createProxyIpDto.ipAddress || !createProxyIpDto.port) {
            throw new BadRequestException('IP address and port are required');
        }

        if (createProxyIpDto.port < 1 || createProxyIpDto.port > 65535) {
            throw new BadRequestException('Port must be between 1 and 65535');
        }

        this.logger.debug(`Creating new proxy IP: ${createProxyIpDto.ipAddress}:${createProxyIpDto.port}`);

        try {
            const existingIp = await this.proxyIpModel.findOne({
                ipAddress: createProxyIpDto.ipAddress,
                port: createProxyIpDto.port
            });

            if (existingIp) {
                throw new ConflictException(`Proxy IP ${createProxyIpDto.ipAddress}:${createProxyIpDto.port} already exists`);
            }

            const createdIp = new this.proxyIpModel(createProxyIpDto);
            const savedIp = await createdIp.save();

            this.logger.log(`Created proxy IP: ${savedIp.ipAddress}:${savedIp.port}`);
            return savedIp.toJSON();
        } catch (error) {
            if (error instanceof ConflictException || error instanceof BadRequestException) {
                throw error;
            }
            this.logger.error(`Failed to create proxy IP ${createProxyIpDto.ipAddress}:${createProxyIpDto.port}: ${error.message}`);
            throw new BadRequestException(`Failed to create proxy IP: ${error.message}`);
        }
    }

    async bulkCreateProxyIps(proxyIps: CreateProxyIpDto[]): Promise<{ created: number; failed: number; errors: string[] }> {
        if (!proxyIps || proxyIps.length === 0) {
            throw new BadRequestException('No proxy IPs provided for bulk creation');
        }

        this.logger.debug(`Bulk creating ${proxyIps.length} proxy IPs`);

        let created = 0;
        let failed = 0;
        const errors: string[] = [];

        const batchSize = 10;
        for (let i = 0; i < proxyIps.length; i += batchSize) {
            const batch = proxyIps.slice(i, i + batchSize);

            for (const ipDto of batch) {
                try {
                    if (!ipDto.ipAddress || !ipDto.port) {
                        failed++;
                        errors.push(`Invalid IP data: missing address or port`);
                        continue;
                    }

                    await this.createProxyIp(ipDto);
                    created++;
                } catch (error) {
                    failed++;
                    errors.push(`${ipDto.ipAddress}:${ipDto.port} - ${error.message}`);
                }
            }
        }

        this.logger.log(`Bulk creation completed: ${created} created, ${failed} failed`);
        return { created, failed, errors };
    }

    async findAllProxyIps(): Promise<ProxyIp[]> {
        return this.proxyIpModel.find().lean();
    }

    async getAvailableProxyIps(): Promise<ProxyIp[]> {
        return this.proxyIpModel.find({
            status: 'active',
            isAssigned: false
        }).lean();
    }

    async updateProxyIp(ipAddress: string, port: number, updateDto: UpdateProxyIpDto): Promise<ProxyIp> {
        this.logger.debug(`Updating proxy IP: ${ipAddress}:${port}`);

        const updatedIp = await this.proxyIpModel.findOneAndUpdate(
            { ipAddress, port },
            { $set: updateDto },
            { new: true }
        ).lean();

        if (!updatedIp) {
            throw new NotFoundException(`Proxy IP ${ipAddress}:${port} not found`);
        }

        this.logger.log(`Updated proxy IP: ${ipAddress}:${port}`);
        return updatedIp;
    }

    async deleteProxyIp(ipAddress: string, port: number): Promise<void> {
        this.logger.debug(`Deleting proxy IP: ${ipAddress}:${port}`);

        const result = await this.proxyIpModel.deleteOne({ ipAddress, port });
        if (result.deletedCount === 0) {
            throw new NotFoundException(`Proxy IP ${ipAddress}:${port} not found`);
        }

        this.logger.log(`Deleted proxy IP: ${ipAddress}:${port}`);
    }

    async findProxyIpById(ipAddress: string, port: number): Promise<ProxyIp> {
        if (!ipAddress || !port) {
            throw new BadRequestException('IP address and port are required');
        }

        try {
            const proxyIp = await this.proxyIpModel.findOne({ ipAddress, port }).lean();
            if (!proxyIp) {
                throw new NotFoundException(`Proxy IP ${ipAddress}:${port} not found`);
            }
            return proxyIp;
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            this.logger.error(`Error finding proxy IP ${ipAddress}:${port}: ${error.message}`);
            throw new BadRequestException(`Failed to find proxy IP: ${error.message}`);
        }
    }

    async getClientAssignedIps(clientId: string): Promise<ProxyIp[]> {
        if (!clientId || clientId.trim() === '') {
            throw new BadRequestException('Client ID is required');
        }

        try {
            return this.proxyIpModel.find({
                assignedToClient: clientId.trim(),
                isAssigned: true
            }).lean();
        } catch (error) {
            this.logger.error(`Error getting assigned IPs for client ${clientId}: ${error.message}`);
            throw new BadRequestException(`Failed to get assigned IPs: ${error.message}`);
        }
    }

    async isIpAvailable(ipAddress: string, port: number): Promise<boolean> {
        if (!ipAddress || !port) {
            throw new BadRequestException('IP address and port are required');
        }

        try {
            const ip = await this.proxyIpModel.findOne({
                ipAddress,
                port,
                status: 'active',
                isAssigned: false
            }).lean();

            return ip !== null;
        } catch (error) {
            this.logger.error(`Error checking IP availability ${ipAddress}:${port}: ${error.message}`);
            return false;
        }
    }

    async getAvailableIpCount(): Promise<number> {
        try {
            return this.proxyIpModel.countDocuments({
                status: 'active',
                isAssigned: false
            });
        } catch (error) {
            this.logger.error(`Error getting available IP count: ${error.message}`);
            return 0;
        }
    }

    // ==================== ROUND-ROBIN: getNextIp ====================

    /**
     * Serves the next available proxy IP in round-robin order.
     *
     * - Filters by status=active only.
     * - If clientId is provided, returns IPs assigned to that client.
     *   If no IPs found for that client, falls back to the full active pool.
     * - If no clientId, returns from the entire active pool.
     * - Optional countryCode and protocol filters.
     * - Uses Redis atomic counter for global round-robin index.
     * - Updates `lastUsed` timestamp on the served IP.
     */
    async getNextIp(filters?: GetNextIpDto): Promise<ProxyIp> {
        const query: FilterQuery<ProxyIpDocument> = { status: 'active' };

        if (filters?.countryCode) {
            query.countryCode = filters.countryCode;
        }
        if (filters?.protocol) {
            query.protocol = filters.protocol;
        }

        // If clientId provided, try client-specific IPs first
        if (filters?.clientId) {
            const clientQuery = {
                ...query,
                assignedToClient: filters.clientId,
                isAssigned: true,
            };

            const clientIps = await this.proxyIpModel
                .find(clientQuery)
                .sort({ lastUsed: 1, roundRobinIndex: 1 })
                .lean();

            if (clientIps.length > 0) {
                return this._pickAndMark(clientIps);
            }

            this.logger.debug(`No IPs found for client ${filters.clientId}, falling back to full pool`);
            // Fall through to full pool
        }

        // Full pool — all active IPs (regardless of assignment)
        const allIps = await this.proxyIpModel
            .find(query)
            .sort({ lastUsed: 1, roundRobinIndex: 1 })
            .lean();

        if (allIps.length === 0) {
            throw new NotFoundException('No active proxy IPs available in the pool');
        }

        return this._pickAndMark(allIps);
    }

    /**
     * Picks the next IP from a sorted list using Redis atomic counter,
     * then updates lastUsed in the background.
     */
    private async _pickAndMark(ips: ProxyIp[]): Promise<ProxyIp> {
        let index = 0;
        try {
            const counter = await RedisClient.incr(ROUND_ROBIN_KEY);
            index = (counter - 1) % ips.length;
        } catch (err) {
            // Redis down — use simple modulo on timestamp as fallback
            index = Date.now() % ips.length;
            this.logger.warn(`Redis unavailable for round-robin counter, using timestamp fallback`);
        }

        const selected = ips[index];

        // Fire-and-forget lastUsed update
        this.proxyIpModel.updateOne(
            { ipAddress: selected.ipAddress, port: selected.port },
            { $set: { lastUsed: new Date() } }
        ).exec().catch(err => {
            this.logger.warn(`Failed to update lastUsed for ${selected.ipAddress}:${selected.port}: ${err.message}`);
        });

        this.logger.debug(`Round-robin served: ${selected.ipAddress}:${selected.port} (index=${index}/${ips.length})`);
        return selected;
    }

    // ==================== EXTERNAL SYNC ====================

    /**
     * Upserts proxies from an external source (e.g., Webshare).
     * Matches on ipAddress+port. Updates existing, inserts new.
     * Optionally removes stale proxies from the same source that are no longer in the incoming list.
     */
    async syncFromExternal(
        source: string,
        proxies: CreateProxyIpDto[],
        removeStale: boolean = true
    ): Promise<{ created: number; updated: number; removed: number; errors: string[] }> {
        this.logger.log(`Sync from "${source}": ${proxies.length} proxies, removeStale=${removeStale}`);

        let created = 0;
        let updated = 0;
        let removed = 0;
        const errors: string[] = [];
        const incomingKeys = new Set<string>();

        for (const proxy of proxies) {
            const key = `${proxy.ipAddress}:${proxy.port}`;
            incomingKeys.add(key);

            try {
                const existing = await this.proxyIpModel.findOne({
                    ipAddress: proxy.ipAddress,
                    port: proxy.port,
                });

                if (existing) {
                    // Update — preserve assignment fields if they exist
                    await this.proxyIpModel.updateOne(
                        { ipAddress: proxy.ipAddress, port: proxy.port },
                        {
                            $set: {
                                protocol: proxy.protocol,
                                username: proxy.username,
                                password: proxy.password,
                                status: proxy.status || 'active',
                                source,
                                webshareId: proxy.webshareId,
                                countryCode: proxy.countryCode,
                                cityName: proxy.cityName,
                                consecutiveFails: 0,
                            },
                        }
                    );
                    updated++;
                } else {
                    await this.proxyIpModel.create({
                        ...proxy,
                        source,
                        status: proxy.status || 'active',
                        isAssigned: proxy.isAssigned || false,
                        consecutiveFails: 0,
                        roundRobinIndex: 0,
                    });
                    created++;
                }
            } catch (error) {
                errors.push(`${key}: ${error.message}`);
            }
        }

        // Remove stale proxies from this source that weren't in the incoming list
        if (removeStale) {
            const staleProxies = await this.proxyIpModel.find({ source }).lean();
            for (const stale of staleProxies) {
                const key = `${stale.ipAddress}:${stale.port}`;
                if (!incomingKeys.has(key)) {
                    await this.proxyIpModel.deleteOne({ ipAddress: stale.ipAddress, port: stale.port });
                    removed++;
                    this.logger.debug(`Removed stale ${source} proxy: ${key}`);
                }
            }
        }

        this.logger.log(`Sync "${source}" complete: created=${created}, updated=${updated}, removed=${removed}, errors=${errors.length}`);
        return { created, updated, removed, errors };
    }

    /**
     * Remove all proxies from a given source.
     */
    async removeBySource(source: string): Promise<number> {
        const result = await this.proxyIpModel.deleteMany({ source });
        this.logger.log(`Removed ${result.deletedCount} proxies from source "${source}"`);
        return result.deletedCount;
    }

    // ==================== HEALTH TRACKING ====================

    async markLastUsed(ipAddress: string, port: number): Promise<void> {
        await this.proxyIpModel.updateOne(
            { ipAddress, port },
            { $set: { lastUsed: new Date() } }
        );
    }

    async updateHealthStatus(
        ipAddress: string,
        port: number,
        healthy: boolean
    ): Promise<void> {
        if (healthy) {
            await this.proxyIpModel.updateOne(
                { ipAddress, port },
                { $set: { lastVerified: new Date(), consecutiveFails: 0 } }
            );
        } else {
            await this.proxyIpModel.updateOne(
                { ipAddress, port },
                { $set: { lastVerified: new Date() }, $inc: { consecutiveFails: 1 } }
            );
        }
    }

    async markInactive(ipAddress: string, port: number): Promise<void> {
        await this.proxyIpModel.updateOne(
            { ipAddress, port },
            { $set: { status: 'inactive' } }
        );
        this.logger.log(`Marked proxy inactive: ${ipAddress}:${port}`);
    }

    /**
     * Get proxies from a specific source.
     */
    async findBySource(source: string): Promise<ProxyIp[]> {
        return this.proxyIpModel.find({ source }).lean();
    }

    // ==================== STATS ====================

    async getStats(): Promise<{
        total: number;
        available: number;
        assigned: number;
        inactive: number;
        bySource: Record<string, number>;
    }> {
        try {
            const [total, available, assigned, inactive] = await Promise.all([
                this.proxyIpModel.countDocuments(),
                this.proxyIpModel.countDocuments({ status: 'active', isAssigned: false }),
                this.proxyIpModel.countDocuments({ isAssigned: true }),
                this.proxyIpModel.countDocuments({ status: 'inactive' })
            ]);

            // Count by source
            const sourceAgg = await this.proxyIpModel.aggregate([
                { $group: { _id: '$source', count: { $sum: 1 } } }
            ]);
            const bySource: Record<string, number> = {};
            for (const entry of sourceAgg) {
                bySource[entry._id || 'manual'] = entry.count;
            }

            return {
                total,
                available,
                assigned,
                inactive,
                bySource,
            };
        } catch (error) {
            this.logger.error(`Error getting statistics: ${error.message}`);
            throw new BadRequestException(`Failed to get statistics: ${error.message}`);
        }
    }

    // ==================== HEALTH CHECK ====================

    async healthCheck(): Promise<{
        status: 'healthy' | 'warning' | 'critical';
        availableIps: number;
        totalActiveIps: number;
        utilizationRate: number;
        issues: string[];
    }> {
        try {
            const stats = await this.getStats();
            const issues: string[] = [];

            const utilizationRate = stats.total > 0 ? (stats.assigned / stats.total) * 100 : 0;

            let status: 'healthy' | 'warning' | 'critical' = 'healthy';

            if (stats.available === 0) {
                status = 'critical';
                issues.push('No available IPs in pool');
            } else if (stats.available < 5) {
                status = 'warning';
                issues.push('Low IP availability (less than 5 IPs available)');
            }

            if (utilizationRate > 90) {
                status = utilizationRate > 95 ? 'critical' : 'warning';
                issues.push(`High utilization rate: ${utilizationRate.toFixed(1)}%`);
            }

            if (stats.inactive > stats.total * 0.2) {
                status = 'warning';
                issues.push('High number of inactive IPs');
            }

            return {
                status,
                availableIps: stats.available,
                totalActiveIps: stats.total - stats.inactive,
                utilizationRate: parseFloat(utilizationRate.toFixed(1)),
                issues
            };
        } catch (error) {
            this.logger.error(`Error during health check: ${error.message}`);
            return {
                status: 'critical',
                availableIps: 0,
                totalActiveIps: 0,
                utilizationRate: 0,
                issues: ['Health check failed']
            };
        }
    }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd /home/SaiKumar.Shetty/Documents/Projects/local/CommonTgService-local && npx tsc --noEmit --pretty 2>&1 | head -30`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ip-management/ip-management.service.ts
git commit -m "feat(ip-management): add round-robin getNextIp, syncFromExternal, health tracking methods"
```

---

## Task 4: Add getNextIp Endpoint to IpManagementController

**Files:**
- Modify: `src/components/ip-management/ip-management.controller.ts`

- [ ] **Step 1: Add the getNextIp endpoint and update imports**

Replace `src/components/ip-management/ip-management.controller.ts` with:

```typescript
import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpException, HttpStatus } from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiParam,
    ApiQuery,
    ApiBody,
    ApiOkResponse,
    ApiBadRequestResponse,
    ApiNotFoundResponse,
    ApiConflictResponse
} from '@nestjs/swagger';
import { IpManagementService } from './ip-management.service';
import { CreateProxyIpDto } from './dto/create-proxy-ip.dto';
import { UpdateProxyIpDto } from './dto/update-proxy-ip.dto';
import { GetNextIpDto } from './dto/get-next-ip.dto';
import { ProxyIp } from './schemas/proxy-ip.schema';

@ApiTags('IP Management')
@Controller('ip-management')
export class IpManagementController {
    constructor(private readonly ipManagementService: IpManagementService) { }

    // ==================== PROXY IP MANAGEMENT ====================

    @Post('proxy-ips')
    @ApiOperation({ summary: 'Create a new proxy IP' })
    @ApiBody({ type: CreateProxyIpDto })
    @ApiOkResponse({ description: 'Proxy IP created successfully', type: ProxyIp })
    @ApiBadRequestResponse({ description: 'Invalid input data' })
    @ApiConflictResponse({ description: 'Proxy IP already exists' })
    async createProxyIp(@Body() createProxyIpDto: CreateProxyIpDto): Promise<ProxyIp> {
        try {
            return await this.ipManagementService.createProxyIp(createProxyIpDto);
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }

    @Post('proxy-ips/bulk')
    @ApiOperation({ summary: 'Bulk create proxy IPs' })
    @ApiBody({ type: [CreateProxyIpDto] })
    @ApiOkResponse({ description: 'Bulk creation completed' })
    async bulkCreateProxyIps(@Body() proxyIps: CreateProxyIpDto[]): Promise<{ created: number; failed: number; errors: string[] }> {
        try {
            return await this.ipManagementService.bulkCreateProxyIps(proxyIps);
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }

    @Get('proxy-ips')
    @ApiOperation({ summary: 'Get all proxy IPs' })
    @ApiOkResponse({ description: 'Proxy IPs retrieved successfully', type: [ProxyIp] })
    async getAllProxyIps(): Promise<ProxyIp[]> {
        try {
            return await this.ipManagementService.findAllProxyIps();
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Get('proxy-ips/next')
    @ApiOperation({
        summary: 'Get next available proxy IP (round-robin)',
        description: 'Serves the next active proxy IP using global round-robin. Optionally filter by clientId (falls back to full pool if no client IPs found), countryCode, or protocol.'
    })
    @ApiQuery({ name: 'clientId', required: false, description: 'Client ID to prefer IPs assigned to this client' })
    @ApiQuery({ name: 'countryCode', required: false, description: 'ISO country code filter' })
    @ApiQuery({ name: 'protocol', required: false, description: 'Protocol filter', enum: ['http', 'https', 'socks5'] })
    @ApiOkResponse({ description: 'Next proxy IP served', type: ProxyIp })
    @ApiNotFoundResponse({ description: 'No active proxy IPs available' })
    async getNextIp(@Query() filters: GetNextIpDto): Promise<ProxyIp> {
        try {
            return await this.ipManagementService.getNextIp(filters);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw new HttpException(error.message, HttpStatus.NOT_FOUND);
        }
    }

    @Put('proxy-ips/:ipAddress/:port')
    @ApiOperation({ summary: 'Update a proxy IP' })
    @ApiParam({ name: 'ipAddress', description: 'IP address' })
    @ApiParam({ name: 'port', description: 'Port number' })
    @ApiBody({ type: UpdateProxyIpDto })
    @ApiOkResponse({ description: 'Proxy IP updated successfully', type: ProxyIp })
    @ApiNotFoundResponse({ description: 'Proxy IP not found' })
    async updateProxyIp(
        @Param('ipAddress') ipAddress: string,
        @Param('port') port: string,
        @Body() updateProxyIpDto: UpdateProxyIpDto
    ): Promise<ProxyIp> {
        try {
            return await this.ipManagementService.updateProxyIp(ipAddress, parseInt(port), updateProxyIpDto);
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }

    @Delete('proxy-ips/:ipAddress/:port')
    @ApiOperation({ summary: 'Delete a proxy IP' })
    @ApiParam({ name: 'ipAddress', description: 'IP address' })
    @ApiParam({ name: 'port', description: 'Port number' })
    @ApiOkResponse({ description: 'Proxy IP deleted successfully' })
    @ApiNotFoundResponse({ description: 'Proxy IP not found' })
    @ApiBadRequestResponse({ description: 'Cannot delete assigned IP' })
    async deleteProxyIp(@Param('ipAddress') ipAddress: string, @Param('port') port: string): Promise<{ message: string }> {
        try {
            await this.ipManagementService.deleteProxyIp(ipAddress, parseInt(port));
            return { message: 'Proxy IP deleted successfully' };
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }

    @Get('health')
    @ApiOperation({ summary: 'Get IP management health status' })
    @ApiOkResponse({ description: 'Health status retrieved successfully' })
    async getHealthStatus() {
        try {
            return await this.ipManagementService.healthCheck();
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Get('stats')
    @ApiOperation({ summary: 'Get IP pool statistics including source breakdown' })
    @ApiOkResponse({ description: 'Stats retrieved successfully' })
    async getStats() {
        try {
            return await this.ipManagementService.getStats();
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Get('proxy-ips/:ipAddress/:port')
    @ApiOperation({ summary: 'Get a specific proxy IP' })
    @ApiParam({ name: 'ipAddress', description: 'IP address' })
    @ApiParam({ name: 'port', description: 'Port number' })
    @ApiOkResponse({ description: 'Proxy IP found', type: ProxyIp })
    @ApiNotFoundResponse({ description: 'Proxy IP not found' })
    async getProxyIpById(@Param('ipAddress') ipAddress: string, @Param('port') port: string): Promise<ProxyIp> {
        try {
            return await this.ipManagementService.findProxyIpById(ipAddress, parseInt(port));
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.NOT_FOUND);
        }
    }

    @Get('clients/:clientId/assigned-ips')
    @ApiOperation({ summary: 'Get all IPs assigned to a client' })
    @ApiParam({ name: 'clientId', description: 'Client ID' })
    @ApiOkResponse({ description: 'Client assigned IPs retrieved successfully', type: [ProxyIp] })
    async getClientAssignedIps(@Param('clientId') clientId: string): Promise<ProxyIp[]> {
        try {
            return await this.ipManagementService.getClientAssignedIps(clientId);
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }

    @Get('available-count')
    @ApiOperation({ summary: 'Get count of available IPs' })
    @ApiOkResponse({ description: 'Available IP count retrieved successfully' })
    async getAvailableIpCount(): Promise<{ count: number }> {
        try {
            const count = await this.ipManagementService.getAvailableIpCount();
            return { count };
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}
```

**Important note on route ordering:** `proxy-ips/next` MUST be defined before `proxy-ips/:ipAddress/:port` in the controller, otherwise NestJS will match "next" as an `:ipAddress` param. The code above has the correct order.

- [ ] **Step 2: Verify compilation**

Run: `cd /home/SaiKumar.Shetty/Documents/Projects/local/CommonTgService-local && npx tsc --noEmit --pretty 2>&1 | head -30`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ip-management/ip-management.controller.ts
git commit -m "feat(ip-management): add GET /proxy-ips/next round-robin endpoint and GET /stats"
```

---

## Task 5: Create Webshare Types and Interfaces

**Files:**
- Create: `src/components/webshare-proxy/interfaces/webshare-types.ts`

- [ ] **Step 1: Create the interfaces directory and types file**

Create `src/components/webshare-proxy/interfaces/webshare-types.ts`:

```typescript
/**
 * Webshare API response types.
 * Based on https://apidocs.webshare.io/
 * Auth: `Authorization: Token <API_KEY>`
 * Base URL: https://proxy.webshare.io/api/v2/
 */

export interface WebshareProxy {
    id: string;
    username: string;
    password: string;
    proxy_address: string | null;  // null for backbone/residential pool
    port: number;
    valid: boolean;
    last_verification: string;     // ISO timestamp
    country_code: string;          // ISO 3166-1 two-letter
    city_name: string;
    created_at: string;
}

export interface WebsharePaginatedResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

export interface WebshareProxyConfig {
    username: string;
    password: string;
    request_timeout: number;
    request_idle_timeout: number;
    state: 'pending' | 'processing' | 'completed';
    authorized_ips: string[];
    country_code_list: string[];
    ip_range_list: string[];
    asn_list: number[];
}

export interface WebshareReplacementRequest {
    // Fields needed to create a replacement via POST /proxy/replacement/
    proxy_address?: string;
    country_code?: string;
}

export interface WebshareReplacement {
    id: string;
    status: string;
    created_at: string;
    updated_at: string;
}

export interface WebshareProxyStats {
    total: number;
    active: number;
    inactive: number;
    country_breakdown: Record<string, number>;
}

export interface WebshareSyncResult {
    totalFetched: number;
    created: number;
    updated: number;
    removed: number;
    errors: string[];
    durationMs: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/webshare-proxy/interfaces/webshare-types.ts
git commit -m "feat(webshare-proxy): add TypeScript interfaces for Webshare API responses"
```

---

## Task 6: Create Webshare DTOs

**Files:**
- Create: `src/components/webshare-proxy/dto/sync-proxies.dto.ts`
- Create: `src/components/webshare-proxy/dto/replace-proxy.dto.ts`
- Create: `src/components/webshare-proxy/dto/webshare-config.dto.ts`

- [ ] **Step 1: Create sync-proxies DTO**

Create `src/components/webshare-proxy/dto/sync-proxies.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';

export class SyncProxiesDto {
    @ApiProperty({
        description: 'Whether to remove proxies from DB that are no longer in the Webshare list',
        example: true,
        required: false,
        default: true,
    })
    @IsOptional()
    @IsBoolean()
    removeStale?: boolean;
}

export class SyncResultDto {
    @ApiProperty({ example: 100 })
    totalFetched: number;

    @ApiProperty({ example: 80 })
    created: number;

    @ApiProperty({ example: 15 })
    updated: number;

    @ApiProperty({ example: 5 })
    removed: number;

    @ApiProperty({ example: [] })
    errors: string[];

    @ApiProperty({ example: 2345 })
    durationMs: number;
}
```

- [ ] **Step 2: Create replace-proxy DTO**

Create `src/components/webshare-proxy/dto/replace-proxy.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class ReplaceProxyDto {
    @ApiProperty({ description: 'IP address of the proxy to replace', example: '1.2.3.4' })
    @IsString()
    ipAddress: string;

    @ApiProperty({ description: 'Port of the proxy to replace', example: 8080 })
    port: number;

    @ApiProperty({ description: 'Preferred country code for replacement', required: false, example: 'US' })
    @IsOptional()
    @IsString()
    preferredCountry?: string;
}

export class ReplaceResultDto {
    @ApiProperty({ example: true })
    success: boolean;

    @ApiProperty({ example: 'Replacement initiated' })
    message: string;

    @ApiProperty({ required: false })
    replacementId?: string;
}
```

- [ ] **Step 3: Create webshare-config DTO**

Create `src/components/webshare-proxy/dto/webshare-config.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class WebshareStatusDto {
    @ApiProperty({ example: true })
    configured: boolean;

    @ApiProperty({ example: true })
    apiKeyValid: boolean;

    @ApiProperty({ example: 100 })
    totalProxiesInWebshare: number;

    @ApiProperty({ example: 95 })
    totalProxiesInDb: number;

    @ApiProperty({ example: '2026-03-29T10:00:00Z', required: false })
    lastSyncAt?: string;

    @ApiProperty({ example: null, required: false })
    lastSyncError?: string;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/webshare-proxy/dto/
git commit -m "feat(webshare-proxy): add DTOs for sync, replace, and status endpoints"
```

---

## Task 7: Create WebshareProxyService

**Files:**
- Create: `src/components/webshare-proxy/webshare-proxy.service.ts`

This is the core Webshare integration service. It:
- Fetches all proxies from Webshare API (handles pagination)
- Syncs them into the IP pool via `IpManagementService.syncFromExternal()`
- Triggers proxy replacements on Webshare when health checks fail
- Refreshes proxy list on demand
- Tracks sync state in Redis

- [ ] **Step 1: Create the service**

Create `src/components/webshare-proxy/webshare-proxy.service.ts`:

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { IpManagementService } from '../ip-management/ip-management.service';
import { CreateProxyIpDto } from '../ip-management/dto/create-proxy-ip.dto';
import {
    WebshareProxy,
    WebsharePaginatedResponse,
    WebshareSyncResult,
} from './interfaces/webshare-types';
import { Logger } from '../../utils';
import { RedisClient } from '../../utils/redisClient';

const REDIS_LAST_SYNC_KEY = 'webshare:last-sync';
const REDIS_LAST_SYNC_ERROR_KEY = 'webshare:last-sync-error';
const SOURCE_NAME = 'webshare';

@Injectable()
export class WebshareProxyService implements OnModuleInit {
    private readonly logger = new Logger(WebshareProxyService.name);
    private client: AxiosInstance;
    private configured = false;

    constructor(
        private readonly ipManagementService: IpManagementService,
    ) {}

    onModuleInit() {
        const apiKey = process.env.WEBSHARE_API_KEY;
        const baseUrl = process.env.WEBSHARE_API_URL || 'https://proxy.webshare.io/api/v2';
        const timeout = parseInt(process.env.WEBSHARE_API_TIMEOUT || '10000', 10);

        if (!apiKey) {
            this.logger.warn('WEBSHARE_API_KEY not set — Webshare proxy module is disabled');
            return;
        }

        this.client = axios.create({
            baseURL: baseUrl,
            timeout,
            headers: {
                'Authorization': `Token ${apiKey}`,
                'Content-Type': 'application/json',
            },
        });

        this.configured = true;
        this.logger.log(`Webshare proxy module initialized (baseUrl=${baseUrl})`);
    }

    isConfigured(): boolean {
        return this.configured;
    }

    // ==================== FETCH PROXIES ====================

    /**
     * Fetches ALL proxies from Webshare, handling pagination.
     * Webshare rate limit: 60 req/min for proxy list endpoints.
     */
    async fetchAllProxies(): Promise<WebshareProxy[]> {
        this.ensureConfigured();
        const allProxies: WebshareProxy[] = [];
        let page = 1;
        const pageSize = 100; // max reasonable page size

        this.logger.log('Fetching all proxies from Webshare...');

        while (true) {
            try {
                const response = await this.client.get<WebsharePaginatedResponse<WebshareProxy>>(
                    '/proxy/list/',
                    { params: { page, page_size: pageSize } }
                );

                const { results, next, count } = response.data;
                allProxies.push(...results);

                this.logger.debug(`Fetched page ${page}: ${results.length} proxies (total so far: ${allProxies.length}/${count})`);

                if (!next || allProxies.length >= count) {
                    break;
                }

                page++;
            } catch (error) {
                this.logger.error(`Failed to fetch page ${page}: ${error.message}`);
                if (allProxies.length > 0) {
                    this.logger.warn(`Partial fetch: returning ${allProxies.length} proxies fetched before error`);
                    break;
                }
                throw error;
            }
        }

        this.logger.log(`Fetched ${allProxies.length} proxies from Webshare`);
        return allProxies;
    }

    // ==================== SYNC ====================

    /**
     * Full sync: fetch all Webshare proxies and upsert into local DB.
     * Removes stale proxies (ones in DB but no longer in Webshare) if removeStale=true.
     */
    async syncProxies(removeStale: boolean = true): Promise<WebshareSyncResult> {
        this.ensureConfigured();
        const startTime = Date.now();

        try {
            this.logger.log(`Starting Webshare proxy sync (removeStale=${removeStale})`);

            const webshareProxies = await this.fetchAllProxies();

            // Convert Webshare format to our CreateProxyIpDto format
            const dtos: CreateProxyIpDto[] = webshareProxies
                .filter(p => p.proxy_address && p.valid) // Skip invalid or backbone-only (null address) proxies
                .map(p => this.webshareToDto(p));

            this.logger.log(`Converting ${dtos.length} valid proxies (filtered from ${webshareProxies.length} total)`);

            const result = await this.ipManagementService.syncFromExternal(SOURCE_NAME, dtos, removeStale);

            const syncResult: WebshareSyncResult = {
                totalFetched: webshareProxies.length,
                created: result.created,
                updated: result.updated,
                removed: result.removed,
                errors: result.errors,
                durationMs: Date.now() - startTime,
            };

            // Store sync timestamp in Redis
            try {
                await RedisClient.set(REDIS_LAST_SYNC_KEY, new Date().toISOString());
                await RedisClient.del(REDIS_LAST_SYNC_ERROR_KEY);
            } catch { }

            this.logger.log(
                `Webshare sync complete in ${syncResult.durationMs}ms: ` +
                `fetched=${syncResult.totalFetched}, created=${syncResult.created}, ` +
                `updated=${syncResult.updated}, removed=${syncResult.removed}, errors=${syncResult.errors.length}`
            );

            return syncResult;
        } catch (error) {
            const durationMs = Date.now() - startTime;
            this.logger.error(`Webshare sync failed after ${durationMs}ms: ${error.message}`);

            try {
                await RedisClient.set(REDIS_LAST_SYNC_ERROR_KEY, error.message);
            } catch { }

            return {
                totalFetched: 0,
                created: 0,
                updated: 0,
                removed: 0,
                errors: [error.message],
                durationMs,
            };
        }
    }

    // ==================== REPLACE ====================

    /**
     * Request Webshare to replace a dead/bad proxy.
     * After replacement, triggers a re-sync to pick up the new proxy.
     */
    async replaceProxy(
        ipAddress: string,
        port: number,
        preferredCountry?: string
    ): Promise<{ success: boolean; message: string; replacementId?: string }> {
        this.ensureConfigured();

        try {
            // Find the proxy in our DB to get the webshareId
            const proxy = await this.ipManagementService.findProxyIpById(ipAddress, port);

            if (proxy.source !== SOURCE_NAME) {
                return {
                    success: false,
                    message: `Proxy ${ipAddress}:${port} is not from Webshare (source: ${proxy.source || 'manual'})`,
                };
            }

            // Mark as inactive in our DB immediately
            await this.ipManagementService.markInactive(ipAddress, port);

            // Request replacement from Webshare
            const body: Record<string, string> = {};
            if (proxy.webshareId) {
                body.proxy_address = ipAddress;
            }
            if (preferredCountry) {
                body.country_code = preferredCountry;
            }

            const response = await this.client.post('/proxy/replacement/', body);

            this.logger.log(`Replacement requested for ${ipAddress}:${port} — Webshare response: ${response.status}`);

            return {
                success: true,
                message: `Replacement initiated for ${ipAddress}:${port}`,
                replacementId: response.data?.id,
            };
        } catch (error) {
            this.logger.error(`Failed to replace proxy ${ipAddress}:${port}: ${error.message}`);
            return {
                success: false,
                message: `Replacement failed: ${error.message}`,
            };
        }
    }

    // ==================== REFRESH ====================

    /**
     * Triggers Webshare to refresh the proxy list on their side,
     * then syncs the refreshed list to our DB.
     */
    async refreshAndSync(): Promise<WebshareSyncResult> {
        this.ensureConfigured();

        try {
            this.logger.log('Requesting Webshare proxy list refresh...');
            await this.client.post('/proxy/refresh/');
            this.logger.log('Webshare refresh triggered, waiting 5s for propagation...');

            // Brief wait for Webshare to process the refresh
            await new Promise(resolve => setTimeout(resolve, 5000));

            return await this.syncProxies(true);
        } catch (error) {
            this.logger.error(`Refresh and sync failed: ${error.message}`);
            throw error;
        }
    }

    // ==================== STATUS ====================

    /**
     * Get Webshare integration status: API key validity, proxy counts, last sync info.
     */
    async getStatus(): Promise<{
        configured: boolean;
        apiKeyValid: boolean;
        totalProxiesInWebshare: number;
        totalProxiesInDb: number;
        lastSyncAt: string | null;
        lastSyncError: string | null;
    }> {
        if (!this.configured) {
            return {
                configured: false,
                apiKeyValid: false,
                totalProxiesInWebshare: 0,
                totalProxiesInDb: 0,
                lastSyncAt: null,
                lastSyncError: 'WEBSHARE_API_KEY not configured',
            };
        }

        let apiKeyValid = false;
        let totalProxiesInWebshare = 0;

        try {
            // Quick check: fetch page 1 with page_size=1 just to validate API key and get count
            const response = await this.client.get<WebsharePaginatedResponse<WebshareProxy>>(
                '/proxy/list/',
                { params: { page: 1, page_size: 1 } }
            );
            apiKeyValid = true;
            totalProxiesInWebshare = response.data.count;
        } catch (error) {
            this.logger.warn(`Webshare API check failed: ${error.message}`);
        }

        const dbProxies = await this.ipManagementService.findBySource(SOURCE_NAME);
        let lastSyncAt: string | null = null;
        let lastSyncError: string | null = null;

        try {
            lastSyncAt = await RedisClient.get(REDIS_LAST_SYNC_KEY);
            lastSyncError = await RedisClient.get(REDIS_LAST_SYNC_ERROR_KEY);
        } catch { }

        return {
            configured: true,
            apiKeyValid,
            totalProxiesInWebshare,
            totalProxiesInDb: dbProxies.length,
            lastSyncAt,
            lastSyncError,
        };
    }

    // ==================== PROXY CONFIG ====================

    /**
     * Fetch current proxy configuration from Webshare.
     */
    async getProxyConfig(): Promise<any> {
        this.ensureConfigured();

        try {
            const response = await this.client.get('/proxy/config/');
            return response.data;
        } catch (error) {
            this.logger.error(`Failed to fetch proxy config: ${error.message}`);
            throw error;
        }
    }

    // ==================== HELPERS ====================

    private ensureConfigured(): void {
        if (!this.configured) {
            throw new Error('Webshare proxy module is not configured. Set WEBSHARE_API_KEY environment variable.');
        }
    }

    private webshareToDto(proxy: WebshareProxy): CreateProxyIpDto {
        return {
            ipAddress: proxy.proxy_address,
            port: proxy.port,
            protocol: 'socks5', // Webshare residential proxies use SOCKS5
            username: proxy.username,
            password: proxy.password,
            status: proxy.valid ? 'active' : 'inactive',
            source: SOURCE_NAME,
            webshareId: proxy.id,
            countryCode: proxy.country_code,
            cityName: proxy.city_name,
        };
    }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd /home/SaiKumar.Shetty/Documents/Projects/local/CommonTgService-local && npx tsc --noEmit --pretty 2>&1 | head -30`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/webshare-proxy/webshare-proxy.service.ts
git commit -m "feat(webshare-proxy): add WebshareProxyService with sync, replace, refresh, and status"
```

---

## Task 8: Create WebshareProxyController

**Files:**
- Create: `src/components/webshare-proxy/webshare-proxy.controller.ts`

- [ ] **Step 1: Create the controller**

Create `src/components/webshare-proxy/webshare-proxy.controller.ts`:

```typescript
import { Controller, Get, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiOkResponse,
    ApiBadRequestResponse,
    ApiBody,
} from '@nestjs/swagger';
import { WebshareProxyService } from './webshare-proxy.service';
import { SyncProxiesDto, SyncResultDto } from './dto/sync-proxies.dto';
import { ReplaceProxyDto, ReplaceResultDto } from './dto/replace-proxy.dto';
import { WebshareStatusDto } from './dto/webshare-config.dto';

@ApiTags('Webshare Proxy')
@Controller('webshare-proxy')
export class WebshareProxyController {
    constructor(private readonly webshareProxyService: WebshareProxyService) {}

    @Get('status')
    @ApiOperation({
        summary: 'Get Webshare integration status',
        description: 'Returns API key validity, proxy counts in Webshare vs DB, last sync timestamp and errors'
    })
    @ApiOkResponse({ description: 'Status retrieved', type: WebshareStatusDto })
    async getStatus(): Promise<WebshareStatusDto> {
        try {
            return await this.webshareProxyService.getStatus();
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Post('sync')
    @ApiOperation({
        summary: 'Sync proxies from Webshare',
        description: 'Fetches all proxies from Webshare API and upserts them into the local IP pool. Optionally removes stale proxies no longer in Webshare.'
    })
    @ApiBody({ type: SyncProxiesDto, required: false })
    @ApiOkResponse({ description: 'Sync completed', type: SyncResultDto })
    @ApiBadRequestResponse({ description: 'Webshare not configured or sync failed' })
    async syncProxies(@Body() dto?: SyncProxiesDto): Promise<SyncResultDto> {
        try {
            const removeStale = dto?.removeStale !== false; // default true
            return await this.webshareProxyService.syncProxies(removeStale);
        } catch (error) {
            throw new HttpException(
                `Sync failed: ${error.message}`,
                HttpStatus.BAD_REQUEST
            );
        }
    }

    @Post('refresh')
    @ApiOperation({
        summary: 'Refresh proxy list on Webshare and sync',
        description: 'Triggers Webshare to refresh their proxy list, waits briefly, then syncs the updated list to local DB'
    })
    @ApiOkResponse({ description: 'Refresh and sync completed', type: SyncResultDto })
    async refreshAndSync(): Promise<SyncResultDto> {
        try {
            return await this.webshareProxyService.refreshAndSync();
        } catch (error) {
            throw new HttpException(
                `Refresh failed: ${error.message}`,
                HttpStatus.BAD_REQUEST
            );
        }
    }

    @Post('replace')
    @ApiOperation({
        summary: 'Replace a dead Webshare proxy',
        description: 'Marks the proxy as inactive locally and requests Webshare to provide a replacement. Only works for proxies sourced from Webshare.'
    })
    @ApiBody({ type: ReplaceProxyDto })
    @ApiOkResponse({ description: 'Replacement result', type: ReplaceResultDto })
    async replaceProxy(@Body() dto: ReplaceProxyDto): Promise<ReplaceResultDto> {
        try {
            return await this.webshareProxyService.replaceProxy(
                dto.ipAddress,
                dto.port,
                dto.preferredCountry
            );
        } catch (error) {
            throw new HttpException(
                `Replace failed: ${error.message}`,
                HttpStatus.BAD_REQUEST
            );
        }
    }

    @Get('config')
    @ApiOperation({
        summary: 'Get current Webshare proxy configuration',
        description: 'Fetches the proxy configuration directly from Webshare API (username, timeout settings, authorized IPs, etc.)'
    })
    @ApiOkResponse({ description: 'Webshare config retrieved' })
    async getProxyConfig() {
        try {
            return await this.webshareProxyService.getProxyConfig();
        } catch (error) {
            throw new HttpException(
                `Failed to get config: ${error.message}`,
                HttpStatus.BAD_REQUEST
            );
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/webshare-proxy/webshare-proxy.controller.ts
git commit -m "feat(webshare-proxy): add controller with sync, refresh, replace, status, and config endpoints"
```

---

## Task 9: Create WebshareProxyModule and Wire Everything

**Files:**
- Create: `src/components/webshare-proxy/webshare-proxy.module.ts`
- Create: `src/components/webshare-proxy/index.ts`
- Modify: `src/components/index.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Create the module**

Create `src/components/webshare-proxy/webshare-proxy.module.ts`:

```typescript
import { Module, forwardRef } from '@nestjs/common';
import { WebshareProxyController } from './webshare-proxy.controller';
import { WebshareProxyService } from './webshare-proxy.service';
import { IpManagementModule } from '../ip-management/ip-management.module';

@Module({
    imports: [
        forwardRef(() => IpManagementModule),
    ],
    controllers: [WebshareProxyController],
    providers: [WebshareProxyService],
    exports: [WebshareProxyService],
})
export class WebshareProxyModule {}
```

- [ ] **Step 2: Create barrel export**

Create `src/components/webshare-proxy/index.ts`:

```typescript
export * from './webshare-proxy.module';
export * from './webshare-proxy.service';
export * from './webshare-proxy.controller';
export * from './dto/sync-proxies.dto';
export * from './dto/replace-proxy.dto';
export * from './dto/webshare-config.dto';
export * from './interfaces/webshare-types';
```

- [ ] **Step 3: Add to components barrel export**

Add to `src/components/index.ts` after the IP Management section:

```typescript
// Webshare Proxy Integration
export * from './webshare-proxy';
```

- [ ] **Step 4: Register in AppModule**

In `src/app.module.ts`, add the import at the top with the other imports:

```typescript
import { WebshareProxyModule } from './components/webshare-proxy/webshare-proxy.module';
```

And add `WebshareProxyModule` to the imports array (after `IpManagementModule`):

```typescript
imports: [
    InitModule,
    TelegramModule,
    BotsModule,
    ActiveChannelsModule,
    ClientModule,
    SessionModule,
    IpManagementModule,
    WebshareProxyModule,   // <-- add this line
    UserDataModule,
    // ... rest stays the same
],
```

- [ ] **Step 5: Verify full compilation**

Run: `cd /home/SaiKumar.Shetty/Documents/Projects/local/CommonTgService-local && npx tsc --noEmit --pretty 2>&1 | head -30`

Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/components/webshare-proxy/webshare-proxy.module.ts src/components/webshare-proxy/index.ts src/components/index.ts src/app.module.ts
git commit -m "feat(webshare-proxy): register WebshareProxyModule in app, add barrel exports"
```

---

## Task 10: Remove forwardRef to ClientModule and PromoteClientModule from IpManagementModule

The `IpManagementModule` currently imports `ClientModule` and `PromoteClientModule` via `forwardRef`, but neither is actually used by the service (no injection). These are leftover imports. Clean them up.

**Files:**
- Modify: `src/components/ip-management/ip-management.module.ts`

- [ ] **Step 1: Remove unused imports**

Replace `src/components/ip-management/ip-management.module.ts` with:

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IpManagementController } from './ip-management.controller';
import { IpManagementService } from './ip-management.service';
import { ProxyIp, ProxyIpSchema } from './schemas/proxy-ip.schema';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: ProxyIp.name, schema: ProxyIpSchema },
        ]),
    ],
    controllers: [IpManagementController],
    providers: [IpManagementService],
    exports: [IpManagementService]
})
export class IpManagementModule { }
```

- [ ] **Step 2: Verify compilation**

Run: `cd /home/SaiKumar.Shetty/Documents/Projects/local/CommonTgService-local && npx tsc --noEmit --pretty 2>&1 | head -30`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ip-management/ip-management.module.ts
git commit -m "refactor(ip-management): remove unused ClientModule and PromoteClientModule imports"
```

---

## Task 11: Verify Full Build and Manual Smoke Test

- [ ] **Step 1: Run TypeScript compilation**

Run: `cd /home/SaiKumar.Shetty/Documents/Projects/local/CommonTgService-local && npx tsc --noEmit --pretty`

Expected: Clean compilation, no errors.

- [ ] **Step 2: Check that the app boots (if possible)**

Run: `cd /home/SaiKumar.Shetty/Documents/Projects/local/CommonTgService-local && timeout 15 npx nest start 2>&1 | tail -20`

Look for:
- `IpManagementController {/ip-management}` mapped routes including `/proxy-ips/next`
- `WebshareProxyController {/webshare-proxy}` mapped routes
- No startup errors

If `WEBSHARE_API_KEY` is not set, expect: `WEBSHARE_API_KEY not set — Webshare proxy module is disabled` warning — this is correct behavior.

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve any compilation or startup issues"
```

---

## Summary of New/Changed Endpoints

### IP Management (`/ip-management/`)

| Method | Route | New? | Description |
|--------|-------|------|-------------|
| `GET` | `/proxy-ips/next?clientId=&countryCode=&protocol=` | **NEW** | Round-robin next IP |
| `GET` | `/stats` | **NEW** | Pool stats with source breakdown |
| `POST` | `/proxy-ips` | existing | Now accepts `source`, `webshareId`, `countryCode`, `cityName` |
| `POST` | `/proxy-ips/bulk` | existing | Same new optional fields |
| `GET` | `/proxy-ips` | existing | Returns new fields |
| `GET` | `/proxy-ips/:ip/:port` | existing | Returns new fields |
| `PUT` | `/proxy-ips/:ip/:port` | existing | Can update new fields |
| `DELETE` | `/proxy-ips/:ip/:port` | existing | Unchanged |
| `GET` | `/clients/:clientId/assigned-ips` | existing | Unchanged (backward compat) |
| `GET` | `/available-count` | existing | Unchanged |
| `GET` | `/health` | existing | Unchanged |

### Webshare Proxy (`/webshare-proxy/`)

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/status` | Integration status (API key validity, counts, last sync) |
| `POST` | `/sync` | Fetch all from Webshare, upsert into pool |
| `POST` | `/refresh` | Trigger Webshare refresh then sync |
| `POST` | `/replace` | Replace a dead Webshare proxy |
| `GET` | `/config` | Get Webshare proxy configuration |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WEBSHARE_API_KEY` | _(none)_ | **Required** for Webshare integration |
| `WEBSHARE_API_URL` | `https://proxy.webshare.io/api/v2` | Webshare API base URL |
| `WEBSHARE_API_TIMEOUT` | `10000` | Request timeout in ms |

## Backward Compatibility

- All existing `/ip-management/` endpoints work identically
- `GET /clients/:clientId/assigned-ips` still works — assignment is optional, not removed
- `generateTGConfig.ts` HTTP consumption unchanged — it still calls the same endpoints
- New schema fields have defaults (`source='manual'`, `consecutiveFails=0`, etc.) so existing documents don't break
- The `isAssigned` and `assignedToClient` fields remain — they're just no longer required for `getNextIp`
