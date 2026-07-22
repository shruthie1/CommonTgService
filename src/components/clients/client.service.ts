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
import { notifbot } from '../../utils/logbots';
import { connectionManager } from '../Telegram/utils/connection-manager';
import { SortOrder } from 'mongoose';
import path from 'path';
import * as fs from 'fs';
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

interface SafeSetupBufferCandidate {
  mobile: string;
  session: string;
  backupUser: User;
}

export type SetupClientStatus =
  | 'swapped'
  | 'disabled'
  | 'cooldown'
  | 'client_not_found'
  | 'no_candidate'
  | 'failed';

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
    return clients.map(({ session, mobile, password, ...maskedClient }) => maskedClient);
  }

  async findOneMasked(clientId: string): Promise<Partial<Client>> {
    const client = await this.findOne(clientId, true);
    const { session, mobile, password, ...maskedClient } = client;
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
      const { session, mobile, password, ...maskedClient } = client;
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
      const updatedClient = await this.executeWithRetry(() =>
        this.clientModel
          .findOneAndUpdate(
            { clientId },
            { $set: cleanUpdateDto },
            { new: true, runValidators: true },
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
    await this.notify(`Updating client ${clientId}`);
  }

  private async notify(message: string): Promise<void> {
    try {
      await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(message)}`, {
        timeout: 5000,
      });
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
    setupPromise = this.handleSetupClient(clientId, setupClientQueryDto)
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

  private canSetupClient(clientId: string): boolean {
    const lastSetup = this.setupCooldownMap.get(clientId) || 0;
    return Date.now() > lastSetup + CONFIG.COOLDOWN_PERIOD;
  }

  private async handleSetupClient(clientId: string, setupClientQueryDto: SetupClientQueryDto): Promise<SetupClientResult> {
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
    const baseCandidateQuery: Omit<ClientMongoQuery, 'availableDate'> = {
      clientId,
      mobile: setupClientQueryDto.mobile || { $ne: existingClientMobile },
      createdAt: { $lte: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) },
      // Match the warmup graduation threshold (>= MIN_CHANNELS_FOR_MATURING). Using $gt: 200
      // excluded accounts sitting at exactly the graduation count, making them count as ready
      // supply yet never swap-eligible.
      channels: { $gte: MIN_CHANNELS_FOR_MATURING },
      status: 'active',
      inUse: { $ne: true },
      warmupPhase: WarmupPhase.SESSION_ROTATED,
    };
    const dueCandidateQuery: ClientMongoQuery = {
      ...baseCandidateQuery,
      availableDate: { $lte: today },
    };
    const candidateBufferClients = await this.bufferClientService.executeQuery(dueCandidateQuery, { availableDate: 1, createdAt: 1 }, 10);
    this.logger.info(
      `[${clientId}] Setup candidate scan completed`,
      { existingMobile: existingClientMobile, candidateCount: candidateBufferClients.length, query: dueCandidateQuery },
    );
    let newBufferClient = await this.findSafeSetupBufferCandidate(candidateBufferClients, existingClient.session);
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
      newBufferClient = await this.findSafeSetupBufferCandidate(futureCandidateBufferClients, existingClient.session);
      usedFutureAvailableFallback = !!newBufferClient;
      this.logger.warn(`[${clientId}] Permanent replacement fallback scan completed`, {
        existingMobile: existingClientMobile,
        reason: setupClientQueryDto.reason,
        candidateCount: futureCandidateBufferClients.length,
        selected: newBufferClient?.mobile,
        query: futureCandidateQuery,
      });
    }
    if (!newBufferClient) {
      let existingRetired = false;
      if (permanentReplacement) {
        this.logger.warn(`[${clientId}] No replacement buffer available, but setup reason is permanent; marking existing mobile inactive`, {
          existingMobile: existingClientMobile,
          reason: setupClientQueryDto.reason,
        });
        await this.retireReplacedMobile(existingClientMobile, setupClientQueryDto.reason);
        existingRetired = true;
      }
      await this.notify(`Buffer not available ${clientId}: no safe buffer clients for swap`);
      this.logger.log('Buffer Clients not safely available');
      return {
        status: 'no_candidate',
        swapped: false,
        clientId,
        existingMobile: existingClientMobile,
        existingRetired,
        message: 'No safe buffer client is currently available',
      };
    }
    // A real swap is proceeding — start the cooldown now so a genuine in-progress setup is not
    // retried concurrently, while a prior no-buffer run does not lock this path out.
    this.setupCooldownMap.set(clientId, Date.now());
    try {
      this.logger.info(
        `[${clientId}] Selected replacement buffer client`,
        {
          existingMobile: existingClientMobile,
          newMobile: newBufferClient.mobile,
          usedFutureAvailableFallback,
        },
      );
      await this.notify(
        `Swap started ${clientId}: ${existingClient.mobile} (@${existingClient.username}) → ${newBufferClient.mobile}`,
      );
      this.telegramService.setActiveClientSetup({
        ...setupClientQueryDto,
        clientId,
        existingMobile: existingClientMobile,
        newMobile: newBufferClient.mobile,
      });
      this.logger.debug(`[${clientId}] Active client setup registered`, {
        existingMobile: existingClientMobile,
        newMobile: newBufferClient.mobile,
        returnOldToPool: setupClientQueryDto.archiveOld,
        formalities: setupClientQueryDto.formalities,
      });
      await connectionManager.getClient(newBufferClient.mobile);
      await this.updateClientSession(newBufferClient.session, newBufferClient.mobile);
      return {
        status: 'swapped',
        swapped: true,
        clientId,
        existingMobile: existingClientMobile,
        newMobile: newBufferClient.mobile,
        usedFutureAvailableFallback,
        message: 'Client swap completed',
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorDetails = parseError(error, `setupClient failed for ${newBufferClient.mobile}`);
      const permanent = isPermanentError(errorDetails);
      await this.notify(
        `Swap FAILED ${clientId}: ${existingClient.mobile} → ${newBufferClient.mobile}\n${errorMessage.substring(0, 120)}${permanent ? ' — buffer inactivated (permanent error)' : ''}`,
      );
      if (permanent) {
        // Account is permanently dead — retire it everywhere (user + pools), don't recycle
        await this.usersService.expireAccount(newBufferClient.mobile, `Setup failed permanently: ${errorDetails.message}`);
      } else {
        // Transient error — push availability out so it's not retried immediately
        const availableDate = ClientHelperUtils.toDateString(Date.now() + 3 * 24 * 60 * 60 * 1000);
        await this.bufferClientService.createOrUpdate(newBufferClient.mobile, { availableDate });
      }
      this.telegramService.clearActiveClientSetup(newBufferClient.mobile);
      return {
        status: 'failed',
        swapped: false,
        clientId,
        existingMobile: existingClientMobile,
        newMobile: newBufferClient.mobile,
        message: errorMessage.substring(0, 200),
      };
    } finally {
      await connectionManager.unregisterClient(newBufferClient.mobile);
    }
  }

  async updateClientSession(newSession: string, setupMobile?: string) {
    const setup = this.telegramService.getActiveClientSetup(setupMobile);
    if (!setup) {
      const scope = setupMobile ? ` for ${setupMobile}` : '';
      throw new BadRequestException(`No active client setup found${scope}`);
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
      await this.notify(`Cutover username ${clientId}: ${newMobile} @${updatedUsername}`);
      if (!newSession?.trim()) {
        throw new BadRequestException(`Invalid replacement session for ${newMobile}`);
      }
      const mirroredActiveName = this.buildMirroredActiveName(bufferDoc, existingClient.name);
      await this.commitClientCutover(clientId, existingMobile, {
        mobile: newMobile,
        username: updatedUsername,
        session: newSession,
        name: mirroredActiveName,
      });
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
        await this.notify(`Deploy restart FAILED ${clientId}: ${newMobile} (cutover done)\n${deployMessage?.substring(0, 120)}`);
      }
      this.logger.info(`[${clientId}] Starting replaced-client pool-return handling`, {
        existingMobile,
        returnOldToPool,
        formalities,
        days,
      });
      await this.handleReplacedClient(existingClient, existingMobile, formalities, returnOldToPool, days, reason);
      this.logger.info(`[${clientId}] Client session cutover finished`, { existingMobile, newMobile });
      await this.notify(`Swap complete ${clientId}: ${existingMobile} → ${newMobile}`);
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
  ): Promise<Client> {
    if (!updateClientDto.session?.trim()) {
      throw new BadRequestException('Cannot update client with a blank session');
    }

    const cleanUpdateDto: Mutable<UpdateClientDto> = this.cleanUpdateObject(updateClientDto);
    cleanUpdateDto.mobile = this.canonicalMobile(cleanUpdateDto.mobile!);
    await this.notifyClientUpdate(clientId);

    const session: ClientSession = await this.clientModel.db.startSession();
    let updatedClient: Client | null = null;
    try {
      await session.withTransaction(async () => {
        updatedClient = await this.clientModel
          .findOneAndUpdate(
            { clientId, mobile: this.canonicalMobile(expectedExistingMobile) },
            { $set: cleanUpdateDto },
            { new: true, runValidators: true, session },
          )
          .lean()
          .exec();
        if (!updatedClient) {
          throw new ConflictException(
            `Client "${clientId}" changed before cutover; expected mobile ${expectedExistingMobile}`,
          );
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
        await this.notify(`Pool return ${existingMobile}: user doc missing — buffer inactivated`);
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
        await this.notify(`Pool return skipped ${existingMobile}: inactivated`);
      }
    } catch (e) {
      const errorDetails = parseError(e, `Error returning replaced client to buffer pool: ${existingMobile}`, false);
      const errorMessage = e instanceof Error ? e.message : String(e);
      if (isPermanentError(errorDetails)) {
        await this.retireReplacedMobile(existingMobile, errorMessage);
      }
      await this.notify(`Pool return FAILED ${existingMobile}\n${errorMessage?.substring(0, 120)}`);
    }
  }

  private isPermanentReplacementReason(reason?: string): reason is string {
    return !!reason && isPermanentError({ message: reason });
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
    try {
      await this.usersService.expireAccount(mobile, reason);
      this.logger.warn(`Replaced account retired (expired + pools deactivated)`, { mobile, reason: reason.substring(0, 160) });
      await this.notify(`Buffer inactivated ${mobile}: ${reason.substring(0, 120)}`);
    } catch (error) {
      const errorDetails = parseError(error, `Failed to retire replaced account: ${mobile}`, false);
      this.logger.error(`Failed to retire replaced account ${mobile}: ${errorDetails.message}`);
      await this.notify(`Buffer inactivate FAILED ${mobile}: ${reason.substring(0, 100)}\n${errorDetails.message.substring(0, 120)}`);
    }
  }

  private async handleFormalities(mobile: string) {
    try {
      await this.telegramService.updatePrivacyforDeletedAccount(mobile);
      this.logger.log('Formalities finished');
      await this.notify(`Formalities complete ${mobile}: privacy updated`);
    } finally {
      await connectionManager.unregisterClient(mobile);
    }
  }

  private async returnOldClientToBufferPool(
    existingClient: Client,
    existingClientUser: User,
    existingMobile: string,
    days: number,
  ) {
    try {
      await this.assertDistinctUserBackupSession(existingMobile, existingClient.session);
      const existingBufferClient = await this.bufferClientService.findOne(existingMobile, false);
      const availableDate = ClientHelperUtils.toDateString(Date.now() + days * 24 * 60 * 60 * 1000);
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
        sessionRotatedAt: null,
        message: 'Returned to buffer pool; channel capacity will be verified',
      };
      const updatedBufferClient = await this.bufferClientService.createOrUpdate(
        existingMobile,
        bufferClientDto,
      );
      this.logger.log('Client returned to buffer pool:', updatedBufferClient);
      await this.notify(`Returned ${existingMobile} → buffer pool, available ${availableDate}`);
    } catch (error) {
      const errorDetails = parseError(error, `Error returning old client to buffer pool: ${existingMobile}`, true);
      await this.notify(`Pool return error ${existingMobile}\n${errorDetails.message?.substring(0, 120)}`);
      if (isPermanentError(errorDetails)) {
        this.logger.log('Marking replaced buffer inactive:', existingMobile);
        await this.retireReplacedMobile(existingMobile, errorDetails.message);
        // await this.bufferClientService.remove(existingClientUser.mobile, 'Deactivated user');
      } else {
        // Transient failure: the cutover already happened, so the old primary is no longer
        // the live account — but it is still inUse=true/status=active. Release the
        // reservation and push availability forward so it returns to the buffer pool for a
        // later retry instead of being stranded inUse=true (excluded from every selection).
        const retryAvailableDate = ClientHelperUtils.toDateString(Date.now() + days * 24 * 60 * 60 * 1000);
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
    candidates: Array<{ mobile: string; session?: string }>,
    existingClientSession: string,
  ): Promise<SafeSetupBufferCandidate | null> {
    for (const candidate of candidates) {
      if (!candidate?.mobile || !candidate?.session) continue;
      if (candidate.session === existingClientSession) {
        this.logger.warn(`Skipping setup candidate ${candidate.mobile}: session matches current main client`);
        continue;
      }

      try {
        const backupUser = await this.assertDistinctUserBackupSession(candidate.mobile, candidate.session);
        if (!backupUser.session?.trim() || backupUser.session.trim() === candidate.session.trim()) {
          this.logger.warn(`Skipping setup candidate ${candidate.mobile}: backup session is still duplicated`);
          continue;
        }
        return { mobile: candidate.mobile, session: candidate.session, backupUser };
      } catch (error) {
        this.logger.warn(`Skipping setup candidate ${candidate.mobile}: failed to ensure distinct backup session`);
        continue;
      }
    }

    return null;
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
      await this.notify(`Client updated ${clientId}: ${client.mobile} — ${message}`);
      if (!skipDeploy && client.deployKey) await fetchWithTimeout(client.deployKey);
      return true;
    } catch (error) {
      this.lastUpdateMap.delete(clientId);
      const errorDetails = parseError(error, `[${clientId}] [${client.mobile}] updateClient failed`);
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.notify(`Client update FAILED ${clientId}: ${client.mobile} — ${message}\n${errorMessage?.substring(0, 120)}`);
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
