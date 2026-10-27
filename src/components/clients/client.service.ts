import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  forwardRef,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { BUFFER_PROFILE } from '../shared/onboarding/pool-profile';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { Client, ClientDocument } from './schemas/client.schema';
import { CreateClientDto } from './dto/create-client.dto';
import { SetupClientQueryDto } from './dto/setup-client.dto';
import { BufferClientService } from '../buffer-clients/buffer-client.service';
import { sleep } from 'telegram/Helpers';
import { UsersService } from '../users/users.service';
import {
  getReadableTimeDifference,
  Logger,
  toBoolean,
} from '../../utils';
import { UpdateClientDto } from './dto/update-client.dto';
import { CreateBufferClientDto } from '../buffer-clients/dto/create-buffer-client.dto';
import { UpdateBufferClientDto } from '../buffer-clients/dto/update-buffer-client.dto';
import { SearchClientDto } from './dto/search-client.dto';
import { ExecuteClientQueryDto } from './dto/execute-client-query.dto';
import { parseError } from '../../utils/parseError';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { sendBotNotice } from '../../utils/bot-notice';
import type { NotificationTable, RichNotificationInput } from '../../utils/rich-message';
import { connectionManager } from '../Telegram/utils/connection-manager';
import { SortOrder } from 'mongoose';
import path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { Api } from 'telegram/tl';
import isPermanentError from '../../utils/isPermanentError';
import { TelegramService } from '../Telegram/Telegram.service';
import TelegramManager from '../Telegram/TelegramManager';
import { User } from '../users';
import { bioMatches, lastNameMatches, nameMatchesAssignment } from '../../utils/homoglyph-normalizer';
import { WarmupPhase, MIN_CHANNELS_FOR_MATURING } from '../shared/warmup-phases';
import { ClientHelperUtils } from '../shared/client-helper.utils';
import { ActiveClientSetup } from '../Telegram/manager/types';
import { downloadFileFromUrl } from '../Telegram/manager/helpers';
import { canonicalizeMobile } from '../shared/mobile-utils';
import { buildSpamEligibleFilter } from '../buffer-clients/schemas/buffer-client.schema';
import { probeSpamBot, SpamProbeResult, SPAMBOT_TOTAL_TIMEOUT_MS } from '../Telegram/utils/spambot-probe';
import {
  buildTier3Query,
  buildTier4Query,
  ClientDegradedState,
  DEAD_MAIN_HANDOFF_WAIT_MS,
  DEAD_MAIN_RESCUE_REASON,
  DEGRADED_UPGRADE_REASON,
  isDeadMainEvidence,
  leaseFreeFilter,
  MAIN_SPAM_STATUS_FRESH_MS,
  SWAP_LEASE_RENEW_MS,
  SWAP_LEASE_TTL_MS,
  SWAP_REPORT_GRACE_MS,
  UPGRADE_MAX_PER_RUN,
  DegradedTier,
  isDeadSwapReason,
  last4,
  markerTierFromVerdict,
  parseDegradedSwapTiers,
  passRetryDelayMs,
  PASS_MAX_ATTEMPTS,
  swapPoolFingerprint,
  swapRetryDecision,
  type ClientSwapRetryState,
  type PoolFingerprintRow,
  type SwapRetryDecision,
  type SwapRetryPass,
  POOL_REFILL_MAX_PER_RUN,
  POOL_REFILL_REASON,
  probeAcceptanceForTier,
  RESCUE_MAX_PER_RUN,
  SIBLING_MIN_SPARES_AFTER,
  SwapProbeAcceptance,
} from './degraded-swap';

// Configuration constants
const CONFIG = {
  REFRESH_INTERVAL: 5 * 60 * 1000, // 5 minutes
  CACHE_TTL: 10 * 60 * 1000, // 10 minutes
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 second
  CACHE_WARMUP_THRESHOLD: 20,
  COOLDOWN_PERIOD: 240000, // 4 minutes
  UPDATE_CLIENT_COOLDOWN: 30000, // 30 seconds
  MAP_CLEANUP_INTERVAL: 10 * 60 * 1000, // 10 minutes
};

interface CacheMetadata {
  lastUpdated: number;
  isStale: boolean;
}

/** A buffer account whose last 'free' verdict is younger than this is not re-probed before a swap. */
const SPAM_FREE_FRESH_MS = 6 * 60 * 60 * 1000;
/**
 * Probe limits per /setupClient request. tg-aut calls /setupClient through fetchWithTimeout
 * (30s per attempt, +5s per retry, up to 3 retries; retries join the in-flight setup via
 * setupInFlightMap). One probe is hard-capped at 25s (connect + <=15s reply poll), so we allow at
 * most 3 probes and stop starting new ones once 45s of probing has been spent.
 */
const MAX_SETUP_PROBES = 3;
const SETUP_PROBE_TIME_BUDGET_MS = 45_000;
/** Do not start a probe with less than this left of the request budget; it could not finish. */
const MIN_SETUP_PROBE_MS = 8_000;

interface SetupProbeBudget {
  clientId: string;
  remaining: number;
  spentMs: number;
  /** Concise probe outcomes of skipped candidates, appended to the swap notifications. */
  skipped: string[];
  /** True when an unprobed candidate was passed over only because this budget ran out. */
  moreCandidatesPending?: boolean;
  /** Verdict of the candidate isSpamSafeForSwap last accepted (read right after a true return). */
  lastVerdict?: { status: SpamProbeResult['status']; limitedUntil: Date | null };
  /** Cross-process lease owner of this setup run: every candidate is leased before any probe/connect. */
  leaseOwner?: string;
  /** Swap-maintenance job run: never create a backup session; candidates need a stored distinct one. */
  jobPass?: boolean;
}

/** One row of a swap-maintenance pass (rescue / upgrade / pool refill). */
export interface SwapMaintenanceResult {
  clientId: string;
  status: SetupClientStatus | 'cleared' | 'skipped_cooldown' | 'stopped' | 'waiting_handoff';
  /** rescue / upgrade / refill: attempts used in this episode after this run. */
  attempts?: number;
  /** rescue / upgrade / refill: the pool changed since the last attempt, so a stopped or cooling episode re-armed. */
  rearmed?: boolean;
  fromTier?: DegradedTier;
  degradedTier?: DegradedTier;
  newMobile?: string;
}

interface SafeSetupBufferCandidate {
  mobile: string;
  session: string;
  backupUser: User;
  /** SpamBot verdict the candidate was accepted on (degraded tiers accept limited/harsh). */
  spamStatus?: SpamProbeResult['status'];
  limitedUntil?: Date | null;
}

/**
 * A degraded-tier pick, carried from selection to the cutover commit (keyed by clientId + new mobile,
 * so one client's plan can never be applied to another client's cutover of the same mobile).
 */
interface DegradedSwapPlan {
  clientId: string;
  /** Tier the candidate was found in. */
  pickTier: DegradedTier;
  /**
   * Tier stamped on clients.degraded, from the probe verdict (markerTierFromVerdict). null = the
   * account meets tier-1 rules (a borrowed sibling spare, or a limited/harsh pick that probed free):
   * no marker, and the commit clears any old one.
   */
  markerTier: DegradedTier | null;
  reason: string;
  fromMobile: string;
  limitedUntil: Date | null;
  since: Date;
  /** Tier 2: sibling clientId the buffer is reassigned from inside the cutover transaction. */
  fromClientId?: string;
}

/** Internal-only setup options; never reachable from the HTTP query. */
interface SetupInternalOptions {
  /** Upgrade-job run for a client currently degraded at this tier: only strictly better tiers. */
  upgradeFromTier?: DegradedTier;
  /** Swap-maintenance job pass (rescue / upgrade / refill): see SetupProbeBudget.jobPass. */
  jobPass?: boolean;
  /** Set by runSetup: the owner of this run's clients.swapLease and bufferClients.probeLease rows. */
  leaseOwner?: string;
}

export type SetupClientStatus =
  | 'swapped'
  | 'disabled'
  | 'cooldown'
  | 'client_not_found'
  | 'no_candidate'
  | 'failed'
  /** The caller's reportedMobile is not this client's main any more (a late report from a replaced process). Nothing was done. */
  | 'stale_report';

export interface SetupClientResult {
  status: SetupClientStatus;
  swapped: boolean;
  clientId: string;
  message: string;
  existingMobile?: string;
  newMobile?: string;
  cooldownRemainingMs?: number;
  existingRetired?: boolean;
  usedFutureAvailableFallback?: boolean;
  /** no_candidate only: unprobed candidates remain; the probe budget ran out, so retrying may find one. */
  moreCandidatesPending?: boolean;
  /** swapped only: the new account is a degraded-swap pick of this tier (2 sibling, 3 limited, 4 harsh). */
  degradedTier?: DegradedTier;
  /** no_candidate only: the client already runs degraded; the CMS upgrade job owns moving it up. */
  degraded?: boolean;
}

export interface PersonaAssignmentRecord {
  mobile: string;
  assignedFirstName: string | null;
  assignedLastName: string | null;
  assignedBio: string | null;
  assignedProfilePics: string[];
  source: 'buffer' | 'promote' | 'activeClient';
}

interface BufferPersonaAssignmentDoc {
  mobile: string;
  assignedFirstName?: string | null;
  assignedLastName?: string | null;
  assignedBio?: string | null;
  assignedProfilePics?: string[];
}

interface PersonaAssignmentLike {
  assignedFirstName?: string | null;
  assignedLastName?: string | null;
  assignedBio?: string | null;
  assignedProfilePics?: string[];
}

type ClientSearchFilter = Partial<SearchClientDto>;
type ClientMongoQuery = Record<string, unknown>;
type ClientQuerySort = Record<string, SortOrder | { $meta: unknown }>;
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

@Injectable()
export class ClientService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(ClientService.name);
  private lastUpdateMap: Map<string, number> = new Map();
  private setupCooldownMap: Map<string, number> = new Map();
  /**
   * Coalesce concurrent setup requests for the same logical client. A swap can
   * open a Telegram session before the database cutover, so allowing two local
   * requests through the cooldown check would race on a non-renewable session.
   */
  private setupInFlightMap: Map<string, Promise<SetupClientResult>> = new Map();
  /** How often a running setup renews its leases (a field so tests can shorten it). */
  protected leaseRenewMs = SWAP_LEASE_RENEW_MS;
  /** Degraded-tier picks between selection and cutover, keyed by `clientId:newMobile`. */
  private degradedPlans: Map<string, DegradedSwapPlan> = new Map();
  /**
   * "No buffer" notices already sent this episode (`clientId:currentMobile:dead|normal`). A new
   * current mobile (any swap, a manual fix, another process) is a new episode; a swap here also
   * clears the client's keys.
   */
  private noBufferNoticeEpisodes: Set<string> = new Set();
  private clientsMap: Map<string, Client> = new Map();
  private cacheMetadata: CacheMetadata = { lastUpdated: 0, isStale: true };
  private checkInterval: NodeJS.Timeout | null = null;
  private refreshInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;
  private isShuttingDown = false;
  private refreshPromise: Promise<void> | null = null;

  constructor(
    @InjectModel(Client.name) private readonly clientModel: Model<ClientDocument>,
    @Inject(forwardRef(() => TelegramService))
    private readonly telegramService: TelegramService,
    @Inject(forwardRef(() => BufferClientService))
    private readonly bufferClientService: BufferClientService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) { }

  async onModuleInit(): Promise<void> {
    try {
      await this.refreshCacheFromDatabase();
      this.startPeriodicTasks();
      this.isInitialized = true;
    } catch (e) {
      parseError(e, 'Failed to initialize Client Service')
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;
    try {
      if (this.checkInterval) clearInterval(this.checkInterval);
      if (this.refreshInterval) clearInterval(this.refreshInterval);
      if (this.cleanupInterval) clearInterval(this.cleanupInterval);
      if (this.refreshPromise) await this.refreshPromise;
      await connectionManager.shutdown();
      this.clientsMap.clear();
      this.lastUpdateMap.clear();
      this.setupCooldownMap.clear();
      this.setupInFlightMap.clear();
    } catch (e) {
      parseError(e, 'Error during Client Service shutdown');
    }
  }

  private startPeriodicTasks(): void {
    this.checkInterval = setInterval(async () => {
      if (this.isShuttingDown) return;
      await this.performPeriodicRefresh();
    }, CONFIG.REFRESH_INTERVAL);
    this.checkInterval.unref();

    this.refreshInterval = setInterval(() => {
      if (this.isShuttingDown) return;
      this.updateCacheMetadata();
    }, 60000);
    this.refreshInterval.unref();

    this.cleanupInterval = setInterval(() => {
      if (this.isShuttingDown) return;
      this.purgeExpiredCooldowns();
    }, CONFIG.MAP_CLEANUP_INTERVAL);
    this.cleanupInterval.unref();
  }

  private purgeExpiredCooldowns(): void {
    const now = Date.now();
    for (const [clientId, timestamp] of this.setupCooldownMap) {
      if (now > timestamp + CONFIG.COOLDOWN_PERIOD) {
        this.setupCooldownMap.delete(clientId);
      }
    }
    for (const [clientId, timestamp] of this.lastUpdateMap) {
      if (now - timestamp > CONFIG.UPDATE_CLIENT_COOLDOWN) {
        this.lastUpdateMap.delete(clientId);
      }
    }
  }

  private async performPeriodicRefresh(): Promise<void> {
    if (this.refreshPromise) {
      this.logger.debug('Refresh already in progress, skipping...');
      return;
    }
    this.refreshPromise = this.refreshCacheFromDatabase();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private updateCacheMetadata(): void {
    this.cacheMetadata.isStale = Date.now() - this.cacheMetadata.lastUpdated > CONFIG.CACHE_TTL;
  }

  private async refreshCacheFromDatabase(): Promise<void> {
    try {
      const documents = await this.executeWithRetry(() =>
        this.clientModel.find({}, { _id: 0, updatedAt: 0 }).lean().exec(),
      );
      const newClientsMap = new Map<string, Client>();
      documents.forEach((client) => newClientsMap.set(client.clientId, client));
      this.clientsMap = newClientsMap;
      this.cacheMetadata = { lastUpdated: Date.now(), isStale: false };
    } catch (e) {
      parseError(e, 'Failed to refresh clients cache from database', true);
    }
  }

  async create(createClientDto: CreateClientDto): Promise<Client> {
    const createData: CreateClientDto = {
      ...createClientDto,
      mobile: this.canonicalMobile(createClientDto.mobile),
    };
    try {
      const createdClient = await this.executeWithRetry(() => {
        const client = new this.clientModel(createData);
        return client.save();
      });
      this.clientsMap.set(createdClient.clientId, createdClient.toObject());
      this.logger.log(`Client created: ${createdClient.clientId}`);
      return createdClient;
    } catch (error) {
      const errorDetails = parseError(error, `Failed to create client | mobile: ${createData.mobile}`);
      throw new BadRequestException(errorDetails.message);
    }
  }

  async findAll(): Promise<Client[]> {
    this.ensureInitialized();
    if (
      this.clientsMap.size >= CONFIG.CACHE_WARMUP_THRESHOLD &&
      !this.cacheMetadata.isStale
    ) {
      this.logger.debug(`Retrieved ${this.clientsMap.size} clients from cache`);
      return Array.from(this.clientsMap.values());
    }
    await this.refreshCacheFromDatabase();
    return Array.from(this.clientsMap.values());
  }

  async findAllMasked(): Promise<Partial<Client>[]> {
    const clients = await this.findAll();
    // `degraded` holds a mobile (fromMobile) and is internal; keep the masked shape unchanged.
    return clients.map(({ session, mobile, password, degraded, swapRetry, deadMain, swapLease, swappedAt, sessionChangedAt, ...maskedClient }) => maskedClient);
  }

  async findOneMasked(clientId: string): Promise<Partial<Client>> {
    const client = await this.findOne(clientId, true);
    const { session, mobile, password, degraded, swapRetry, deadMain, swapLease, swappedAt, sessionChangedAt, ...maskedClient } = client;
    return maskedClient;
  }

  async findAllObject(): Promise<Record<string, Client>> {
    const clients = await this.findAll();
    return clients.reduce((acc, client) => {
      acc[client.clientId] = client;
      return acc;
    }, {} as Record<string, Client>);
  }

  async findAllMaskedObject(query?: SearchClientDto): Promise<Record<string, Partial<Client>>> {
    const filteredClients = query ? await this.search(query) : await this.findAll();
    return filteredClients.reduce((acc, client) => {
      const { session, mobile, password, degraded, swapRetry, deadMain, swapLease, swappedAt, sessionChangedAt, ...maskedClient } = client;
      acc[client.clientId] = { clientId: client.clientId, ...maskedClient };
      return acc;
    }, {} as Record<string, Partial<Client>>);
  }

  async refreshMap(): Promise<void> {
    this.logger.log('Manual cache refresh requested');
    await this.refreshCacheFromDatabase();
  }

  async findOne(clientId: string, throwErr: boolean = true): Promise<Client | null> {
    this.ensureInitialized();
    const cachedClient = this.clientsMap.get(clientId);
    if (cachedClient) return cachedClient;
    const client = await this.executeWithRetry(() =>
      this.clientModel.findOne({ clientId }, { _id: 0, updatedAt: 0 }).lean().exec(),
    );
    if (!client && throwErr) {
      throw new NotFoundException(`Client with ID "${clientId}" not found`);
    }
    if (client) this.clientsMap.set(clientId, client);
    return client;
  }

  async update(clientId: string, updateClientDto: UpdateClientDto): Promise<Client> {
    this.ensureInitialized();
    // Guard the active session against blank/whitespace overwrites. Mongoose `required`
    // treats a whitespace-only string as present, so without this a stray update with
    // session '' or '   ' would silently destroy the live (non-renewable) session =>
    // permanent account loss. session is non-renewable; never let it be cleared via update.
    if (updateClientDto.session !== undefined &&
        (updateClientDto.session === null || !String(updateClientDto.session).trim())) {
      throw new BadRequestException('Cannot update client with a blank session');
    }
    try {
      const cleanUpdateDto: Mutable<UpdateClientDto> = this.cleanUpdateObject(updateClientDto);
      if (cleanUpdateDto.mobile !== undefined) {
        cleanUpdateDto.mobile = this.canonicalMobile(cleanUpdateDto.mobile);
      }
      await this.notifyClientUpdate(clientId);
      // A manual mobile change installs an account the degraded marker does not describe: drop the
      // marker (unless this update sets one itself), or the upgrade job would swap that account out.
      // The dead-main evidence describes the old mobile / old session only: a new mobile or a new
      // session (a manual re-login: the account was fixed) drops it, or rescue would retire a healthy main.
      let clientUpdate: Record<string, unknown> = { $set: cleanUpdateDto };
      if (cleanUpdateDto.mobile !== undefined || cleanUpdateDto.session !== undefined) {
        const current = await this.clientModel.findOne({ clientId }, { mobile: 1, session: 1, degraded: 1, deadMain: 1 })
          .lean<Pick<Client, 'mobile' | 'session' | 'degraded' | 'deadMain'>>().exec();
        const mobileChanged = !!current && cleanUpdateDto.mobile !== undefined && this.canonicalMobile(current.mobile) !== cleanUpdateDto.mobile;
        const sessionChanged = !!current && cleanUpdateDto.session !== undefined && current.session !== cleanUpdateDto.session;
        const unset: Record<string, ''> = {};
        if (mobileChanged && current!.degraded && (cleanUpdateDto as { degraded?: unknown }).degraded === undefined) {
          unset.degraded = '';
          this.logger.warn(`[${clientId}] Mobile changed by update; clearing the degraded marker (tier ${current!.degraded.tier})`);
        }
        if ((mobileChanged || sessionChanged) && current!.deadMain && (cleanUpdateDto as { deadMain?: unknown }).deadMain === undefined) {
          unset.deadMain = '';
          this.logger.warn(`[${clientId}] ${mobileChanged ? 'Mobile' : 'Session'} changed by update; clearing the dead-main report`);
        }
        // A new session opens the late-report window like a cutover: the running tg-aut
        // process still holds the old session until its restart. A session-only fix keeps the mobile,
        // so reportedMobile cannot tell the old process from the restarted one: sessionChangedAt holds
        // those reports for the window too (screenSetupReport).
        const extraSet: Record<string, unknown> = {};
        if (sessionChanged) extraSet.swappedAt = new Date();
        if (sessionChanged && !mobileChanged) extraSet.sessionChangedAt = extraSet.swappedAt;
        else if (mobileChanged) unset.sessionChangedAt = '';
        if (Object.keys(unset).length || Object.keys(extraSet).length) {
          clientUpdate = { $set: { ...cleanUpdateDto, ...extraSet }, ...(Object.keys(unset).length ? { $unset: unset } : {}) };
        }
      }
      const updatedClient = await this.executeWithRetry(() =>
        this.clientModel
          .findOneAndUpdate(
            { clientId },
            clientUpdate,
            { returnDocument: 'after', runValidators: true },
          )
          .lean()
          .exec(),
      );
      if (!updatedClient) {
        throw new NotFoundException(`Client with ID "${clientId}" not found`);
      }
      this.clientsMap.set(clientId, updatedClient);
      this.performPostUpdateTasks(updatedClient);
      this.logger.log(`Client updated: ${clientId}`);
      return updatedClient;
    } catch (error) {
      const errorDetails = parseError(error, `Failed to update client ${clientId} | mobile: ${updateClientDto.mobile || 'N/A'}`);
      throw new BadRequestException(errorDetails.message);
    }
  }

  async remove(clientId: string): Promise<Client> {
    this.ensureInitialized();
    try {
      const deletedClient = await this.executeWithRetry(() =>
        this.clientModel.findOneAndDelete({ clientId }).lean().exec(),
      );
      if (!deletedClient) {
        throw new NotFoundException(`Client with ID "${clientId}" not found`);
      }
      this.clientsMap.delete(clientId);
      this.logger.log(`Client removed: ${clientId}`);
      return deletedClient;
    } catch (error) {
      const errorDetails = parseError(error, `Failed to remove client ${clientId}`);
      throw new InternalServerErrorException(errorDetails.message);
    };
  }

  async search(filter: ClientSearchFilter | ClientMongoQuery): Promise<Client[]> {
    try {
      const workingFilter = this.processTextSearchFields({ ...filter });
      return this.executeWithRetry(() => this.clientModel.find(workingFilter).lean().exec());
    } catch (error) {
      const errorDetails = parseError(error, `Failed to search clients with filter ${JSON.stringify(filter)}`);
      throw new InternalServerErrorException(errorDetails.message);
    }
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Service not initialized. Please wait for initialization to complete.');
    }
  }

  private cleanUpdateObject(updateDto: UpdateClientDto): UpdateClientDto {
    const cleaned = { ...updateDto };
    delete (cleaned as Partial<{ _id: unknown }>)._id;
    return cleaned;
  }

  private canonicalMobile(mobile: string): string {
    try {
      return canonicalizeMobile(mobile);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(message);
    }
  }

  private async notifyClientUpdate(clientId: string): Promise<void> {
    await this.notify({ title: 'Updating client', fields: [{ label: 'Client ID', value: clientId }] });
  }

  private async notify(message: RichNotificationInput): Promise<void> {
    try {
      await sendBotNotice('notif', message, { timeout: 5000 });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('Failed to send notification', errorMessage);
    }
  }

  private performPostUpdateTasks(updatedClient: Client): void {
    setImmediate(async () => {
      try {
        await this.refreshExternalMaps();
      } catch (error) {
        parseError(error, 'Failed to refresh external maps after client update');
      }
    });
  }

  private async refreshExternalMaps(): Promise<void> {
    await Promise.allSettled([
      fetchWithTimeout(`${process.env.uptimeChecker}/refreshmap`, { timeout: 5000 }),
      fetchWithTimeout(`${process.env.uptimebot}/refreshmap`, { timeout: 5000 }),
    ]);
    this.logger.debug('External maps refreshed');
  }

  private processTextSearchFields(filter: ClientSearchFilter | ClientMongoQuery): ClientMongoQuery {
    const nextFilter: ClientMongoQuery = { ...(filter as ClientMongoQuery) };
    if (typeof nextFilter.mobile === 'string' && nextFilter.mobile) {
      nextFilter.mobile = this.canonicalMobile(nextFilter.mobile);
    }
    const textFields = ['name', 'clientId', 'username'];
    textFields.forEach((field) => {
      const value = nextFilter[field];
      if (typeof value === 'string' && value) {
        nextFilter[field] = { $regex: new RegExp(this.escapeRegex(value), 'i') };
      }
    });
    return nextFilter;
  }

  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async executeWithRetry<T>(operation: () => Promise<T>, retries = CONFIG.MAX_RETRIES): Promise<T> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await operation();
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Operation failed on attempt ${attempt}/${retries}`, errorMessage);
        if (attempt === retries) throw error;
        const delay = CONFIG.RETRY_DELAY * Math.pow(2, attempt - 1);
        await this.sleep(delay);
      }
    }
    throw new Error('All retry attempts failed');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getServiceStatus(): {
    isInitialized: boolean;
    cacheSize: number;
    lastCacheUpdate: Date;
    isCacheStale: boolean;
    isShuttingDown: boolean;
  } {
    return {
      isInitialized: this.isInitialized,
      cacheSize: this.clientsMap.size,
      lastCacheUpdate: new Date(this.cacheMetadata.lastUpdated),
      isCacheStale: this.cacheMetadata.isStale,
      isShuttingDown: this.isShuttingDown,
    };
  }

  async getCacheStatistics(): Promise<{
    totalClients: number;
    cacheHitRate: number;
    lastRefresh: Date;
    memoryUsage: number;
  }> {
    const totalClients = await this.clientModel.countDocuments().exec();
    return {
      totalClients,
      cacheHitRate: this.clientsMap.size > 0 ? (this.clientsMap.size / totalClients) * 100 : 0,
      lastRefresh: new Date(this.cacheMetadata.lastUpdated),
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
    };
  }

  async setupClient(clientId: string, setupClientQueryDto: SetupClientQueryDto): Promise<SetupClientResult> {
    const screen = await this.screenSetupReport(clientId, setupClientQueryDto);
    if (screen.answer) return screen.answer;
    // A pinned ?mobile= call is an operator choice, not tg-aut evidence about the live session.
    if (screen.mobile && !setupClientQueryDto?.mobile) {
      await this.recordDeadMainReport(clientId, screen.mobile, setupClientQueryDto?.reason);
    }
    return this.runSetup(clientId, setupClientQueryDto, {});
  }

  /**
   * HTTP /setupClient only (job passes call runSetup). A report is about the mobile tg-aut runs on,
   * which after a cutover may no longer be the client's main:
   *  - reportedMobile present and not clients.mobile: stale_report, nothing done (no swap, no deadMain);
   *  - reportedMobile absent (old bundle), a reason given, no pinned mobile, and a cutover less than
   *    SWAP_REPORT_GRACE_MS ago: answered 'cooldown' (old bundles know it) and nothing done.
   * Returns the mobile the report is about (the screened main) for the deadMain write.
   */
  private async screenSetupReport(
    clientId: string,
    dto: SetupClientQueryDto,
  ): Promise<{ answer?: SetupClientResult; mobile?: string }> {
    let current: Pick<Client, 'mobile' | 'swappedAt' | 'sessionChangedAt'> | null;
    try {
      current = await this.clientModel.findOne({ clientId }, { mobile: 1, swappedAt: 1, sessionChangedAt: 1 })
        .lean<Pick<Client, 'mobile' | 'swappedAt' | 'sessionChangedAt'>>().exec();
    } catch (error) {
      this.logger.warn(`[${clientId}] Could not screen the setupClient report: ${parseError(error, '', false).message}`);
      return {};
    }
    if (!current?.mobile) return {}; // runSetup answers client_not_found
    let reported: string | undefined;
    if (dto?.reportedMobile) {
      try {
        reported = canonicalizeMobile(String(dto.reportedMobile));
      } catch {
        this.logger.warn(`[${clientId}] Unparseable reportedMobile ${last4(String(dto.reportedMobile))}; treated as absent`);
      }
    }
    const main = current.mobile;
    let mainCanonical = main;
    try { mainCanonical = canonicalizeMobile(main); } catch { /* compare as stored */ }
    if (reported) {
      if (reported === mainCanonical) {
        // Same mobile, but the session was just replaced by update(): this may be the process still
        // on the old session. Held for the window; a genuinely dead new session retries past it.
        const fixedAtMs = current.sessionChangedAt ? new Date(current.sessionChangedAt).getTime() : 0;
        const fixLeftMs = fixedAtMs + SWAP_REPORT_GRACE_MS - Date.now();
        if (dto?.reason && !dto?.mobile && fixedAtMs && fixLeftMs > 0) {
          this.logger.warn(`[${clientId}] setupClient report for the main ${Math.round((Date.now() - fixedAtMs) / 1000)}s after a session change; ignored (may be the process on the old session)`, { reason: dto.reason });
          return {
            answer: {
              status: 'cooldown',
              swapped: false,
              clientId,
              message: 'Client session was just changed; a report from the process on the old session is ignored',
              cooldownRemainingMs: fixLeftMs,
            },
          };
        }
        return { mobile: main };
      }
      this.logger.warn(`[${clientId}] Stale setupClient report for ${last4(reported)}; client now runs ${last4(main)}. Ignored`, { reason: dto?.reason });
      return {
        answer: {
          status: 'stale_report',
          swapped: false,
          clientId,
          message: `Report is for a mobile that is no longer this client's main (now ${last4(main)}); nothing done`,
          existingMobile: main,
        },
      };
    }
    const swappedAtMs = current.swappedAt ? new Date(current.swappedAt).getTime() : 0;
    const graceLeftMs = swappedAtMs + SWAP_REPORT_GRACE_MS - Date.now();
    if (dto?.reason && !dto?.mobile && swappedAtMs && graceLeftMs > 0) {
      this.logger.warn(`[${clientId}] setupClient report without reportedMobile ${Math.round((Date.now() - swappedAtMs) / 1000)}s after a cutover; ignored (may be the replaced process)`, { reason: dto.reason });
      return {
        answer: {
          status: 'cooldown',
          swapped: false,
          clientId,
          message: 'Client was just swapped; a report without reportedMobile may come from the replaced process and is ignored',
          cooldownRemainingMs: graceLeftMs,
        },
      };
    }
    return { mobile: main };
  }

  /**
   * /setupClient with a dead reason comes from tg-aut, the only process on the live session: the
   * one piece of evidence the rescue pass acts on. Stored on clients.deadMain for the screened main
   * (the write is guarded on it, so a cutover in between writes nothing), `at` = this report.
   * CMS-side errors (users / pool rows) describe the backup session and are never used for rescue.
   */
  private async recordDeadMainReport(clientId: string, mobile: string, reason?: string): Promise<void> {
    if (!reason || !isDeadSwapReason(reason) || reason.startsWith(DEAD_MAIN_RESCUE_REASON)) return;
    try {
      await this.clientModel.updateOne(
        { clientId, mobile },
        { $set: { deadMain: { mobile, reason: reason.substring(0, 200), at: new Date() } } },
      ).exec();
    } catch (error) {
      this.logger.warn(`[${clientId}] Could not record the dead-main report: ${parseError(error, '', false).message}`);
    }
  }

  private async runSetup(
    clientId: string,
    setupClientQueryDto: SetupClientQueryDto,
    internal: SetupInternalOptions,
  ): Promise<SetupClientResult> {
    this.logger.log(`Received New Client Request for - ${clientId}`);
    if (!toBoolean(process.env.AUTO_CLIENT_SETUP)) {
      this.logger.log('Auto client setup disabled');
      return {
        status: 'disabled',
        swapped: false,
        clientId,
        message: 'Auto client setup is disabled',
      };
    }
    if (!this.canSetupClient(clientId)) {
      const cooldownRemainingMs = Math.max(
        0,
        (this.setupCooldownMap.get(clientId) || 0) + CONFIG.COOLDOWN_PERIOD - Date.now(),
      );
      this.logger.log(
        `Profile Setup Recently tried for ${clientId}, wait ::`,
        getReadableTimeDifference(this.setupCooldownMap.get(clientId)!),
      );
      return {
        status: 'cooldown',
        swapped: false,
        clientId,
        message: 'Client setup is on cooldown',
        cooldownRemainingMs,
      };
    }
    const inFlight = this.setupInFlightMap.get(clientId);
    if (inFlight) {
      this.logger.warn(`[${clientId}] Setup already in progress; joining the existing request`);
      return inFlight;
    }

    let setupPromise!: Promise<SetupClientResult>;
    // Registered synchronously (before any await) so in-process callers join this run.
    setupPromise = this.runLeasedSetup(clientId, setupClientQueryDto, internal)
      .finally(() => {
        // Do not let an older promise remove a newer request should this method
        // ever be extended to replace entries rather than coalesce them.
        if (this.setupInFlightMap.get(clientId) === setupPromise) {
          this.setupInFlightMap.delete(clientId);
        }
      });
    this.setupInFlightMap.set(clientId, setupPromise);
    return setupPromise;
  }

  /**
   * Cross-process exclusivity between setupClient runs: the cms job and the ums / ums-test HTTP
   * processes share Mongo but not memory. clients.swapLease is taken atomically before any probe or
   * connection, renewed every SWAP_LEASE_RENEW_MS while the run lasts, and released in finally (TTL
   * SWAP_LEASE_TTL_MS frees a crashed holder); the run's probe leases go with it. Only setupClient
   * paths take these leases; other paths that connect sessions use their own in-process guards.
   */
  private async runLeasedSetup(
    clientId: string,
    setupClientQueryDto: SetupClientQueryDto,
    internal: SetupInternalOptions,
  ): Promise<SetupClientResult> {
    const leaseOwner = `${os.hostname()}:${process.pid}:${randomUUID()}`;
    const now = new Date();
    const leased = await this.clientModel.findOneAndUpdate(
      { clientId, ...leaseFreeFilter('swapLease', now) },
      { $set: { swapLease: { owner: leaseOwner, until: new Date(now.getTime() + SWAP_LEASE_TTL_MS) } } },
      { projection: { _id: 1 } },
    ).lean().exec();
    if (!leased) {
      const holder = await this.clientModel.findOne({ clientId }, { swapLease: 1 }).lean<Pick<Client, 'swapLease'>>().exec();
      if (holder) {
        const untilMs = holder.swapLease?.until ? new Date(holder.swapLease.until).getTime() : now.getTime();
        this.logger.warn(`[${clientId}] Setup already in progress in another CMS process (${holder.swapLease?.owner}); not started`);
        return {
          status: 'cooldown',
          swapped: false,
          clientId,
          message: 'Client setup is in progress in another CMS process',
          cooldownRemainingMs: Math.min(CONFIG.COOLDOWN_PERIOD, Math.max(0, untilMs - now.getTime())),
        };
      }
      // No such client: handleSetupClient answers client_not_found.
      return this.handleSetupClient(clientId, setupClientQueryDto, internal);
    }
    // Renew while running, so a long run (backup-session creation, slow connects) keeps its leases;
    // a crashed process stops renewing and its leases expire after SWAP_LEASE_TTL_MS.
    const renewal = setInterval(() => { void this.renewSetupLeases(clientId, leaseOwner); }, this.leaseRenewMs);
    renewal.unref?.();
    try {
      return await this.handleSetupClient(clientId, setupClientQueryDto, { ...internal, leaseOwner });
    } finally {
      clearInterval(renewal);
      try {
        await this.clientModel.updateOne({ clientId, 'swapLease.owner': leaseOwner }, { $unset: { swapLease: '' } }).exec();
        await this.bufferClientService.releaseProbeLeases(leaseOwner);
      } catch (error) {
        this.logger.warn(`[${clientId}] Lease release failed (expires in ${SWAP_LEASE_TTL_MS / 60_000} min): ${parseError(error, '', false).message}`);
      }
    }
  }

  private async renewSetupLeases(clientId: string, leaseOwner: string): Promise<void> {
    const until = new Date(Date.now() + SWAP_LEASE_TTL_MS);
    try {
      await this.clientModel.updateOne({ clientId, 'swapLease.owner': leaseOwner }, { $set: { 'swapLease.until': until } }).exec();
      await this.bufferClientService.renewProbeLeases(leaseOwner, until);
    } catch (error) {
      this.logger.warn(`[${clientId}] Lease renewal failed: ${parseError(error, '', false).message}`);
    }
  }

  private canSetupClient(clientId: string): boolean {
    const lastSetup = this.setupCooldownMap.get(clientId) || 0;
    return Date.now() > lastSetup + CONFIG.COOLDOWN_PERIOD;
  }

  private async handleSetupClient(
    clientId: string,
    setupClientQueryDto: SetupClientQueryDto,
    internal: SetupInternalOptions = {},
  ): Promise<SetupClientResult> {
    // NOTE: the cooldown is intentionally NOT set here. It is set only once a real swap actually
    // proceeds (a safe buffer candidate was found) — see below. Setting it up-front meant a
    // "no buffer available" run (e.g. all of a client's buffers are temporarily cooling down on
    // availableDate) still burned the full 4-min cooldown, blocking every retry for 4 minutes even
    // though nothing happened. That made a frozen client un-swappable long after buffers freed up.
    const existingClient = await this.findOne(clientId, false);
    if (!existingClient) {
      this.logger.error(`Client not found: ${clientId}`);
      return {
        status: 'client_not_found',
        swapped: false,
        clientId,
        message: `Client not found: ${clientId}`,
      };
    }
    const existingClientMobile = existingClient.mobile;
    this.logger.log('setupClientQueryDto:', setupClientQueryDto);
    const today = ClientHelperUtils.getTodayDateString();
    const permanentReplacement = this.isPermanentReplacementReason(setupClientQueryDto.reason);
    const upgradeFromTier = internal.upgradeFromTier;
    const dead = !upgradeFromTier && isDeadSwapReason(setupClientQueryDto.reason);
    // Degraded tiers: only for a DEAD live account (or an upgrade run, which only moves UP), never
    // when the caller pinned a mobile. DEGRADED_SWAP_TIERS is read now, so a config change applies
    // to the next request.
    const configuredTiers = parseDegradedSwapTiers();
    const degradedTiers: DegradedTier[] = setupClientQueryDto.mobile
      ? []
      : upgradeFromTier
        ? configuredTiers.filter((tier) => tier < upgradeFromTier)
        : dead ? configuredTiers : [];
    // Never a candidate: the current main, any mobile in an in-flight setup (this process), and any
    // other client's current main. Two siblings racing for one spare cannot both take it.
    const busyMobiles = await this.busyCandidateMobiles(clientId, existingClientMobile);
    const baseCandidateQuery: Omit<ClientMongoQuery, 'availableDate'> = this.buildEligibleBufferQuery(
      clientId,
      setupClientQueryDto.mobile ? { $eq: setupClientQueryDto.mobile, $nin: busyMobiles } : { $nin: busyMobiles },
    );
    const newProbeBudget = (): SetupProbeBudget => ({
      clientId, remaining: MAX_SETUP_PROBES, spentMs: 0, skipped: [],
      ...(internal.leaseOwner ? { leaseOwner: internal.leaseOwner } : {}),
      ...(internal.jobPass ? { jobPass: true } : {}),
    });
    const probeBudget = newProbeBudget();
    // The permanent-replacement fallback scan gets its own budget so an exhausted due-scan budget
    // cannot retire the existing account before the fallback has probed anything.
    let fallbackBudget: SetupProbeBudget | undefined;
    const dueCandidateQuery: ClientMongoQuery = {
      ...baseCandidateQuery,
      availableDate: { $lte: today },
    };
    const candidateBufferClients = await this.bufferClientService.executeQuery(dueCandidateQuery, { availableDate: 1, createdAt: 1 }, 10);
    this.logger.info(
      `[${clientId}] Setup candidate scan completed`,
      { existingMobile: existingClientMobile, candidateCount: candidateBufferClients.length, query: dueCandidateQuery },
    );
    let newBufferClient = await this.findSafeSetupBufferCandidate(candidateBufferClients, existingClient.session, probeBudget);
    let usedFutureAvailableFallback = false;

    // A permanent Telegram failure means the current main account cannot safely serve users.
    // Preserve the normal availability gate for every ordinary replacement, but when no due
    // candidate passes the session-safety checks, take the earliest otherwise-safe future buffer.
    // This remains deliberately server-authorized from the canonical reason classifier; callers
    // cannot opt in with a query flag, and the candidate keeps every other readiness invariant.
    if (!newBufferClient && permanentReplacement) {
      const futureCandidateQuery: ClientMongoQuery = {
        ...baseCandidateQuery,
        availableDate: { $gt: today },
      };
      const futureCandidateBufferClients = await this.bufferClientService.executeQuery(
        futureCandidateQuery,
        { availableDate: 1, createdAt: 1 },
        10,
      );
      fallbackBudget = newProbeBudget();
      newBufferClient = await this.findSafeSetupBufferCandidate(futureCandidateBufferClients, existingClient.session, fallbackBudget);
      usedFutureAvailableFallback = !!newBufferClient;
      this.logger.warn(`[${clientId}] Permanent replacement fallback scan completed`, {
        existingMobile: existingClientMobile,
        reason: setupClientQueryDto.reason,
        candidateCount: futureCandidateBufferClients.length,
        selected: newBufferClient?.mobile,
        query: futureCandidateQuery,
      });
    }
    // Degraded fallback: only once tier 1 is truly empty. If tier 1 still has unprobed candidates
    // (probe budget ran out), answer no_candidate + moreCandidatesPending instead so the caller's
    // retry reaches them before anything worse is taken.
    let degradedBudget: SetupProbeBudget | undefined;
    let degradedPlan: DegradedSwapPlan | null = null;
    const tier1Pending = !!(probeBudget.moreCandidatesPending || fallbackBudget?.moreCandidatesPending);
    if (!newBufferClient && degradedTiers.length && !tier1Pending) {
      degradedBudget = newProbeBudget();
      const pick = await this.findDegradedCandidate(existingClient, degradedTiers, degradedBudget, today, busyMobiles);
      if (pick) {
        newBufferClient = pick.candidate;
        const previous = existingClient.degraded;
        // The marker comes from what the probe said, not from the tier the pick was found in.
        const marker = markerTierFromVerdict(pick.tier, pick.candidate.spamStatus);
        degradedPlan = {
          clientId,
          pickTier: pick.tier,
          markerTier: marker === 1 ? null : marker,
          // An upgrade keeps the episode's original dead reason and start time.
          reason: (upgradeFromTier && previous?.reason) || setupClientQueryDto.reason || 'unknown',
          since: (upgradeFromTier && previous?.since) ? new Date(previous.since) : new Date(),
          fromMobile: existingClientMobile,
          limitedUntil: marker === 3 ? (pick.candidate.limitedUntil ?? null) : null,
          ...(pick.fromClientId ? { fromClientId: pick.fromClientId } : {}),
        };
      }
      this.logger.warn(`[${clientId}] Degraded swap scan completed`, {
        existingMobile: existingClientMobile,
        reason: setupClientQueryDto.reason,
        tiers: degradedTiers,
        selected: newBufferClient?.mobile,
        pickTier: degradedPlan?.pickTier,
        markerTier: degradedPlan?.markerTier,
      });
    }
    if (!newBufferClient) {
      let existingRetired = false;
      if (upgradeFromTier) {
        // Upgrade run: the current degraded account is alive and keeps serving. Nothing to say.
        this.logger.log(`[${clientId}] No better-tier buffer for degraded client (tier ${upgradeFromTier})`);
        return {
          status: 'no_candidate',
          swapped: false,
          clientId,
          existingMobile: existingClientMobile,
          degraded: true,
          message: `No buffer better than degraded tier ${upgradeFromTier}`,
        };
      }
      if (permanentReplacement) {
        this.logger.warn(`[${clientId}] No replacement buffer available, but setup reason is permanent; marking existing mobile inactive`, {
          existingMobile: existingClientMobile,
          reason: setupClientQueryDto.reason,
        });
        // Idempotent: an already retired main is not retired (or announced) again.
        await this.retireReplacedMobile(existingClientMobile, setupClientQueryDto.reason);
        existingRetired = true;
      }
      const moreCandidatesPending = !!(
        probeBudget.moreCandidatesPending || fallbackBudget?.moreCandidatesPending || degradedBudget?.moreCandidatesPending
      );
      const pendingNote = moreCandidatesPending
        ? ' (SpamBot probe budget exhausted; more unprobed candidates remain, retry to check them)'
        : '';
      const alreadyDegraded = !!existingClient.degraded;
      // One notice per episode (dead / normal), not one per caller retry; the episode ends with the
      // next successful swap. Every attempt is still logged below.
      const episodeKey = `${clientId}:${existingClientMobile}:${dead ? 'dead' : 'normal'}`;
      if (!this.noBufferNoticeEpisodes.has(episodeKey)) {
        this.noBufferNoticeEpisodes.add(episodeKey);
        await this.notify({
          severity: dead ? 'critical' : 'warning',
          title: 'No buffer',
          summary: dead
            ? `Live account is dead and no buffer exists in any allowed tier (degraded tiers: ${degradedTiers.join(',') || 'off'}); client stays on the dead account${pendingNote}`
            : `No safe buffer clients for swap${pendingNote}`,
          fields: [
            { label: 'Client ID', value: clientId },
            ...(dead ? [{ label: 'Reason', value: String(setupClientQueryDto.reason).substring(0, 80), code: false }] : []),
            ...(alreadyDegraded ? [{ label: 'Degraded', value: `tier ${existingClient.degraded?.tier}`, code: false }] : []),
          ],
          tables: this.probeSkipTables(probeBudget, fallbackBudget, degradedBudget),
        });
      }
      this.logger.log('Buffer Clients not safely available', { clientId, dead, moreCandidatesPending, alreadyDegraded });
      return {
        status: 'no_candidate',
        swapped: false,
        clientId,
        existingMobile: existingClientMobile,
        existingRetired,
        ...(moreCandidatesPending ? { moreCandidatesPending: true } : {}),
        ...(alreadyDegraded ? { degraded: true } : {}),
        message: `No safe buffer client is currently available${pendingNote}`,
      };
    }
    // Another client's in-flight setup took this mobile while we were probing it: never share it.
    // Checked synchronously right before registering our own setup (no await in between).
    const conflictingSetup = this.telegramService.getActiveClientSetup(newBufferClient.mobile);
    if (conflictingSetup && conflictingSetup.clientId !== clientId) {
      this.logger.warn(`[${clientId}] Candidate ${newBufferClient.mobile} is in an active setup for ${conflictingSetup.clientId}; not taken`);
      return {
        status: 'failed',
        swapped: false,
        clientId,
        existingMobile: existingClientMobile,
        message: `Candidate is being set up for another client (${conflictingSetup.clientId}); retry`,
      };
    }
    // A real swap is proceeding — start the cooldown now so a genuine in-progress setup is not
    // retried concurrently, while a prior no-buffer run does not lock this path out.
    this.setupCooldownMap.set(clientId, Date.now());
    const planKey = `${clientId}:${newBufferClient.mobile}`;
    this.telegramService.setActiveClientSetup({
      ...setupClientQueryDto,
      clientId,
      existingMobile: existingClientMobile,
      newMobile: newBufferClient.mobile,
    });
    try {
      this.logger.info(
        `[${clientId}] Selected replacement buffer client`,
        {
          existingMobile: existingClientMobile,
          newMobile: newBufferClient.mobile,
          usedFutureAvailableFallback,
          pickTier: degradedPlan?.pickTier,
          markerTier: degradedPlan?.markerTier,
          upgradeFromTier,
        },
      );
      if (degradedPlan) this.degradedPlans.set(planKey, degradedPlan);
      await this.notify({
        title: 'Swap started',
        fields: [
          { label: 'Client ID', value: clientId },
          { label: 'Old mobile', value: existingClient.mobile },
          { label: 'Old username', value: existingClient.username ? `@${existingClient.username}` : undefined },
          { label: 'New mobile', value: newBufferClient.mobile },
          ...(degradedPlan ? [{ label: 'Degraded tier', value: String(degradedPlan.markerTier ?? `${degradedPlan.pickTier} (meets tier-1 rules)`), code: false }] : []),
        ],
        tables: this.probeSkipTables(probeBudget, fallbackBudget, degradedBudget),
      });
      this.logger.debug(`[${clientId}] Active client setup registered`, {
        existingMobile: existingClientMobile,
        newMobile: newBufferClient.mobile,
        returnOldToPool: setupClientQueryDto.archiveOld,
        formalities: setupClientQueryDto.formalities,
      });
      await connectionManager.getClient(newBufferClient.mobile);
      await this.updateClientSession(newBufferClient.session, newBufferClient.mobile, clientId);
      for (const key of [...this.noBufferNoticeEpisodes]) {
        if (key.startsWith(`${clientId}:`)) this.noBufferNoticeEpisodes.delete(key);
      }
      await this.notifyDegradedTransition(clientId, existingClient, newBufferClient.mobile, degradedPlan, upgradeFromTier);
      return {
        status: 'swapped',
        swapped: true,
        clientId,
        existingMobile: existingClientMobile,
        newMobile: newBufferClient.mobile,
        usedFutureAvailableFallback,
        ...(degradedPlan?.markerTier ? { degradedTier: degradedPlan.markerTier } : {}),
        message: degradedPlan?.markerTier ? `Client swap completed (degraded tier ${degradedPlan.markerTier})` : 'Client swap completed',
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorDetails = parseError(error, `setupClient failed for ${newBufferClient.mobile}`);
      const permanent = isPermanentError(errorDetails);
      await this.notify({
        severity: 'error',
        title: 'Swap failed',
        summary: permanent ? 'Buffer inactivated (permanent error)' : undefined,
        fields: [
          { label: 'Client ID', value: clientId },
          { label: 'Old mobile', value: existingClient.mobile },
          { label: 'New mobile', value: newBufferClient.mobile },
        ],
        details: errorMessage.substring(0, 500),
        detailsTitle: 'Error message',
      });
      // Never touch a mobile that is (now) ANY client's live main: a sibling's cutover won the race
      // for it, or our own cutover committed before the error. No availableDate push, no disconnect.
      const ownerOfMobile = await this.clientUsingMobile(newBufferClient.mobile);
      if (ownerOfMobile) {
        this.logger.warn(`[${clientId}] Swap failed on ${newBufferClient.mobile}, now the live main of ${ownerOfMobile}; leaving it untouched`);
      } else if (permanent) {
        // Account is permanently dead — retire it everywhere (user + pools), don't recycle
        await this.usersService.expireAccount(newBufferClient.mobile, `Setup failed permanently: ${errorDetails.message}`);
      } else {
        // Transient error — push availability out so it's not retried immediately
        const availableDate = ClientHelperUtils.toDateString(Date.now() + 3 * 24 * 60 * 60 * 1000);
        await this.bufferClientService.createOrUpdate(newBufferClient.mobile, { availableDate });
      }
      if (this.telegramService.getActiveClientSetup(newBufferClient.mobile)?.clientId === clientId) {
        this.telegramService.clearActiveClientSetup(newBufferClient.mobile);
      }
      return {
        status: 'failed',
        swapped: false,
        clientId,
        existingMobile: existingClientMobile,
        newMobile: newBufferClient.mobile,
        message: errorMessage.substring(0, 200),
      };
    } finally {
      this.degradedPlans.delete(planKey);
      if (!(await this.clientUsingMobile(newBufferClient.mobile))) {
        await connectionManager.unregisterClient(newBufferClient.mobile);
      }
    }
  }

  async updateClientSession(newSession: string, setupMobile?: string, expectedClientId?: string) {
    const setup = this.telegramService.getActiveClientSetup(setupMobile);
    if (!setup) {
      const scope = setupMobile ? ` for ${setupMobile}` : '';
      throw new BadRequestException(`No active client setup found${scope}`);
    }
    if (expectedClientId && setup.clientId !== expectedClientId) {
      throw new ConflictException(`Active setup for ${setupMobile} belongs to ${setup.clientId}, not ${expectedClientId}`);
    }
    const { archiveOld: returnOldToPool, clientId, existingMobile, formalities, newMobile, reason } = setup;
    const days = setup.days ?? 0;
    this.logger.info(`[${clientId}] Starting client session cutover`, {
      existingMobile,
      newMobile,
      returnOldToPool,
      formalities,
      days,
      setupMobile: setupMobile || newMobile,
    });
    await sleep(2000);
    const existingClient = await this.findOne(clientId);
    if (!existingClient) throw new NotFoundException(`Client ${clientId} not found`);
    let newTelegramClient: TelegramManager;
    let cutoverCommitted = false;
    try {
      newTelegramClient = await connectionManager.getClient(newMobile, {
        handler: true,
        autoDisconnect: false,
      });
    } catch (error) {
      const errorDetails = parseError(error, `Failed to get Telegram client for NewMobile: ${newMobile}`, true);
      if (isPermanentError(errorDetails)) {
        // New mobile is permanently dead — retire everywhere (user + pools)
        await this.usersService.expireAccount(newMobile, errorDetails.message);
      }
      throw error;
    }
    if (!newTelegramClient) throw new Error(`Failed to get Telegram client for NewMobile: ${newMobile}`);
    try {
      const me = await newTelegramClient.getMe();
      // Fetch buffer doc to get persona assignment
      const bufferDoc = await this.bufferClientService.findOne(newMobile);
      this.logger.debug(`[${clientId}] Loaded buffer persona assignment for cutover`, {
        newMobile,
        hasAssignedFirstName: !!bufferDoc?.assignedFirstName,
        assignedPhotoCount: bufferDoc?.assignedProfilePics?.length || 0,
      });
      // Use the username already set during warmup — no Telegram API call needed
      const updatedUsername = bufferDoc?.username || me.username;
      this.logger.info(`[${clientId}] Using pre-set buffer username: @${updatedUsername} (current TG: @${me.username})`);
      await this.notify({ title: 'Cutover username', fields: [{ label: 'Client ID', value: clientId }, { label: 'New mobile', value: newMobile }, { label: 'Username', value: updatedUsername ? `@${updatedUsername}` : undefined }] });
      if (!newSession?.trim()) {
        throw new BadRequestException(`Invalid replacement session for ${newMobile}`);
      }
      const mirroredActiveName = this.buildMirroredActiveName(bufferDoc, existingClient.name);
      await this.commitClientCutover(clientId, existingMobile, {
        mobile: newMobile,
        username: updatedUsername,
        session: newSession,
        name: mirroredActiveName,
      }, this.degradedPlanFor(clientId, newMobile));
      cutoverCommitted = true;
      this.logger.info(`[${clientId}] Cutover committed`, {
        existingMobile,
        newMobile,
        updatedUsername,
        mirroredActiveName,
      });
      this.logger.debug(`[${clientId}] Marked replacement buffer doc as the sole active/in-use primary`, { newMobile });
      // Profile refresh (name/bio, privacy, photos) is handled by tg-aut on startup
      // via persona verifier + CMS photo refresh endpoint. No delayed update needed —
      // avoids a second connection racing with tg-aut's own startup.
      this.logger.debug(`[${clientId}] Skipping delayed profile refresh — tg-aut handles on startup`);
      try {
        if (existingClient.deployKey) {
          this.logger.info(`[${clientId}] Triggering deploy restart after cutover`, { deployKeyPresent: true });
          await fetchWithTimeout(existingClient.deployKey, {}, 1);
          this.logger.debug(`[${clientId}] Deploy restart request completed`, { newMobile });
        }
      } catch (deployError) {
        const deployMessage = deployError instanceof Error ? deployError.message : String(deployError);
        parseError(deployError, `[${clientId}] deployKey restart failed after cutover`);
        await this.notify({ severity: 'error', title: 'Restart failed', summary: 'Cutover is done', fields: [{ label: 'Client ID', value: clientId }, { label: 'New mobile', value: newMobile }], details: deployMessage?.substring(0, 500), detailsTitle: 'Error message' });
      }
      this.logger.info(`[${clientId}] Starting replaced-client pool-return handling`, {
        existingMobile,
        returnOldToPool,
        formalities,
        days,
      });
      await this.handleReplacedClient(existingClient, existingMobile, formalities, returnOldToPool, days, reason);
      this.logger.info(`[${clientId}] Client session cutover finished`, { existingMobile, newMobile });
      await this.notify({ severity: 'success', title: 'Swap complete', fields: [{ label: 'Client ID', value: clientId }, { label: 'Old mobile', value: existingMobile }, { label: 'New mobile', value: newMobile }] });
    } catch (error) {
      const errorDetails = parseError(error, `[New: ${newMobile}] Error in updating client session`, true);
      // Retire the new mobile on permanent failure (before cutover committed) so it's
      // expired everywhere and setupClient's catch can still distinguish via the now-inactive pool record.
      if (!cutoverCommitted && isPermanentError(errorDetails)) {
        try { await this.usersService.expireAccount(newMobile, `Session update failed: ${errorDetails.message}`); } catch { }
      }
      this.logger.error(
        `[${clientId}] Client session cutover failed`,
        { existingMobile, newMobile, cutoverCommitted, error: errorDetails.message },
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    } finally {
      await connectionManager.unregisterClient(newMobile);
      this.telegramService.clearActiveClientSetup(newMobile);
      this.logger.debug(`[${clientId}] Cleared active setup state`, { newMobile });
    }
  }

  /**
   * Commit the active-client assignment and buffer ownership in one MongoDB
   * transaction. A process crash or buffer write failure must never leave
   * `clients.mobile` pointing at one account while `bufferClients.inUse` still
   * identifies another account as the primary.
   */
  private async commitClientCutover(
    clientId: string,
    expectedExistingMobile: string,
    updateClientDto: Pick<UpdateClientDto, 'mobile' | 'username' | 'session' | 'name'>,
    degradedPlan: DegradedSwapPlan | null = null,
  ): Promise<Client> {
    if (!updateClientDto.session?.trim()) {
      throw new BadRequestException('Cannot update client with a blank session');
    }

    const cleanUpdateDto: Mutable<UpdateClientDto> = this.cleanUpdateObject(updateClientDto);
    cleanUpdateDto.mobile = this.canonicalMobile(cleanUpdateDto.mobile!);
    await this.notifyClientUpdate(clientId);

    // A degraded pick stamps clients.degraded; any other cutover (tier 1, or a pick that meets
    // tier-1 rules: markerTier null) clears it.
    const degradedState: ClientDegradedState | null = degradedPlan?.markerTier
      ? {
        since: degradedPlan.since,
        tier: degradedPlan.markerTier,
        reason: degradedPlan.reason,
        fromMobile: this.canonicalMobile(expectedExistingMobile),
        limitedUntil: degradedPlan.limitedUntil,
        ...(degradedPlan.fromClientId ? { fromClientId: degradedPlan.fromClientId } : {}),
      }
      : null;
    // swappedAt opens the late-report grace window (screenSetupReport).
    const swappedAt = new Date();
    const clientUpdate: Record<string, unknown> = degradedState
      ? { $set: { ...cleanUpdateDto, degraded: degradedState, swappedAt }, $unset: { swapRetry: '', deadMain: '', sessionChangedAt: '' } }
      : { $set: { ...cleanUpdateDto, swappedAt }, $unset: { degraded: '', swapRetry: '', deadMain: '', sessionChangedAt: '' } };

    const session: ClientSession = await this.clientModel.db.startSession();
    let updatedClient: Client | null = null;
    try {
      await session.withTransaction(async () => {
        updatedClient = await this.clientModel
          .findOneAndUpdate(
            { clientId, mobile: this.canonicalMobile(expectedExistingMobile) },
            clientUpdate,
            { returnDocument: 'after', runValidators: true, session },
          )
          .lean()
          .exec();
        if (!updatedClient) {
          throw new ConflictException(
            `Client "${clientId}" changed before cutover; expected mobile ${expectedExistingMobile}`,
          );
        }
        if (degradedPlan?.fromClientId) {
          // Tier 2: the sibling's spare becomes this client's, in the same transaction.
          await this.bufferClientService.reassignClientId(cleanUpdateDto.mobile!, degradedPlan.fromClientId, clientId, session);
        }
        await this.bufferClientService.setPrimaryInUse(
          clientId,
          cleanUpdateDto.mobile!,
          session,
        );
      });
    } finally {
      await session.endSession();
    }

    if (!updatedClient) {
      throw new InternalServerErrorException(`Client cutover transaction did not return ${clientId}`);
    }
    this.clientsMap.set(clientId, updatedClient);
    this.performPostUpdateTasks(updatedClient);
    return updatedClient;
  }

  private async handleReplacedClient(
    existingClient: Client,
    existingMobile: string,
    formalities: boolean,
    returnOldToPool: boolean,
    days: number,
    reason?: string,
  ) {
    try {
      if (this.isPermanentReplacementReason(reason)) {
        await this.retireReplacedMobile(existingMobile, reason);
        return;
      }

      const existingClientUser = (await this.usersService.search({ mobile: existingMobile }))[0];
      if (!existingClientUser) {
        const reasonMessage = `Pool return failed: user document missing for replaced mobile ${existingMobile}`;
        this.logger.warn(reasonMessage);
        await this.retireReplacedMobile(existingMobile, reasonMessage);
        await this.notify({ severity: 'warning', title: 'Pool return', summary: 'User doc missing, buffer inactivated', fields: [{ label: 'Mobile', value: existingMobile }] });
        return;
      }
      if (formalities) {
        await this.handleFormalities(existingMobile);
      } else {
        this.logger.log('Formalities skipped');
      }
      if (returnOldToPool) {
        await this.returnOldClientToBufferPool(existingClient, existingClientUser, existingMobile, days);
      } else {
        await this.bufferClientService.update(existingMobile, {
          inUse: false,
          lastUsed: new Date(),
          status: 'inactive',
          message: reason || 'Deactivated during client swap (pool return skipped)',
        });
        this.logger.log('Replaced-client pool return skipped');
        await this.notify({ title: 'Return skipped', summary: 'Account is inactivated', fields: [{ label: 'Mobile', value: existingMobile }] });
      }
    } catch (e) {
      const errorDetails = parseError(e, `Error returning replaced client to buffer pool: ${existingMobile}`, false);
      const errorMessage = e instanceof Error ? e.message : String(e);
      if (isPermanentError(errorDetails)) {
        await this.retireReplacedMobile(existingMobile, errorMessage);
      }
      await this.notify({ severity: 'error', title: 'Return failed', fields: [{ label: 'Mobile', value: existingMobile }], details: errorMessage?.substring(0, 500), detailsTitle: 'Error message' });
    }
  }

  private isPermanentReplacementReason(reason?: string): reason is string {
    // isDeadSwapReason adds the internal DEAD_MAIN_RESCUE reason (rescue pass: main already retired).
    return !!reason && (isPermanentError({ message: reason }) || isDeadSwapReason(reason));
  }

  /**
   * Retire a replaced main mobile for a PERMANENT reason
   * (session revoked / banned / deactivated). This is only ever called on
   * permanent replacement reasons / permanent errors, so it cascades through
   * usersService.expireAccount — marking the user expired AND deactivating any
   * matching buffer/promote pool record — so the dead mobile can never be
   * re-selected. expireAccount is idempotent and safe even if no pool record
   * exists for this mobile.
   */
  private async retireReplacedMobile(mobile: string, reason: string): Promise<void> {
    if (await this.isAlreadyRetired(mobile)) {
      this.logger.log(`Replaced account ${mobile} is already retired; not retired or announced again`);
      return;
    }
    try {
      await this.usersService.expireAccount(mobile, reason);
      this.logger.warn(`Replaced account retired (expired + pools deactivated)`, { mobile, reason: reason.substring(0, 160) });
      await this.notify({ severity: 'warning', title: 'Inactivated', fields: [{ label: 'Mobile', value: mobile }, { label: 'Reason', value: reason.substring(0, 120), code: false }] });
    } catch (error) {
      const errorDetails = parseError(error, `Failed to retire replaced account: ${mobile}`, false);
      this.logger.error(`Failed to retire replaced account ${mobile}: ${errorDetails.message}`);
      await this.notify({ severity: 'error', title: 'Inactivate fail', fields: [{ label: 'Mobile', value: mobile }, { label: 'Reason', value: reason.substring(0, 100), code: false }], details: errorDetails.message.substring(0, 500), detailsTitle: 'Error message' });
    }
  }

  /** Every users doc expired and the buffer row (if any) inactive: expireAccount already ran. */
  private async isAlreadyRetired(mobile: string): Promise<boolean> {
    try {
      const users = (await this.usersService.findByMobileAnyStatus(mobile)) ?? [];
      if (!users.length || !users.every((u) => u.expired === true)) return false;
      const buffer = await this.bufferClientService.findOne(mobile, false);
      return !buffer || buffer.status === 'inactive';
    } catch {
      return false; // unknown: retire (expireAccount is idempotent; at worst one extra notice)
    }
  }

  private async handleFormalities(mobile: string) {
    try {
      await this.telegramService.updatePrivacyforDeletedAccount(mobile);
      this.logger.log('Formalities finished');
      await this.notify({ severity: 'success', title: 'Formalities done', summary: 'Privacy updated', fields: [{ label: 'Mobile', value: mobile }] });
    } finally {
      await connectionManager.unregisterClient(mobile);
    }
  }

  /**
   * availableDate for a returning account: now + days, but never earlier than a known Telegram
   * limit expiry (spamStatus 'limited' + limitedUntil written by tg-aut / the probe). The spam
   * fields themselves are never part of the return write, so they stay intact; a 'harsh' account
   * keeps spamStatus 'harsh' and is excluded by the picker regardless of availableDate.
   */
  private resolveReturnAvailableDate(
    bufferClient: { spamStatus?: string; limitedUntil?: Date | string | null } | null | undefined,
    days: number,
  ): string {
    const defaultMs = Date.now() + days * 24 * 60 * 60 * 1000;
    if (bufferClient?.spamStatus === 'limited' && bufferClient.limitedUntil) {
      const limitedUntilMs = new Date(bufferClient.limitedUntil).getTime();
      if (Number.isFinite(limitedUntilMs) && limitedUntilMs > defaultMs) {
        return ClientHelperUtils.toDateString(limitedUntilMs);
      }
    }
    return ClientHelperUtils.toDateString(defaultMs);
  }

  private async returnOldClientToBufferPool(
    existingClient: Client,
    existingClientUser: User,
    existingMobile: string,
    days: number,
  ) {
    let existingBufferClient: Awaited<ReturnType<BufferClientService['findOne']>> | null = null;
    try {
      await this.assertDistinctUserBackupSession(existingMobile, existingClient.session);
      existingBufferClient = await this.bufferClientService.findOne(existingMobile, false);
      const availableDate = this.resolveReturnAvailableDate(existingBufferClient, days);
      const bufferClientDto: CreateBufferClientDto | UpdateBufferClientDto = {
        clientId: existingClient.clientId,
        mobile: existingMobile,
        availableDate,
        session: existingClient.session,
        tgId: existingClientUser.tgId,
        // A previously active service account returns as established buffer supply.
        // Preserve a higher known count, but never reset it below the 250-channel
        // return floor. The join/check sweeps can still reconcile it from Telegram.
        channels: Math.max(250, existingBufferClient?.channels ?? 0),
        status: days > 35 ? 'inactive' : 'active',
        inUse: false,
        // This primary has just completed live use. Keep that fact so the
        // READY scheduler restores terminal state without creating another backup session.
        lastUsed: new Date(),
        // The account already has a verified, distinct backup session. It returns as
        // terminal supply; a below-floor verified count is eligible only for capacity
        // recovery, never for a warmup rewind or a new-session flow.
        warmupPhase: WarmupPhase.SESSION_ROTATED,
        // sessionRotatedAt is deliberately NOT written here.
        //
        // It used to be set to null on every buffer return, which destroyed the rotation history:
        // 274 of 353 buffer accounts in session_rotated (78%) ended up with no stamp, making the
        // field useless as an audit signal — reading it to answer "was this account rotated?"
        // gives the wrong answer for most of the pool.
        //
        // The erasure was unnecessary. Rotation here means "provision a verified, distinct BACKUP
        // session" (see rotateSession: "active session retained, users backup verified"), which is
        // a ONE-TIME step — an account that already has a backup never needs another. The gates at
        // base-client.service.ts:1323 and :2696 refuse rotation when the stamp is set, and that is
        // exactly the correct behaviour for a returning primary: it already has its backup, as the
        // comment above states. Leaving the timestamp intact preserves the fact AND keeps the gate
        // working. Omitting the key (rather than writing null) also means an account that somehow
        // has no stamp is left untouched rather than being stamped with a fabricated value.
        message: 'Returned to buffer pool; channel capacity will be verified',
      };
      const updatedBufferClient = await this.bufferClientService.createOrUpdate(
        existingMobile,
        bufferClientDto,
      );
      this.logger.log('Client returned to buffer pool:', updatedBufferClient);
      await this.notify({ title: 'Returned to pool', fields: [{ label: 'Mobile', value: existingMobile }, { label: 'Available date', value: availableDate, code: false }] });
    } catch (error) {
      const errorDetails = parseError(error, `Error returning old client to buffer pool: ${existingMobile}`, true);
      await this.notify({ severity: 'error', title: 'Return error', fields: [{ label: 'Mobile', value: existingMobile }], details: errorDetails.message?.substring(0, 500), detailsTitle: 'Error message' });
      if (isPermanentError(errorDetails)) {
        this.logger.log('Marking replaced buffer inactive:', existingMobile);
        await this.retireReplacedMobile(existingMobile, errorDetails.message);
        // await this.bufferClientService.remove(existingClientUser.mobile, 'Deactivated user');
      } else {
        // Transient failure: the cutover already happened, so the old primary is no longer
        // the live account — but it is still inUse=true/status=active. Release the
        // reservation and push availability forward so it returns to the buffer pool for a
        // later retry instead of being stranded inUse=true (excluded from every selection).
        const retryAvailableDate = this.resolveReturnAvailableDate(existingBufferClient, days);
        await this.bufferClientService.update(existingMobile, {
          inUse: false,
          status: 'active',
          availableDate: retryAvailableDate,
          message: `Pool return retry after transient error: ${errorDetails.message?.substring(0, 160)}`,
        }).catch((updateError) => {
          this.logger.error(`Failed to release stranded pool-return reservation for ${existingMobile}: ${parseError(updateError, '', false).message}`);
        });
        this.logger.log(`Released pool-return reservation for ${existingMobile} after transient error; available ${retryAvailableDate}`);
      }
    }
  }

  private async findSafeSetupBufferCandidate(
    candidates: Array<{
      mobile: string;
      session?: string;
      availableDate?: string;
      spamStatus?: string;
      spamCheckedAt?: Date | string | null;
      limitedUntil?: Date | string | null;
    }>,
    existingClientSession: string,
    probeBudget: SetupProbeBudget = { clientId: '-', remaining: MAX_SETUP_PROBES, spentMs: 0, skipped: [] },
    accept: SwapProbeAcceptance = {},
  ): Promise<SafeSetupBufferCandidate | null> {
    for (const candidate of candidates) {
      if (!candidate?.mobile || !candidate?.session) continue;
      if (candidate.session === existingClientSession) {
        this.logger.warn(`Skipping setup candidate ${candidate.mobile}: session matches current main client`);
        continue;
      }
      if (this.setupOwnedByAnotherClient(candidate.mobile, probeBudget.clientId)) {
        this.logger.warn(`Skipping setup candidate ${candidate.mobile}: in an active setup for another client`);
        continue;
      }
      // Lease the row before anything can connect it (backup-session creation, SpamBot probe,
      // cutover): another CMS process holding it is mid-setup with this very session.
      const owner = probeBudget.leaseOwner;
      if (owner) {
        let leased = false;
        try {
          leased = await this.bufferClientService.acquireProbeLease(candidate.mobile, owner, SWAP_LEASE_TTL_MS);
        } catch (error) {
          this.logger.warn(`Skipping setup candidate ${candidate.mobile}: probe lease failed (${parseError(error, '', false).message})`);
          continue;
        }
        if (!leased) {
          this.logger.warn(`[${probeBudget.clientId}] Skipping setup candidate ${candidate.mobile}: leased by another CMS process`);
          probeBudget.skipped.push(`${candidate.mobile} busy in another CMS process (not probed)`);
          probeBudget.moreCandidatesPending = true;
          continue;
        }
      }
      let picked = false;
      try {
        const backupUser = probeBudget.jobPass
          ? await this.storedDistinctBackup(candidate.mobile, candidate.session)
          : await this.assertDistinctUserBackupSession(candidate.mobile, candidate.session);
        if (!backupUser?.session?.trim() || backupUser.session.trim() === candidate.session.trim()) {
          this.logger.warn(`Skipping setup candidate ${candidate.mobile}: ${probeBudget.jobPass ? 'no stored distinct backup session (job passes never create one)' : 'backup session is still duplicated'}`);
          continue;
        }
        probeBudget.lastVerdict = undefined;
        if (!(await this.isSpamSafeForSwap(candidate, probeBudget, accept))) continue;
        // A sibling's setup may have registered this mobile while we probed it.
        if (this.setupOwnedByAnotherClient(candidate.mobile, probeBudget.clientId)) {
          this.logger.warn(`Skipping setup candidate ${candidate.mobile}: taken by another client's setup during the probe`);
          continue;
        }
        const verdict = probeBudget.lastVerdict as SetupProbeBudget['lastVerdict'];
        // An inconclusive probe tells us nothing about the limit: keep the stored one.
        const storedLimitedUntil = candidate.limitedUntil ? new Date(candidate.limitedUntil) : null;
        picked = true; // keeps its lease through the cutover; runSetup releases it
        return {
          mobile: candidate.mobile,
          session: candidate.session,
          backupUser,
          // Degraded tiers only (non-empty acceptance): tier-1 picks keep their original shape.
          ...(verdict && Object.keys(accept).length
            ? { spamStatus: verdict.status, limitedUntil: verdict.status === 'unknown' ? storedLimitedUntil : verdict.limitedUntil }
            : {}),
        };
      } catch (error) {
        this.logger.warn(`Skipping setup candidate ${candidate.mobile}: failed to ensure distinct backup session`);
        continue;
      } finally {
        if (owner && !picked) {
          await this.bufferClientService.releaseProbeLeases(owner, candidate.mobile).catch((error: unknown) =>
            this.logger.warn(`Probe lease release failed for ${candidate.mobile} (expires by TTL): ${parseError(error, '', false).message}`));
        }
      }
    }

    return null;
  }

  /**
   * Job passes: the users doc's STORED backup session, if it differs from the candidate's own.
   * Read-only (getOrEnsureDistinctUsersBackupSession may connect and create a session).
   */
  private async storedDistinctBackup(mobile: string, candidateSession: string): Promise<User | null> {
    const user = (await this.usersService.findByMobileAnyStatus(mobile))?.[0];
    const backup = user?.session?.trim();
    return user && backup && backup !== candidateSession.trim() ? user : null;
  }

  /** SpamBot-skipped swap candidates as a Mobile / Reason table (empty when none). */
  private probeSkipTables(...budgets: Array<SetupProbeBudget | undefined>): NotificationTable[] {
    const rows = budgets.flatMap((b) => b?.skipped ?? []).map((entry) => {
      const i = entry.indexOf(' ');
      return i < 0 ? [entry, ''] : [entry.slice(0, i), entry.slice(i + 1)];
    });
    return rows.length ? [{ title: 'Skipped: SpamBot', columns: ['Mobile', 'Reason'], rows }] : [];
  }

  /**
   * Decide whether a candidate may be swapped in, probing @SpamBot unless the account has a fresh
   * 'free' verdict. limited/harsh, an exhausted probe budget, a connect or send failure, or a
   * connection busy in another flow => false. 'unknown' (connected, but SpamBot silent or the reply
   * unrecognized) => true with a warning, so a SpamBot outage never blocks every swap.
   */
  private async isSpamSafeForSwap(
    candidate: { mobile: string; availableDate?: string; spamStatus?: string; spamCheckedAt?: Date | string | null },
    budget: SetupProbeBudget,
    accept: SwapProbeAcceptance = {},
  ): Promise<boolean> {
    const checkedAt = candidate.spamCheckedAt ? new Date(candidate.spamCheckedAt).getTime() : 0;
    if (candidate.spamStatus === 'free' && checkedAt > 0 && Date.now() - checkedAt < SPAM_FREE_FRESH_MS) {
      budget.lastVerdict = { status: 'free', limitedUntil: null };
      return true;
    }
    // Each probe is capped to what is left of the request budget, so the request's total probing
    // stays within SETUP_PROBE_TIME_BUDGET_MS instead of overshooting by a whole probe.
    const probeTimeoutMs = Math.min(SPAMBOT_TOTAL_TIMEOUT_MS, SETUP_PROBE_TIME_BUDGET_MS - budget.spentMs);
    if (budget.remaining <= 0 || probeTimeoutMs < MIN_SETUP_PROBE_MS) {
      this.logger.warn(`[${budget.clientId}] Skipping setup candidate ${candidate.mobile}: per-request SpamBot probe budget exhausted`);
      budget.moreCandidatesPending = true; // never swap an unprobed account; tell the caller to retry
      return false;
    }
    budget.remaining -= 1;
    const startedAt = Date.now();
    let result: SpamProbeResult;
    try {
      result = await probeSpamBot(candidate.mobile, { totalTimeoutMs: probeTimeoutMs });
    } catch (error) {
      result = { status: 'unknown', limitedUntil: null, error: error instanceof Error ? error.message : String(error) };
    }
    budget.spentMs += Date.now() - startedAt;

    if (result.status === 'unknown' && result.busy) {
      // Another flow is connecting/holding this account; probing would tear its connection down.
      // Nothing was spent, and a retry can probe it once that flow is done.
      budget.remaining += 1;
      budget.moreCandidatesPending = true;
      this.logger.warn(`[${budget.clientId}] Skipping setup candidate ${candidate.mobile}: connection in use by another flow, not probed`);
      budget.skipped.push(`${candidate.mobile} busy (not probed)`);
      return false;
    }
    if (result.status === 'unknown' && result.sendFailed) {
      // Connected but could not even message SpamBot (PEER_FLOOD, FLOOD_WAIT, auth errors): not safe.
      this.logger.warn(`[${budget.clientId}] Skipping setup candidate ${candidate.mobile}: SpamBot probe send failed (${result.error || 'unknown error'})`);
      budget.skipped.push(`${candidate.mobile} probe failed: ${(result.error || 'unknown error').slice(0, 60)}`);
      return false;
    }
    if (result.status === 'unknown' && result.connectFailed) {
      // Could not even connect the account: treat like unsafe (it could not serve as a live account either).
      this.logger.warn(`[${budget.clientId}] Skipping setup candidate ${candidate.mobile}: SpamBot probe could not connect (${result.error || 'unknown error'})`);
      budget.skipped.push(`${candidate.mobile} connect failed`);
      return false;
    }
    if (result.status === 'unknown') {
      if (accept.rejectFrozenReply && /frozen/i.test(result.replyText || '')) {
        // Degraded tiers: SpamBot answering about a frozen account means it cannot serve users.
        this.logger.warn(`[${budget.clientId}] Skipping setup candidate ${candidate.mobile}: SpamBot reply mentions a frozen account`);
        budget.skipped.push(`${candidate.mobile} frozen (SpamBot reply)`);
        return false;
      }
      this.logger.warn(`[${budget.clientId}] SpamBot probe inconclusive for ${candidate.mobile} (${result.error || 'unrecognized reply'}); allowing candidate`);
      budget.lastVerdict = { status: 'unknown', limitedUntil: null };
      return true;
    }

    const patch: Mutable<UpdateBufferClientDto> = {
      spamStatus: result.status,
      limitedUntil: result.status === 'limited' ? result.limitedUntil : null,
      spamCheckedAt: new Date(),
      spamCheckSource: 'cms-probe',
    };
    if (result.status === 'limited' && result.limitedUntil) {
      const limitDate = ClientHelperUtils.toDateString(result.limitedUntil);
      // Only ever push availability later, never earlier.
      patch.availableDate = candidate.availableDate && candidate.availableDate > limitDate ? candidate.availableDate : limitDate;
    }
    try {
      await this.bufferClientService.update(candidate.mobile, patch);
    } catch (error) {
      this.logger.warn(`[${budget.clientId}] Failed to persist SpamBot result for ${candidate.mobile}: ${parseError(error, '', false).message}`);
    }
    if (result.status === 'free'
      || (result.status === 'limited' && accept.limited)
      || (result.status === 'harsh' && accept.harsh)) {
      budget.lastVerdict = { status: result.status, limitedUntil: result.status === 'limited' ? result.limitedUntil : null };
      return true;
    }

    const detail = result.status === 'limited' && result.limitedUntil
      ? `limited until ${result.limitedUntil.toISOString().slice(0, 16).replace('T', ' ')} UTC`
      : 'harsh limit (indefinite)';
    this.logger.warn(`[${budget.clientId}] Skipping setup candidate ${candidate.mobile}: SpamBot ${detail}`);
    budget.skipped.push(`${candidate.mobile} ${detail}`);
    return false;
  }

  /** Tier-1 eligibility for `clientId`'s own pool (also tier 2 on a sibling's pool). No availableDate. */
  private buildEligibleBufferQuery(clientId: string, mobileFilter: unknown): Omit<ClientMongoQuery, 'availableDate'> {
    return {
      clientId,
      mobile: mobileFilter,
      createdAt: { $lte: new Date(Date.now() - BUFFER_PROFILE.consumerMinAgeDays * 24 * 60 * 60 * 1000) },
      // Match the warmup graduation threshold (>= MIN_CHANNELS_FOR_MATURING). Using $gt: 200
      // excluded accounts sitting at exactly the graduation count, making them count as ready
      // supply yet never swap-eligible.
      channels: { $gte: MIN_CHANNELS_FOR_MATURING },
      status: 'active',
      inUse: { $ne: true },
      warmupPhase: WarmupPhase.SESSION_ROTATED,
      // Never swap in a harsh-limited account or one whose Telegram limit has not lifted yet.
      // Accounts without spam fields stay eligible (they are probed before the swap).
      ...buildSpamEligibleFilter(),
    };
  }

  /**
   * Degraded tiers 2-4, in the given order, sharing one probe budget. Returns the first candidate
   * that passes the users check (not expired, 2FA on), the distinct-backup-session check and the
   * tier's SpamBot acceptance (frozen / unreachable accounts are always rejected).
   */
  private async findDegradedCandidate(
    existingClient: Client,
    tiers: DegradedTier[],
    budget: SetupProbeBudget,
    today: string,
    busyMobiles: string[],
  ): Promise<{ tier: DegradedTier; candidate: SafeSetupBufferCandidate; fromClientId?: string } | null> {
    for (const tier of tiers) {
      if (budget.remaining <= 0) {
        budget.moreCandidatesPending = true;
        break;
      }
      if (tier === 2) {
        const pick = await this.findSiblingCandidate(existingClient, budget, today, busyMobiles);
        if (pick) return { tier, ...pick };
        continue;
      }
      const { query, sort } = tier === 3
        ? buildTier3Query(existingClient.clientId, busyMobiles)
        : buildTier4Query(existingClient.clientId, busyMobiles);
      const candidates = await this.bufferClientService.executeQuery(query, sort, 10);
      const healthy = await this.filterServingUsers(candidates);
      this.logger.info(`[${existingClient.clientId}] Degraded tier ${tier} scan`, {
        candidateCount: candidates.length,
        healthyCount: healthy.length,
      });
      const candidate = await this.findSafeSetupBufferCandidate(healthy, existingClient.session, budget, probeAcceptanceForTier(tier));
      if (candidate) return { tier, candidate };
    }
    return null;
  }

  /**
   * Tier 2: a same-persona sibling (same dbcoll, other clientId) lends one tier-1-eligible spare,
   * only while it keeps >= SIBLING_MIN_SPARES_AFTER USABLE spares. Usable = the tier-1 query plus
   * the users checks (doc present, not expired, 2FA on) and a stored backup session distinct from
   * the spare's own session, i.e. everything a real tier-1 pick checks except the SpamBot probe.
   * Spares it might lose to a failed probe are counted as lost, so only the first
   * (usable - SIBLING_MIN_SPARES_AFTER) are ever tried.
   */
  private async findSiblingCandidate(
    existingClient: Client,
    budget: SetupProbeBudget,
    today: string,
    busyMobiles: string[],
  ): Promise<{ candidate: SafeSetupBufferCandidate; fromClientId: string } | null> {
    const persona = (existingClient.dbcoll || '').trim().toLowerCase();
    if (!persona) return null;
    const siblings = (await this.findAll()).filter((client) =>
      client.clientId !== existingClient.clientId && (client.dbcoll || '').trim().toLowerCase() === persona);
    const ranked: Array<{ siblingId: string; spares: Awaited<ReturnType<BufferClientService['executeQuery']>> }> = [];
    for (const sibling of siblings) {
      const rows = await this.bufferClientService.executeQuery(
        {
          ...this.buildEligibleBufferQuery(sibling.clientId, { $nin: [...busyMobiles, sibling.mobile] }),
          availableDate: { $lte: today },
        },
        { availableDate: 1, createdAt: 1 },
      );
      const spares = await this.filterServingUsers(rows, { requireDistinctBackup: true });
      if (spares.length >= SIBLING_MIN_SPARES_AFTER + 1) ranked.push({ siblingId: sibling.clientId, spares });
    }
    ranked.sort((a, b) => b.spares.length - a.spares.length || a.siblingId.localeCompare(b.siblingId));
    this.logger.info(`[${existingClient.clientId}] Degraded tier 2 scan`, {
      siblings: siblings.map((s) => s.clientId),
      lenders: ranked.map((r) => `${r.siblingId}:${r.spares.length}`),
    });
    for (const { siblingId, spares } of ranked) {
      const tryable = spares.slice(0, spares.length - SIBLING_MIN_SPARES_AFTER);
      const candidate = await this.findSafeSetupBufferCandidate(tryable, existingClient.session, budget, probeAcceptanceForTier(2));
      if (candidate) return { candidate, fromClientId: siblingId };
      if (budget.remaining <= 0) break;
    }
    return null;
  }

  /**
   * Degraded tiers only: keep candidates whose users doc exists, is not expired and has 2FA on.
   * requireDistinctBackup (sibling spare count) also needs a stored backup session that differs
   * from the candidate's own session; read-only, it never creates one.
   */
  private async filterServingUsers<T extends { mobile: string; session?: string }>(
    candidates: T[],
    opts: { requireDistinctBackup?: boolean } = {},
  ): Promise<T[]> {
    const kept: T[] = [];
    for (const candidate of candidates) {
      try {
        const user = (await this.usersService.findByMobileAnyStatus(candidate.mobile))?.[0];
        const backup = user?.session?.trim();
        const backupOk = !opts.requireDistinctBackup || (!!backup && backup !== (candidate.session || '').trim());
        if (user && user.expired !== true && user.twoFA === true && backupOk) kept.push(candidate);
        else this.logger.warn(`Skipping degraded candidate ${candidate.mobile}: users doc missing, expired, without 2FA${opts.requireDistinctBackup ? ' or without a distinct backup session' : ''}`);
      } catch (error) {
        this.logger.warn(`Skipping degraded candidate ${candidate.mobile}: users lookup failed (${parseError(error, '', false).message})`);
      }
    }
    return kept;
  }

  /** One notice when a client becomes degraded, changes tier, borrows a sibling spare, or is cleared. */
  private async notifyDegradedTransition(
    clientId: string,
    previous: Client,
    newMobile: string,
    plan: DegradedSwapPlan | null,
    upgradeFromTier?: DegradedTier,
  ): Promise<void> {
    if (plan?.markerTier) {
      const harsh = plan.markerTier === 4;
      await this.notify({
        severity: harsh ? 'critical' : 'warning',
        title: upgradeFromTier ? 'Degraded upgrade' : 'Degraded swap',
        summary: upgradeFromTier
          ? `Moved from degraded tier ${upgradeFromTier} to tier ${plan.markerTier}`
          : harsh
            ? 'Dead main replaced by a HARSH-limited buffer (tier 4): inbound replies only until a better buffer exists'
            : `Dead main replaced by a degraded buffer (tier ${plan.markerTier}); the swap-maintenance job will move it up`,
        fields: [
          { label: 'Client ID', value: clientId },
          { label: 'Tier', value: String(plan.markerTier), code: false },
          { label: 'New mobile', value: last4(newMobile) },
          { label: 'Old mobile', value: last4(previous.mobile) },
          { label: 'Limited until', value: plan.limitedUntil ? new Date(plan.limitedUntil).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : (harsh ? 'indefinite' : 'unknown'), code: false },
          ...(plan.fromClientId ? [{ label: 'Borrowed from', value: plan.fromClientId }] : []),
          { label: 'Reason', value: plan.reason.substring(0, 80), code: false },
        ],
      });
      return;
    }
    if (plan?.fromClientId) {
      // Tier 2 meets tier-1 rules: no marker, but the lender's pool shrank, so say so once.
      await this.notify({
        severity: 'warning',
        title: 'Buffer borrowed',
        summary: `Dead main replaced by a spare borrowed from ${plan.fromClientId} (meets tier-1 rules; no degraded marker)`,
        fields: [
          { label: 'Client ID', value: clientId },
          { label: 'Borrowed from', value: plan.fromClientId },
          { label: 'New mobile', value: last4(newMobile) },
          { label: 'Old mobile', value: last4(previous.mobile) },
          { label: 'Reason', value: plan.reason.substring(0, 80), code: false },
        ],
      });
    }
    if (previous.degraded) {
      await this.notify({
        severity: 'success',
        title: 'Degraded cleared',
        summary: `Moved from degraded tier ${previous.degraded.tier} to a normal (tier 1) buffer`,
        fields: [
          { label: 'Client ID', value: clientId },
          { label: 'New mobile', value: last4(newMobile) },
          { label: 'Old mobile', value: last4(previous.mobile) },
        ],
      });
    }
  }

  /** Clients currently running on a degraded-swap account. */
  async findDegradedClients(): Promise<Client[]> {
    return this.clientModel.find({ degraded: { $exists: true, $ne: null } }).lean<Client[]>().exec();
  }

  /**
   * Swap-maintenance job (every 30 min, run-claimed in the scheduler). Three passes over a fresh
   * read of `clients`, each client handled by at most one pass per run:
   *   1. rescue:  live-session evidence only: clients.deadMain for the CURRENT mobile with an owner
   *               dead reason (tg-aut reported it via /setupClient). users / pool rows are never
   *               evidence (CMS writes them when the BACKUP session fails). Waits
   *               DEAD_MAIN_HANDOFF_WAIT_MS after the last report (tg-aut's handoff ladder runs
   *               first), then runs the normal dead-reason setupClient (all configured tiers).
   *   2. upgrade: degraded clients (alive). If the current account now meets tier-1 rules (its
   *               limit expired, say) the marker is cleared without a swap (not an attempt);
   *               otherwise only strictly better tiers are tried.
   *   3. refill:  a main whose stored SpamBot verdict (at most MAIN_SPAM_STATUS_FRESH_MS old) says
   *               limited/harsh, once a tier-1 buffer exists. Tier-1 rules only, reason POOL_REFILL.
   * Every pass: at most 3 setup attempts per run (RESCUE / UPGRADE / POOL_REFILL _MAX_PER_RUN) and a
   * per-client episode persisted on clients.swapRetry: 30 min doubling after each miss, hard stop
   * after PASS_MAX_ATTEMPTS (one notice), re-armed only by a pool-fingerprint or mobile change. Job
   * passes never create a backup session (jobPass). Every swap goes through runSetup: the same
   * per-client lock, cross-process leases, 4-min cooldown, guards and notices as /setupClient. One
   * client's error is a 'failed' row; it never aborts the run.
   */
  async runSwapMaintenance(): Promise<{ rescue: SwapMaintenanceResult[]; upgrade: SwapMaintenanceResult[]; refill: SwapMaintenanceResult[] }> {
    const clients = await this.clientModel.find({}).lean<Client[]>().exec();
    const states = new Map<string, Awaited<ReturnType<ClientService['readMainState']>>>();
    for (const client of clients) {
      if (client?.clientId && client.mobile) states.set(client.clientId, await this.readMainState(client));
    }
    const handled = new Set<string>();
    const rescue = await this.rescueDeadMains(clients.filter((c) => states.get(c.clientId)?.dead), states, handled, clients);
    const upgrade = await this.upgradeDegradedClients(
      clients.filter((c) => !handled.has(c.clientId) && c.degraded && !states.get(c.clientId)?.dead),
      states,
      clients,
    );
    for (const row of upgrade) handled.add(row.clientId);
    const refill = await this.refillLimitedMains(
      clients.filter((c) => !handled.has(c.clientId) && !c.degraded && states.get(c.clientId)?.limited),
      clients,
    );
    return { rescue, upgrade, refill };
  }

  /** What CMS knows about a client's current main, read fresh (no cache). Never touches Telegram. */
  private async readMainState(client: Client): Promise<{
    dead: boolean;
    evidence?: string;
    limited: boolean;
    buffer: Awaited<ReturnType<BufferClientService['findOne']>> | null;
    userExpired: boolean;
  }> {
    // Rescue evidence comes from the live session only (tg-aut's dead report), never from users /
    // pool rows: CMS expires those when the BACKUP session (users[0].session) fails.
    const dead = isDeadMainEvidence(client.deadMain, client.mobile);
    const evidence = dead ? `tg-aut reported ${String(client.deadMain!.reason).substring(0, 120)}` : undefined;
    let buffer: Awaited<ReturnType<BufferClientService['findOne']>> | null = null;
    let users: User[] = [];
    try {
      buffer = (await this.bufferClientService.findOne(client.mobile, false)) ?? null;
      users = (await this.usersService.findByMobileAnyStatus(client.mobile)) ?? [];
    } catch (error) {
      this.logger.warn(`[${client.clientId}] Could not read main state: ${parseError(error, '', false).message}`);
      return { dead, evidence, limited: false, buffer: null, userExpired: false };
    }
    // Used by currentMeetsTier1 only (a degraded account with expired users docs is not "tier 1").
    const userExpired = users.length > 0 && users.every((u) => u.expired === true);
    const now = Date.now();
    const limitedUntilMs = buffer?.limitedUntil ? new Date(buffer.limitedUntil).getTime() : 0;
    const checkedAtMs = buffer?.spamCheckedAt ? new Date(buffer.spamCheckedAt).getTime() : 0;
    // A stale verdict says nothing about today: refill trusts it only when fresh.
    const fresh = checkedAtMs > 0 && now - checkedAtMs <= MAIN_SPAM_STATUS_FRESH_MS;
    const limited = !dead && !!buffer && fresh && (
      buffer.spamStatus === 'harsh' || (buffer.spamStatus === 'limited' && limitedUntilMs > now)
    );
    return { dead, evidence, limited, buffer, userExpired };
  }

  /**
   * Fingerprint of the client's candidate pool (own pool + same-persona siblings). Read fresh; no
   * Telegram. See swapPoolFingerprint for what changes it.
   */
  private async poolFingerprint(client: Client, clients: Client[]): Promise<string> {
    const persona = (client.dbcoll || '').trim().toLowerCase();
    const ids = new Set<string>([client.clientId]);
    if (persona) {
      for (const other of clients) {
        if (other.clientId && (other.dbcoll || '').trim().toLowerCase() === persona) ids.add(other.clientId);
      }
    }
    const rows = await this.bufferClientService.executeQuery({ clientId: { $in: [...ids] }, status: 'active' });
    return swapPoolFingerprint(rows as unknown as PoolFingerprintRow[], Date.now(), ClientHelperUtils.getTodayDateString());
  }

  /** Where this client's rescue / upgrade / refill episode stands (persisted on clients.swapRetry). */
  private async passDecision(pass: SwapRetryPass, client: Client, clients: Client[]): Promise<SwapRetryDecision> {
    const decision = swapRetryDecision(client.swapRetry, pass, client.mobile, await this.poolFingerprint(client, clients), Date.now());
    if (decision.kind === 'due' && decision.rearmed) {
      this.logger.log(`[${client.clientId}] ${pass}: candidate pool changed since attempt ${client.swapRetry?.attempts}; episode re-armed`);
    }
    return decision;
  }

  /**
   * Persist the outcome of one attempt. A swap ends the episode (the cutover also $unsets it). A
   * miss counts; the PASS_MAX_ATTEMPTS-th miss is the hard stop with ONE notice. Guarded on the
   * mobile so a concurrent cutover is never overwritten.
   */
  private async notePassOutcome(
    pass: SwapRetryPass,
    client: Client,
    clients: Client[],
    decision: Extract<SwapRetryDecision, { kind: 'due' }>,
    swapped: boolean,
  ): Promise<number> {
    if (swapped) {
      await this.clientModel.updateOne({ clientId: client.clientId, swapRetry: { $exists: true } }, { $unset: { swapRetry: '' } }).exec();
      return 0;
    }
    const attempts = decision.attempts + 1;
    const now = Date.now();
    const stopped = attempts >= PASS_MAX_ATTEMPTS;
    const keepSince = !decision.rearmed && decision.attempts > 0 && client.swapRetry?.since;
    const state: ClientSwapRetryState = {
      pass,
      mobile: client.mobile,
      attempts,
      nextAt: new Date(now + passRetryDelayMs(attempts)),
      // After the attempt: its own probes (spamStatus writes) must not count as a pool change.
      poolFingerprint: await this.poolFingerprint(client, clients),
      since: keepSince ? new Date(client.swapRetry!.since) : new Date(now),
      stoppedAt: stopped ? new Date(now) : null,
    };
    const written = await this.clientModel.updateOne(
      { clientId: client.clientId, mobile: client.mobile },
      { $set: { swapRetry: state } },
    ).exec();
    if (stopped && (written.matchedCount || 0) === 1) {
      const text = {
        rescue: { severity: 'critical' as const, title: 'Rescue stopped', summary: `${client.clientId} stuck on dead main, rescue stopped after ${attempts} tries, will retry when the pool changes` },
        upgrade: { severity: 'warning' as const, title: 'Upgrade stopped', summary: `${client.clientId} stays on its degraded (tier ${client.degraded?.tier ?? '?'}) account, upgrade stopped after ${attempts} tries, will retry when the pool changes` },
        refill: { severity: 'warning' as const, title: 'Pool refill stopped', summary: `${client.clientId} stays on its SpamBot-limited main, pool refill stopped after ${attempts} tries, will retry when the pool changes` },
      }[pass];
      await this.notify({
        ...text,
        fields: [
          { label: 'Client ID', value: client.clientId },
          { label: 'Mobile', value: last4(client.mobile) },
          { label: 'Since', value: state.since.toISOString() },
        ],
      });
    }
    return attempts;
  }

  /**
   * One job attempt for one client: runSetup, then the episode bookkeeping. A CMS cooldown /
   * another process's lease / a 'disabled' answer is not an attempt (nothing was probed).
   */
  private async runPassAttempt(
    pass: SwapRetryPass,
    client: Client,
    all: Client[],
    decision: Extract<SwapRetryDecision, { kind: 'due' }>,
    request: SetupClientQueryDto,
    internal: SetupInternalOptions,
  ): Promise<SwapMaintenanceResult> {
    let result: SetupClientResult;
    try {
      result = await this.runSetup(client.clientId, request, { ...internal, jobPass: true });
    } catch (error) {
      parseError(error, `[${client.clientId}] ${pass} failed`, false);
      return { clientId: client.clientId, status: 'failed', attempts: await this.notePassOutcome(pass, client, all, decision, false) };
    }
    // Nothing was probed: CMS cooldown / another process's lease, or AUTO_CLIENT_SETUP off.
    if (result.status === 'cooldown' || result.status === 'disabled') return { clientId: client.clientId, status: result.status };
    const used = await this.notePassOutcome(pass, client, all, decision, result.swapped);
    return {
      clientId: client.clientId,
      status: result.status,
      ...(result.swapped ? {} : { attempts: used }),
      ...(decision.rearmed ? { rearmed: true } : {}),
      ...(result.degradedTier ? { degradedTier: result.degradedTier } : {}),
      ...(result.newMobile ? { newMobile: result.newMobile } : {}),
    };
  }

  private async rescueDeadMains(
    clients: Client[],
    states: Map<string, Awaited<ReturnType<ClientService['readMainState']>>>,
    handled: Set<string>,
    all: Client[],
  ): Promise<SwapMaintenanceResult[]> {
    const results: SwapMaintenanceResult[] = [];
    let attempts = 0;
    for (const client of clients) {
      handled.add(client.clientId); // a dead main is never upgraded or refilled
      if (attempts >= RESCUE_MAX_PER_RUN) break;
      try {
        const reportedAt = client.deadMain?.at ? new Date(client.deadMain.at).getTime() : 0;
        if (Date.now() - reportedAt < DEAD_MAIN_HANDOFF_WAIT_MS) {
          // tg-aut's own handoff ladder for this report is still running: let it finish.
          results.push({ clientId: client.clientId, status: 'waiting_handoff' });
          continue;
        }
        const decision = await this.passDecision('rescue', client, all);
        if (decision.kind !== 'due') {
          results.push({ clientId: client.clientId, status: decision.kind === 'stopped' ? 'stopped' : 'skipped_cooldown', attempts: decision.attempts });
          continue;
        }
        attempts++;
        const evidence = states.get(client.clientId)?.evidence || String(client.deadMain?.reason);
        this.logger.warn(`[${client.clientId}] Rescue: current main ${client.mobile} is dead (${evidence}); running setupClient`);
        const row = await this.runPassAttempt('rescue', client, all, decision,
          { days: 0, archiveOld: false, formalities: false, reason: `${DEAD_MAIN_RESCUE_REASON}: ${client.deadMain!.reason}` }, {});
        results.push({ ...row, ...(client.degraded?.tier ? { fromTier: client.degraded.tier } : {}) });
      } catch (error) {
        parseError(error, `[${client.clientId}] rescue failed`, false);
        results.push({ clientId: client.clientId, status: 'failed' });
      }
    }
    return results;
  }

  /**
   * Upgrade pass: for each degraded (alive) client, clear the marker when the current account now
   * meets tier-1 rules (not an attempt), else look for a strictly better tier and swap up (at most
   * UPGRADE_MAX_PER_RUN attempts per run, same episode backoff + hard stop as rescue). The current
   * account is alive, so a swap is a normal one: the degraded account returns to the pool
   * (archiveOld) with its availableDate held to its limit. Sequential, one client at a time.
   */
  async upgradeDegradedClients(
    clients?: Client[],
    states?: Map<string, Awaited<ReturnType<ClientService['readMainState']>>>,
    all?: Client[],
  ): Promise<SwapMaintenanceResult[]> {
    const results: SwapMaintenanceResult[] = [];
    const list = clients ?? await this.findDegradedClients();
    const pool = all ?? await this.clientModel.find({}).lean<Client[]>().exec();
    let attempts = 0;
    for (const client of list) {
      const fromTier = client.degraded?.tier;
      if (fromTier !== 2 && fromTier !== 3 && fromTier !== 4) continue;
      try {
        const state = states?.get(client.clientId) ?? await this.readMainState(client);
        if (this.currentMeetsTier1(client, state)) {
          const cleared = await this.clientModel.updateOne(
            { clientId: client.clientId, mobile: client.mobile, degraded: { $exists: true } },
            { $unset: { degraded: '', swapRetry: '' } },
          ).exec();
          if ((cleared.modifiedCount || 0) === 1) {
            const cached = this.clientsMap.get(client.clientId);
            if (cached) {
              const { degraded: _dropped, ...rest } = cached;
              this.clientsMap.set(client.clientId, rest as Client);
            }
            await this.notify({
              severity: 'success',
              title: 'Degraded cleared',
              summary: `Current account now meets tier-1 rules (was degraded tier ${fromTier}); kept, no swap`,
              fields: [{ label: 'Client ID', value: client.clientId }, { label: 'Mobile', value: last4(client.mobile) }],
            });
            results.push({ clientId: client.clientId, fromTier, status: 'cleared' });
          }
          continue;
        }
        if (attempts >= UPGRADE_MAX_PER_RUN) continue; // clears above still run for every client
        const decision = await this.passDecision('upgrade', client, pool);
        if (decision.kind !== 'due') {
          results.push({ clientId: client.clientId, fromTier, status: decision.kind === 'stopped' ? 'stopped' : 'skipped_cooldown', attempts: decision.attempts });
          continue;
        }
        attempts++;
        const row = await this.runPassAttempt('upgrade', client, pool, decision,
          { days: 0, archiveOld: true, formalities: true, reason: DEGRADED_UPGRADE_REASON }, { upgradeFromTier: fromTier });
        results.push({ ...row, fromTier });
      } catch (error) {
        parseError(error, `[${client.clientId}] degraded upgrade failed`, false);
        results.push({ clientId: client.clientId, fromTier, status: 'failed' });
      }
    }
    return results;
  }

  /**
   * Tier-1 rules applied to the CURRENT (in-use) account, from stored state only: CMS never probes
   * a live main (a second connection on a non-renewable session). A stale harsh verdict does not
   * count as cleared (tier 1 would re-probe it; we cannot).
   */
  private currentMeetsTier1(client: Client, state: Awaited<ReturnType<ClientService['readMainState']>>): boolean {
    const buffer = state.buffer;
    if (!buffer || state.dead || state.userExpired) return false;
    const now = Date.now();
    const markerUntil = client.degraded?.limitedUntil ? new Date(client.degraded.limitedUntil).getTime() : 0;
    const docUntil = buffer.limitedUntil ? new Date(buffer.limitedUntil).getTime() : 0;
    const createdAt = (buffer as { createdAt?: Date | string }).createdAt;
    return buffer.clientId === client.clientId
      && buffer.status === 'active'
      && buffer.warmupPhase === WarmupPhase.SESSION_ROTATED
      && (buffer.channels ?? 0) >= MIN_CHANNELS_FOR_MATURING
      && (!createdAt || new Date(createdAt).getTime() <= now - BUFFER_PROFILE.consumerMinAgeDays * 24 * 60 * 60 * 1000)
      && buffer.spamStatus !== 'harsh'
      && docUntil <= now
      && markerUntil <= now;
  }

  /** Pool-refill pass: swap a SpamBot-limited (alive, not degraded) main once a tier-1 buffer exists. */
  private async refillLimitedMains(clients: Client[], all: Client[]): Promise<SwapMaintenanceResult[]> {
    const results: SwapMaintenanceResult[] = [];
    const today = ClientHelperUtils.getTodayDateString();
    let attempts = 0;
    for (const client of clients) {
      if (attempts >= POOL_REFILL_MAX_PER_RUN) break;
      try {
        const decision = await this.passDecision('refill', client, all);
        if (decision.kind !== 'due') {
          results.push({ clientId: client.clientId, status: decision.kind === 'stopped' ? 'stopped' : 'skipped_cooldown', attempts: decision.attempts });
          continue;
        }
        // Cheap pre-check (no probe, no notice): only ask setupClient when a tier-1 row exists.
        const busy = await this.busyCandidateMobiles(client.clientId, client.mobile);
        const spare = await this.bufferClientService.executeQuery(
          { ...this.buildEligibleBufferQuery(client.clientId, { $nin: busy }), availableDate: { $lte: today } },
          undefined,
          1,
        );
        if (!spare.length) continue;
        attempts++;
        results.push(await this.runPassAttempt('refill', client, all, decision,
          { days: 0, archiveOld: true, formalities: true, reason: POOL_REFILL_REASON }, {}));
      } catch (error) {
        parseError(error, `[${client.clientId}] pool refill failed`, false);
        results.push({ clientId: client.clientId, status: 'failed' });
      }
    }
    return results;
  }

  /** Mobiles that may never be a swap candidate for `clientId` (see handleSetupClient). */
  private async busyCandidateMobiles(clientId: string, existingMobile: string): Promise<string[]> {
    const busy = new Set<string>([existingMobile]);
    for (const mobile of this.telegramService.getActiveClientSetupMobiles()) busy.add(mobile);
    for (const client of await this.findAll()) {
      if (client.clientId !== clientId && client.mobile) busy.add(client.mobile);
    }
    return [...busy];
  }

  /** True when `mobile` has an in-flight setup registered by a different client. */
  private setupOwnedByAnotherClient(mobile: string, clientId: string): boolean {
    const setup = this.telegramService.getActiveClientSetup(mobile);
    return !!setup && setup.newMobile === mobile && setup.clientId !== clientId;
  }

  /** The clientId whose live main is `mobile`, ANY client including the caller (fresh read, no cache). */
  private async clientUsingMobile(mobile: string): Promise<string | null> {
    try {
      const owner = await this.clientModel.findOne({ mobile }, { clientId: 1, mobile: 1 }).lean<Pick<Client, 'clientId' | 'mobile'>>().exec();
      return owner && owner.mobile === mobile ? owner.clientId : null;
    } catch (error) {
      this.logger.warn(`Could not check the owner of ${mobile}: ${parseError(error, '', false).message}`);
      // Unknown owner: treat as taken, so a failure path never touches a possibly-live main.
      return 'unknown';
    }
  }

  /** The degraded plan of THIS client's in-flight cutover of `mobile` (never another client's). */
  private degradedPlanFor(clientId: string, mobile: string): DegradedSwapPlan | null {
    const plan = this.degradedPlans.get(`${clientId}:${mobile}`);
    return plan && plan.clientId === clientId ? plan : null;
  }

  /**
   * Daily summary: every degraded client, plus clients with zero tier-1-eligible spares (the next
   * dead account there would go degraded). Sends nothing when both lists are empty.
   */
  async sendDegradedSummary(): Promise<{ degraded: number; emptyPools: number; stuck: number }> {
    const degraded = await this.findDegradedClients();
    // Rescue / refill episodes at the hard stop, still on the same main (a new main ends the episode).
    const stuck = (await this.clientModel.find({ 'swapRetry.stoppedAt': { $ne: null } }).lean<Client[]>().exec())
      .filter((c) => c.swapRetry?.stoppedAt && c.swapRetry.mobile === c.mobile);
    const today = ClientHelperUtils.getTodayDateString();
    const emptyPools: string[] = [];
    for (const client of await this.findAll()) {
      const spares = await this.bufferClientService.executeQuery(
        { ...this.buildEligibleBufferQuery(client.clientId, { $ne: client.mobile }), availableDate: { $lte: today } },
        undefined,
        1,
      );
      if (!spares.length) emptyPools.push(client.clientId);
    }
    if (!degraded.length && !emptyPools.length && !stuck.length) return { degraded: 0, emptyPools: 0, stuck: 0 };
    const tables: NotificationTable[] = [];
    if (degraded.length) {
      tables.push({
        title: 'Degraded clients',
        columns: ['Client', 'Tier', 'Mobile', 'Since', 'Limited until'],
        rows: degraded.map((c) => [
          c.clientId,
          String(c.degraded?.tier ?? '?'),
          last4(c.mobile),
          c.degraded?.since ? new Date(c.degraded.since).toISOString().slice(0, 10) : '?',
          c.degraded?.limitedUntil ? new Date(c.degraded.limitedUntil).toISOString().slice(0, 10) : (c.degraded?.tier === 4 ? 'indefinite' : '-'),
        ]),
      });
    }
    if (emptyPools.length) {
      tables.push({ title: 'No eligible spare (pool empty)', columns: ['Client'], rows: emptyPools.map((id) => [id]) });
    }
    if (stuck.length) {
      tables.push({
        title: 'Stuck (retries stopped until the pool changes)',
        columns: ['Client', 'Pass', 'Mobile', 'Tries', 'Stopped'],
        rows: stuck.map((c) => [
          c.clientId,
          c.swapRetry!.pass,
          last4(c.mobile),
          String(c.swapRetry!.attempts),
          new Date(c.swapRetry!.stoppedAt!).toISOString().slice(0, 16),
        ]),
      });
    }
    const deadStuck = stuck.some((c) => c.swapRetry?.pass === 'rescue');
    await this.notify({
      severity: deadStuck || degraded.some((c) => c.degraded?.tier === 4) ? 'error' : 'warning',
      title: 'Degraded daily',
      summary: `${degraded.length} degraded client(s); ${emptyPools.length} client(s) with no eligible spare; ${stuck.length} stuck client(s)`,
      tables,
    });
    return { degraded: degraded.length, emptyPools: emptyPools.length, stuck: stuck.length };
  }

  private async assertDistinctUserBackupSession(mobile: string, activeSession: string): Promise<User> {
    let user: User | null;
    try {
      user = await this.bufferClientService.getOrEnsureDistinctUsersBackupSession(mobile, activeSession);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw error;
    }
    if (!user) {
      throw new BadRequestException(`Failed to create distinct backup session for ${mobile}`);
    }

    if (user.session?.trim() && user.session.trim() !== activeSession.trim()) {
      return user;
    }
    throw new BadRequestException(`Distinct backup session was not persisted for ${mobile}`);
  }

  async updateClient(clientId: string, message: string = '', skipDeploy = false, throwOnFailure = false, skipUsername = false): Promise<boolean> {
    this.logger.log(`Updating Client: ${clientId} - ${message}`);
    if (!this.canUpdateClient(clientId)) return false;
    const client = await this.findOne(clientId);
    if (!client) {
      const notFoundError = new NotFoundException(`Client not found: ${clientId}`);
      this.logger.error(notFoundError.message);
      if (throwOnFailure) throw notFoundError;
      return false;
    }
    try {
      this.lastUpdateMap.set(clientId, Date.now());
      const telegramClient = await connectionManager.getClient(client.mobile, { handler: false });
      if (!telegramClient) throw new Error(`Unable to fetch Telegram client for ${client.mobile}`);
      await sleep(2000);
      const me = await telegramClient.getMe();
      if (!me) throw new Error(`Unable to fetch 'me' for ${clientId}`);
      const activeAssignment = await this.getActiveClientAssignment(client);
      const mirroredActiveName = this.buildMirroredActiveName(activeAssignment, '');
      if (mirroredActiveName && client.name !== mirroredActiveName) {
        await this.update(clientId, { name: mirroredActiveName });
        client.name = mirroredActiveName;
        this.logger.debug(`[${clientId}] Mirrored active buffer name onto client document`, {
          mirroredActiveName,
        });
      }
      if (!skipUsername) {
        await this.updateClientUsername(client, me, activeAssignment);
      } else {
        this.logger.debug(`[${clientId}] Skipping username update — already set from buffer`);
      }
      const nameBioReady = await this.updateClientIdentity(client, telegramClient, me, activeAssignment);
      const privacyReady = await this.updateClientPrivacy(client, telegramClient);
      const photosReady = await this.updateClientPhotos(client, telegramClient, activeAssignment);
      await this.stampActiveBufferLifecycle(client.mobile, {
        ...(nameBioReady ? { nameBioUpdatedAt: new Date() } : {}),
        ...(privacyReady ? { privacyUpdatedAt: new Date() } : {}),
        ...(photosReady ? { profilePicsUpdatedAt: new Date() } : {}),
      });
      await this.notify({ severity: 'success', title: 'Client updated', fields: [{ label: 'Client ID', value: clientId }, { label: 'Mobile', value: client.mobile }, { label: 'Reason', value: message, code: false }] });
      if (!skipDeploy && client.deployKey) await fetchWithTimeout(client.deployKey);
      return true;
    } catch (error) {
      this.lastUpdateMap.delete(clientId);
      const errorDetails = parseError(error, `[${clientId}] [${client.mobile}] updateClient failed`);
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.notify({ severity: 'error', title: 'Update failed', fields: [{ label: 'Client ID', value: clientId }, { label: 'Mobile', value: client.mobile }, { label: 'Reason', value: message, code: false }], details: errorMessage?.substring(0, 500), detailsTitle: 'Error message' });
      if (isPermanentError(errorDetails)) {
        this.logger.warn(`Permanent error while updating active client ${clientId}; manual review required for ${client.mobile}`);
      }
      if (throwOnFailure) throw error;
      return false;
    } finally {
      await connectionManager.unregisterClient(client.mobile);
    }
  }

  private canUpdateClient(clientId: string): boolean {
    const lastUpdate = this.lastUpdateMap.get(clientId) || 0;
    if (Date.now() - lastUpdate < CONFIG.UPDATE_CLIENT_COOLDOWN) {
      const waitTime = Math.ceil((CONFIG.UPDATE_CLIENT_COOLDOWN - (Date.now() - lastUpdate)) / 1000);
      this.logger.log(
        `Skipping update for ${clientId} - cooldown not elapsed. Try again in ${waitTime} seconds`,
      );
      return false;
    }
    return true;
  }

  private buildMirroredActiveName(assignment: PersonaAssignmentLike | null | undefined, fallback: string): string {
    const mirroredName = [
      assignment?.assignedFirstName?.trim(),
      assignment?.assignedLastName?.trim(),
    ]
      .filter((part): part is string => !!part)
      .join(' ')
      .trim();

    return mirroredName || fallback;
  }

  private getExpectedClientName(client: Client, activeAssignment: PersonaAssignmentRecord | null): string {
    return this.buildMirroredActiveName(activeAssignment, client.name);
  }

  private async stampActiveBufferLifecycle(mobile: string, update: Pick<UpdateBufferClientDto, 'nameBioUpdatedAt' | 'privacyUpdatedAt' | 'profilePicsUpdatedAt'>) {
    if (!mobile || Object.keys(update).length === 0) {
      return;
    }

    try {
      await this.bufferClientService.update(mobile, update);
      this.logger.debug(`Stamped active buffer lifecycle state for ${mobile}`, update);
    } catch (error) {
      this.logger.warn(`Failed to stamp active buffer lifecycle state for ${mobile}`);
      parseError(error, `[${mobile}] Failed to stamp active buffer lifecycle state`);
    }
  }

  private async updateClientUsername(client: Client, me: Api.User, activeAssignment: PersonaAssignmentRecord | null) {
    // Username was already set during buffer warmup — skip if Telegram still has it
    if (client.username && me.username === client.username) {
      this.logger.debug(`[${client.clientId}] Username @${me.username} matches stored value, skipping update`);
      return;
    }
    const updatedUsername = await this.telegramService.updateUsernameForAClient(
      client.mobile,
      client.clientId,
      this.getExpectedClientName(client, activeAssignment),
      me.username,
    );
    if (updatedUsername) {
      await this.update(client.clientId, { username: updatedUsername });
      this.logger.log(`[${client.clientId}] Username updated to: ${updatedUsername}`);
      await sleep(10000);
    } else {
      this.logger.warn(`[${client.clientId}] Failed to update username`);
    }
  }

  private async updateClientIdentity(client: Client, tgManager: TelegramManager, me: Api.User, activeAssignment: PersonaAssignmentRecord | null): Promise<boolean> {
    const hasIdentityAssignment = !!(
      activeAssignment?.assignedFirstName?.trim() ||
      activeAssignment?.assignedLastName?.trim() ||
      activeAssignment?.assignedBio != null
    );

    if (!hasIdentityAssignment) {
      this.logger.debug(`[${client.clientId}] Skipping active identity update: no active buffer assignment present`);
      return false;
    }

    const expectedFirstName = activeAssignment?.assignedFirstName?.trim() || '';
    const expectedLastName = activeAssignment?.assignedLastName?.trim() || '';
    const expectedBio = activeAssignment?.assignedBio ?? null;
    const fullUser = await tgManager.client.invoke(
      new Api.users.GetFullUser({ id: new Api.InputUserSelf() }),
    ) as Api.users.UserFull & { users?: Api.User[] };
    const currentLastName = fullUser?.users?.[0]?.lastName || '';
    const currentBio = fullUser?.fullUser?.about || null;
    const firstNameWrong = !!expectedFirstName && !nameMatchesAssignment(me?.firstName || '', expectedFirstName);
    const lastNameWrong = activeAssignment?.assignedLastName != null && !lastNameMatches(currentLastName, expectedLastName);
    const bioWrong = expectedBio != null && !bioMatches(currentBio, expectedBio);

    if (firstNameWrong || lastNameWrong || bioWrong) {
      const expectedDisplayName = [expectedFirstName, expectedLastName].filter(Boolean).join(' ');
      this.logger.log(`[${client.clientId}] Active identity mismatch. Actual: ${[me.firstName, currentLastName].filter(Boolean).join(' ')}, Expected: ${expectedDisplayName || '(none)'}, BioExpected: ${expectedBio ?? '(skip)'}`);
      await tgManager.client.invoke(new Api.account.UpdateProfile({
        ...(expectedFirstName ? { firstName: expectedFirstName } : {}),
        ...(activeAssignment?.assignedLastName != null ? { lastName: expectedLastName } : {}),
        ...(expectedBio != null ? { about: expectedBio } : {}),
      }));
      await sleep(5000);
    } else {
      this.logger.log(`[${client.clientId}] Active identity already correct`);
    }

    return true;
  }

  private async updateClientPrivacy(client: Client, tgManager: TelegramManager): Promise<boolean> {
    await tgManager.updatePrivacy();
    this.logger.log(`[${client.clientId}] Privacy settings updated`);
    await sleep(5000);
    return true;
  }

  private async updateClientPhotos(
    client: Client,
    telegramClient: TelegramManager,
    activeAssignment: PersonaAssignmentRecord | null,
  ): Promise<boolean> {
    const photos = await telegramClient.client.invoke(
      new Api.photos.GetUserPhotos({ userId: 'me', offset: 0 }),
    );
    const photoCount = photos?.photos?.length || 0;
    const profilePicUrls = (activeAssignment?.assignedProfilePics || [])
      .filter((url) => typeof url === 'string' && url.trim().length > 0)
      .slice(0, 3);
    const canManagePhotos = profilePicUrls.length >= 2;

    if (!canManagePhotos) {
      this.logger.warn(`[${client.clientId}] Skipping profile photo update: active buffer assignment does not have at least 2 profile pic URLs`);
      return false;
    }

    if (photoCount < 2) {
      this.logger.warn(`[${client.clientId}] No profile photos found. Uploading new ones...`);
      if (photoCount > 0) await telegramClient.deleteProfilePhotos();
      await sleep(6000 + Math.random() * 3000);
      for (let index = 0; index < profilePicUrls.length; index++) {
        const url = profilePicUrls[index];
        const tempPath = path.join('/tmp', `client-profile-${client.clientId}-${Date.now()}-${index}.jpg`);
        try {
          const buffer = await downloadFileFromUrl(url);
          fs.writeFileSync(tempPath, buffer);
          await telegramClient.updateProfilePic(tempPath);
          this.logger.debug(`[${client.clientId}] Uploaded profile photo from URL`, { url });
          await sleep(20000 + Math.random() * 15000);
        } finally {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        }
      }
    } else {
      this.logger.log(`[${client.clientId}] Profile photos already exist (${photoCount})`);
    }

    return true;
  }

  async updateClients() {
    const clients = await this.findAll();
    for (const client of clients) {
      await this.updateClient(client.clientId, `Force Updating Client: ${client.clientId}`);
    }
  }

  async executeQuery(query: ExecuteClientQueryDto['query'], sort?: ClientQuerySort, limit?: number, skip?: number): Promise<Client[]> {
    if (!query) throw new BadRequestException('Query is invalid.');
    const queryExec = this.clientModel.find(query);
    if (sort) queryExec.sort(sort);
    if (limit) queryExec.limit(limit);
    if (skip) queryExec.skip(skip);
    return queryExec.exec();
  }

  async getPersonaPool(clientId: string) {
    const client = await this.findOne(clientId, false);
    if (!client) return null;
    return {
      firstNames: client.firstNames || [],
      bufferLastNames: client.bufferLastNames || [],
      promoteLastNames: client.promoteLastNames || [],
      bios: client.bios || [],
      profilePics: client.profilePics || [],
      dbcoll: (client.dbcoll || '').toLowerCase(),
    };
  }

  private buildPersonaAssignmentFilter(clientId: string): Record<string, unknown> {
    return {
      clientId,
      status: 'active',
      $or: [
        { assignedFirstName: { $ne: null } },
        { assignedLastName: { $ne: null } },
        { assignedBio: { $ne: null } },
        { 'assignedProfilePics.0': { $exists: true } },
      ],
    };
  }

  private hasPersonaAssignment<T extends PersonaAssignmentLike>(doc: T | null | undefined): doc is T {
    return !!doc && !!(
      doc.assignedFirstName ||
      doc.assignedLastName ||
      doc.assignedBio ||
      doc.assignedProfilePics?.length
    );
  }

  async getActiveClientAssignment(client: Partial<Client> | null | undefined): Promise<PersonaAssignmentRecord | null> {
    if (!client?.clientId || !client.mobile) {
      return null;
    }

    let bufferDoc: BufferPersonaAssignmentDoc | null = null;
    try {
      bufferDoc = await this.bufferClientService.model
        .findOne(
          { clientId: client.clientId, mobile: client.mobile },
          {
            mobile: 1,
            assignedFirstName: 1,
            assignedLastName: 1,
            assignedBio: 1,
            assignedProfilePics: 1,
          },
        )
        .lean();
    } catch (error) {
      this.logger.warn(`[${client.clientId}] Failed to load active buffer assignment for ${client.mobile}`);
      return null;
    }

    if (!this.hasPersonaAssignment(bufferDoc)) {
      return null;
    }

    return {
      mobile: bufferDoc?.mobile || '',
      assignedFirstName: bufferDoc?.assignedFirstName || null,
      assignedLastName: bufferDoc?.assignedLastName || null,
      assignedBio: bufferDoc?.assignedBio || null,
      assignedProfilePics: bufferDoc?.assignedProfilePics || [],
      source: 'activeClient',
    };
  }

  async getExistingAssignments(clientId: string, scope: 'all' | 'buffer' | 'activeClient') {
    const assignments: PersonaAssignmentRecord[] = [];

    const projection = {
      mobile: 1, assignedFirstName: 1, assignedLastName: 1,
      assignedBio: 1, assignedProfilePics: 1,
    };
    const filter = this.buildPersonaAssignmentFilter(clientId);

    if (scope === 'all' || scope === 'buffer') {
      const buffers = await this.bufferClientService.model
        .find(filter, projection).lean();
      assignments.push(...buffers.map(b => ({
        mobile: b.mobile,
        assignedFirstName: b.assignedFirstName,
        assignedLastName: b.assignedLastName || null,
        assignedBio: b.assignedBio || null,
        assignedProfilePics: b.assignedProfilePics || [],
        source: 'buffer' as const,
      })));
    }
    if (scope === 'all' || scope === 'activeClient') {
      const client = await this.findOne(clientId, false);
      const activeClientAssignment = await this.getActiveClientAssignment(client);
      const alreadyIncluded = activeClientAssignment
        ? assignments.some((assignment) => assignment.mobile === activeClientAssignment.mobile)
        : false;
      if (activeClientAssignment && !alreadyIncluded) {
        assignments.push(activeClientAssignment);
      }
    }

    this.logger.debug(`[${clientId}] Existing persona assignments fetched`, {
      scope,
      assignmentCount: assignments.length,
      sources: assignments.map((assignment) => assignment.source),
    });
    return { assignments };
  }

}
