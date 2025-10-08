import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  forwardRef,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Client, ClientDocument } from './schemas/client.schema';
import { CreateClientDto } from './dto/create-client.dto';
import { SetupClientQueryDto } from './dto/setup-client.dto';
import { BufferClientService } from '../buffer-clients/buffer-client.service';
import { sleep } from 'telegram/Helpers';
import { UsersService } from '../users/users.service';
import {
  attemptReverseFuzzy,
  getRandomEmoji,
  getReadableTimeDifference,
  Logger,
  obfuscateText,
  toBoolean,
} from '../../utils';
import { UpdateClientDto } from './dto/update-client.dto';
import { CreateBufferClientDto } from '../buffer-clients/dto/create-buffer-client.dto';
import { UpdateBufferClientDto } from '../buffer-clients/dto/update-buffer-client.dto';
import { CloudinaryService } from '../../cloudinary';
import { SearchClientDto } from './dto/search-client.dto';
import { parseError } from '../../utils/parseError';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { notifbot } from '../../utils/logbots';
import { connectionManager } from '../Telegram/utils/connection-manager';
import {
  PromoteClient,
  PromoteClientDocument,
} from '../promote-clients/schemas/promote-client.schema';
import path from 'path';
import { Api } from 'telegram/tl';
import isPermanentError from '../../utils/isPermanentError';
import { TelegramService } from '../Telegram/Telegram.service';
import TelegramManager from '../Telegram/TelegramManager';
import { User } from '../users';

// Configuration constants
const CONFIG = {
  REFRESH_INTERVAL: 5 * 60 * 1000, // 5 minutes
  CACHE_TTL: 10 * 60 * 1000, // 10 minutes
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 second
  CACHE_WARMUP_THRESHOLD: 20,
  COOLDOWN_PERIOD: 240000, // 4 minutes
  UPDATE_CLIENT_COOLDOWN: 30000, // 30 seconds
  PHOTO_PATHS: ['dp1.jpg', 'dp2.jpg', 'dp3.jpg'],
};

interface CacheMetadata {
  lastUpdated: number;
  isStale: boolean;
}

interface SearchResult {
  clients: Client[];
  searchType: 'direct' | 'promoteMobile' | 'mixed';
  promoteMobileMatches?: Array<{ clientId: string; mobile: string }>;
}

@Injectable()
export class ClientService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(ClientService.name);
  private lastUpdateMap: Map<string, number> = new Map();
  private setupCooldownMap: Map<string, number> = new Map();
  private clientsMap: Map<string, Client> = new Map();
  private cacheMetadata: CacheMetadata = { lastUpdated: 0, isStale: true };
  private checkInterval: NodeJS.Timeout | null = null;
  private refreshInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;
  private isShuttingDown = false;
  private refreshPromise: Promise<void> | null = null;

  constructor(
    @InjectModel(Client.name) private readonly clientModel: Model<ClientDocument>,
    @InjectModel(PromoteClient.name)
    private readonly promoteClientModel: Model<PromoteClientDocument>,
    @Inject(forwardRef(() => TelegramService))
    private readonly telegramService: TelegramService,
    @Inject(forwardRef(() => BufferClientService))
    private readonly bufferClientService: BufferClientService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) { }

  async onModuleInit(): Promise<void> {
    await this.handleErrors('initialize service', async () => {
      await this.refreshCacheFromDatabase();
      this.startPeriodicTasks();
      this.isInitialized = true;
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;
    await this.handleErrors('shutdown service', async () => {
      if (this.checkInterval) clearInterval(this.checkInterval);
      if (this.refreshInterval) clearInterval(this.refreshInterval);
      if (this.refreshPromise) await this.refreshPromise;
      await connectionManager.shutdown();
      this.clientsMap.clear();
    });
  }

  private startPeriodicTasks(): void {
    this.checkInterval = setInterval(async () => {
      if (this.isShuttingDown) return;
      await this.performPeriodicRefresh();
    }, CONFIG.REFRESH_INTERVAL);

    this.refreshInterval = setInterval(() => {
      if (this.isShuttingDown) return;
      this.updateCacheMetadata();
    }, 60000);
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
    await this.handleErrors('refresh cache', async () => {
      const documents = await this.executeWithRetry(() =>
        this.clientModel.find({}, { _id: 0, updatedAt: 0 }).lean().exec(),
      );
      const newClientsMap = new Map<string, Client>();
      documents.forEach((client) => newClientsMap.set(client.clientId, client));
      this.clientsMap = newClientsMap;
      this.cacheMetadata = { lastUpdated: Date.now(), isStale: false };
    });
  }

  async create(createClientDto: CreateClientDto): Promise<Client> {
    return this.handleErrors('create client', async () => {
      const createdClient = await this.executeWithRetry(() => {
        const client = new this.clientModel(createClientDto);
        return client.save();
      });
      this.clientsMap.set(createdClient.clientId, createdClient.toObject());
      this.logger.log(`Client created: ${createdClient.clientId}`);
      return createdClient;
    });
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
    const filteredClients = query ? (await this.enhancedSearch(query)).clients : await this.findAll();
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
    return this.handleErrors(`update client ${clientId}`, async () => {
      const cleanUpdateDto = this.cleanUpdateObject(updateClientDto);
      await this.notifyClientUpdate(clientId);
      const updatedClient = await this.executeWithRetry(() =>
        this.clientModel
          .findOneAndUpdate(
            { clientId },
            { $set: cleanUpdateDto },
            { new: true, upsert: true, runValidators: true },
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
    });
  }

  async remove(clientId: string): Promise<Client> {
    this.ensureInitialized();
    return this.handleErrors(`remove client ${clientId}`, async () => {
      const deletedClient = await this.executeWithRetry(() =>
        this.clientModel.findOneAndDelete({ clientId }).lean().exec(),
      );
      if (!deletedClient) {
        throw new NotFoundException(`Client with ID "${clientId}" not found`);
      }
      this.clientsMap.delete(clientId);
      this.logger.log(`Client removed: ${clientId}`);
      return deletedClient;
    });
  }

  async search(filter: any): Promise<Client[]> {
    return this.handleErrors('search clients', async () => {
      if (filter.hasPromoteMobiles !== undefined) {
        filter = await this.processPromoteMobileFilter(filter);
      }
      filter = this.processTextSearchFields(filter);
      return this.executeWithRetry(() => this.clientModel.find(filter).lean().exec());
    });
  }

  async searchClientsByPromoteMobile(mobileNumbers: string[]): Promise<Client[]> {
    if (!Array.isArray(mobileNumbers) || mobileNumbers.length === 0) return [];
    const promoteClients = await this.executeWithRetry(() =>
      this.promoteClientModel
        .find({ mobile: { $in: mobileNumbers }, clientId: { $exists: true } })
        .lean()
        .exec(),
    );
    const clientIds = [...new Set(promoteClients.map((pc) => pc.clientId))];
    return this.executeWithRetry(() =>
      this.clientModel.find({ clientId: { $in: clientIds } }).lean().exec(),
    );
  }

  async enhancedSearch(filter: any): Promise<SearchResult> {
    return this.handleErrors('enhanced search', async () => {
      let searchType: 'direct' | 'promoteMobile' | 'mixed' = 'direct';
      let promoteMobileMatches: Array<{ clientId: string; mobile: string }> = [];
      if (filter.promoteMobileNumber) {
        searchType = 'promoteMobile';
        const mobileNumber = filter.promoteMobileNumber;
        delete filter.promoteMobileNumber;
        const promoteClients = await this.executeWithRetry(() =>
          this.promoteClientModel
            .find({
              mobile: { $regex: new RegExp(this.escapeRegex(mobileNumber), 'i') },
              clientId: { $exists: true },
            })
            .lean()
            .exec(),
        );
        promoteMobileMatches = promoteClients.map((pc) => ({
          clientId: pc.clientId,
          mobile: pc.mobile,
        }));
        filter.clientId = { $in: promoteClients.map((pc) => pc.clientId) };
      }
      const clients = await this.search(filter);
      return {
        clients,
        searchType,
        promoteMobileMatches: promoteMobileMatches.length > 0 ? promoteMobileMatches : undefined,
      };
    });
  }

  private async handleErrors<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const errorDetails = parseError(error, `Error in ${operation}`, true);
      this.logger.error(`Error in ${operation}`, error.stack);
      throw error;
    }
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Service not initialized. Please wait for initialization to complete.');
    }
  }

  private cleanUpdateObject(updateDto: any): any {
    const cleaned = { ...updateDto };
    delete cleaned._id;
    if (cleaned._doc) {
      delete cleaned._doc._id;
      delete cleaned._doc;
    }
    return cleaned;
  }

  private async notifyClientUpdate(clientId: string): Promise<void> {
    await this.notify(`Updating the Existing client: ${clientId}`);
  }

  private async notify(message: string): Promise<void> {
    try {
      await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(message)}`, {
        timeout: 5000,
      });
    } catch (error) {
      this.logger.warn('Failed to send notification', error.message);
    }
  }

  private performPostUpdateTasks(updatedClient: Client): void {
    setImmediate(async () => {
      await this.handleErrors('post-update tasks', () => this.refreshExternalMaps());
    });
  }

  private async refreshExternalMaps(): Promise<void> {
    await Promise.allSettled([
      fetchWithTimeout(`${process.env.uptimeChecker}/refreshmap`, { timeout: 5000 }),
      fetchWithTimeout(`${process.env.uptimebot}/refreshmap`, { timeout: 5000 }),
    ]);
    this.logger.debug('External maps refreshed');
  }

  private async processPromoteMobileFilter(filter: any): Promise<any> {
    const hasPromoteMobiles = filter.hasPromoteMobiles.toLowerCase() === 'true';
    delete filter.hasPromoteMobiles;
    const clientsWithPromoteMobiles = await this.executeWithRetry(() =>
      this.promoteClientModel.find({ clientId: { $exists: true } }).distinct('clientId').lean(),
    );
    filter.clientId = hasPromoteMobiles
      ? { $in: clientsWithPromoteMobiles }
      : { $nin: clientsWithPromoteMobiles };
    return filter;
  }

  private processTextSearchFields(filter: any): any {
    const textFields = ['firstName', 'name'];
    textFields.forEach((field) => {
      if (filter[field]) {
        filter[field] = { $regex: new RegExp(this.escapeRegex(filter[field]), 'i') };
      }
    });
    return filter;
  }

  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async executeWithRetry<T>(operation: () => Promise<T>, retries = CONFIG.MAX_RETRIES): Promise<T> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        this.logger.warn(`Operation failed on attempt ${attempt}/${retries}`, error.message);
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

  async setupClient(clientId: string, setupClientQueryDto: SetupClientQueryDto) {
    this.logger.log(`Received New Client Request for - ${clientId}`);
    if (!toBoolean(process.env.AUTO_CLIENT_SETUP)) {
      this.logger.log('Auto client setup disabled');
      return;
    }
    if (!this.canSetupClient(clientId)) {
      this.logger.log(
        `Profile Setup Recently tried for ${clientId}, wait ::`,
        getReadableTimeDifference(this.setupCooldownMap.get(clientId)!),
      );
      return;
    }
    await this.handleSetupClient(clientId, setupClientQueryDto);
  }

  private canSetupClient(clientId: string): boolean {
    const lastSetup = this.setupCooldownMap.get(clientId) || 0;
    return Date.now() > lastSetup + CONFIG.COOLDOWN_PERIOD;
  }

  private async handleSetupClient(clientId: string, setupClientQueryDto: SetupClientQueryDto) {
    this.setupCooldownMap.set(clientId, Date.now());
    const existingClient = await this.findOne(clientId);
    if (!existingClient) {
      this.logger.error(`Client not found: ${clientId}`);
      return;
    }
    const existingClientMobile = existingClient.mobile;
    this.logger.log('setupClientQueryDto:', setupClientQueryDto);
    const today = new Date().toISOString().split('T')[0];
    const query = {
      clientId,
      mobile: { $ne: existingClientMobile },
      createdAt: { $lte: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) },
      availableDate: { $lte: today },
      channels: { $gt: 200 },
    };
    const newBufferClient = (await this.bufferClientService.executeQuery(query, { tgId: 1 }))[0];
    if (!newBufferClient) {
      await this.notify(`Buffer Clients not available, Requested by ${clientId}`);
      this.logger.log('Buffer Clients not available');
      return;
    }
    await this.handleErrors('setup client', async () => {
      await this.notify(
        `Received New Client Request for - ${clientId}\nOldNumber: ${existingClient.mobile}\nOldUsername: ${existingClient.username}`,
      );
      this.telegramService.setActiveClientSetup({
        ...setupClientQueryDto,
        clientId,
        existingMobile: existingClientMobile,
        newMobile: newBufferClient.mobile,
      });
      await connectionManager.getClient(newBufferClient.mobile);
      await this.updateClientSession(newBufferClient.session);
    }).catch(async (error) => {
      const availableDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      await this.bufferClientService.createOrUpdate(newBufferClient.mobile, { availableDate });
      this.telegramService.setActiveClientSetup(undefined);
    }).finally(async () => {
      await connectionManager.unregisterClient(newBufferClient.mobile);
    });
  }

  async updateClientSession(newSession: string) {
    const setup = this.telegramService.getActiveClientSetup();
    const { days, archiveOld, clientId, existingMobile, formalities, newMobile } = setup;
    this.logger.log('Updating Client Session');
    await sleep(2000);
    const existingClient = await this.findOne(clientId);
    if (!existingClient) throw new NotFoundException(`Client ${clientId} not found`);
    const newTelegramClient = await connectionManager.getClient(newMobile, {
      handler: true,
      autoDisconnect: false,
    });
    try {
      const me = await newTelegramClient.getMe();
      const updatedUsername = await this.telegramService.updateUsernameForAClient(
        newMobile,
        clientId,
        existingClient.name,
        me.username,
      );
      await this.notify(`Updated username for NewNumber: ${newMobile}\noldUsername: ${me.username}\nNewUsername: ${updatedUsername}`);
      await this.update(clientId, { mobile: newMobile, username: updatedUsername, session: newSession });
      await fetchWithTimeout(existingClient.deployKey, {}, 1);
      setTimeout(() => this.updateClient(clientId, 'Delayed update after buffer removal'), 15000);
      await this.handleClientArchival(existingClient, existingMobile, formalities, archiveOld, days);
      await this.bufferClientService.update(newMobile, { inUse: true, lastUsed: new Date() });
      await this.notify('Update finished');
    } catch (error) {
      parseError(error, `[New: ${newMobile}] Error in updating client session`, true);
      throw error;
    } finally {
      await connectionManager.unregisterClient(newMobile);
      this.telegramService.setActiveClientSetup(undefined);
    }
  }

  private async handleClientArchival(
    existingClient: Client,
    existingMobile: string,
    formalities: boolean,
    archiveOld: boolean,
    days: number,
  ) {
    try {
      const existingClientUser = (await this.usersService.search({ mobile: existingMobile }))[0];
      if (!existingClientUser) return;
      if (toBoolean(formalities)) {
        await this.handleFormalities(existingMobile);
      } else {
        this.logger.log('Formalities skipped');
      }
      if (archiveOld) {
        await this.archiveOldClient(existingClient, existingClientUser, existingMobile, days);
      } else {
        await this.bufferClientService.update(existingMobile, {
          inUse: false,
          lastUsed: new Date(),
          status: 'inactive',
        });
        this.logger.log('Client Archive Skipped');
        await this.notify('Skipped Old Client Archival');
      }
    } catch (e) {
      await this.notify(`Failed to Archive old Client: ${existingMobile}\nError: ${e.errorMessage || e.message}`);
    }
  }

  private async handleFormalities(mobile: string) {
    const client = await connectionManager.getClient(mobile, { handler: true, autoDisconnect: false });
    await this.telegramService.updatePrivacyforDeletedAccount(mobile);
    this.logger.log('Formalities finished');
    await connectionManager.unregisterClient(mobile);
    await this.notify('Formalities finished');
  }

  private async archiveOldClient(
    existingClient: Client,
    existingClientUser: User,
    existingMobile: string,
    days: number,
  ) {
    try {
      const availableDate = new Date(Date.now() + (days + 1) * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      const bufferClientDto: CreateBufferClientDto | UpdateBufferClientDto = {
        clientId: existingClient.clientId,
        mobile: existingMobile,
        availableDate,
        session: existingClient.session,
        tgId: existingClientUser.tgId,
        channels: 170,
        status: days > 35 ? 'inactive' : 'active',
        inUse: false,
      };
      const updatedBufferClient = await this.bufferClientService.createOrUpdate(
        existingMobile,
        bufferClientDto,
      );
      this.logger.log('client Archived: ', updatedBufferClient['_doc']);
      await this.notify('old Client Archived');
    } catch (error) {
      const errorDetails = parseError(error, `Error in Archiving Old Client: ${existingMobile}`, true);
      await this.notify(errorDetails.message);
      if (isPermanentError(errorDetails)) {
        this.logger.log('Deleting User: ', existingClientUser.mobile);
        await this.bufferClientService.remove(existingClientUser.mobile, 'Deactivated user');
      } else {
        this.logger.log('Not Deleting user');
      }
    }
  }

  async updateClient(clientId: string, message: string = '') {
    this.logger.log(`Updating Client: ${clientId} - ${message}`);
    if (!this.canUpdateClient(clientId)) return;
    const client = await this.findOne(clientId);
    if (!client) {
      this.logger.error(`Client not found: ${clientId}`);
      return;
    }
    try {
      this.lastUpdateMap.set(clientId, Date.now());
      const telegramClient = await connectionManager.getClient(client.mobile, { handler: false });
      if (!telegramClient) throw new Error(`Unable to fetch Telegram client for ${client.mobile}`);
      await sleep(2000);
      const me = await telegramClient.getMe();
      if (!me) throw new Error(`Unable to fetch 'me' for ${clientId}`);
      await this.updateClientUsername(client, me);
      await this.updateClientName(client, telegramClient, me);
      await this.updateClientPrivacy(client, telegramClient);
      await this.updateClientPhotos(client, telegramClient);
      await this.notify(`Updated Client: ${clientId} - ${message}`);
      if (client.deployKey) await fetchWithTimeout(client.deployKey);
    } catch (error) {
      this.lastUpdateMap.delete(clientId);
      parseError(error, `[${clientId}] [${client.mobile}] updateClient failed`);
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

  private async updateClientUsername(client: Client, me: Api.User) {
    const normalize = (str: string | null | undefined): string =>
      (str || '').toLowerCase().trim().replace(/\s+/g, ' ').normalize('NFC');
    const actualUsername = normalize(me.username || '');
    const expectedUsername = normalize(client.username || '');
    if (!actualUsername || actualUsername !== expectedUsername) {
      this.logger.log(
        `[${client.clientId}] Username mismatch. Actual: ${me.username}, Expected: ${client.username}`,
      );
      const updatedUsername = await this.telegramService.updateUsernameForAClient(
        client.mobile,
        client.clientId,
        client.name,
        me.username,
      );
      if (updatedUsername) {
        await this.update(client.clientId, { username: updatedUsername });
        this.logger.log(`[${client.clientId}] Username updated to: ${updatedUsername}`);
        await sleep(10000);
      } else {
        this.logger.warn(`[${client.clientId}] Failed to update username`);
      }
    } else {
      this.logger.log(`[${client.clientId}] Username already correct`);
    }
  }

  private async updateClientName(client: Client, tgManager: TelegramManager, me: Api.User) {
    const normalize = (str: string | null | undefined): string =>
      (str || '').toLowerCase().trim().replace(/\s+/g, ' ').normalize('NFC');
    const safeAttemptReverse = (val: string | null | undefined): string => {
      try {
        return attemptReverseFuzzy(val ?? '') || '';
      } catch {
        return '';
      }
    };
    const actualName = normalize(safeAttemptReverse(me.firstName || ''));
    const expectedName = normalize(client.name || '');
    if (actualName !== expectedName) {
      this.logger.log(`[${client.clientId}] Name mismatch. Actual: ${me.firstName}, Expected: ${client.name}`);
      await tgManager.updateProfile(
        obfuscateText(client.name, { maintainFormatting: false, preserveCase: true }),
        obfuscateText(`Genuine Paid Girl${getRandomEmoji()}, Best Services${getRandomEmoji()}`, {
          maintainFormatting: false,
          preserveCase: true,
        }),
      );
      await sleep(5000);
    } else {
      this.logger.log(`[${client.clientId}] Name already correct`);
    }
  }

  private async updateClientPrivacy(client: Client, tgManager: TelegramManager) {
    await tgManager.updatePrivacy();
    this.logger.log(`[${client.clientId}] Privacy settings updated`);
    await sleep(5000);
  }

  private async updateClientPhotos(client: Client, telegramClient: TelegramManager) {
    const photos = await telegramClient.client.invoke(
      new Api.photos.GetUserPhotos({ userId: 'me', offset: 0 }),
    );
    const photoCount = photos?.photos?.length || 0;
    if (photoCount < 1) {
      this.logger.warn(`[${client.clientId}] No profile photos found. Uploading new ones...`);
      await CloudinaryService.getInstance(client?.dbcoll?.toLowerCase());
      await sleep(6000 + Math.random() * 3000);
      for (const photo of CONFIG.PHOTO_PATHS) {
        await telegramClient.updateProfilePic(path.join(process.cwd(), photo));
        this.logger.debug(`[${client.clientId}] Uploaded profile photo: ${photo}`);
        await sleep(20000 + Math.random() * 15000);
      }
    } else {
      this.logger.log(`[${client.clientId}] Profile photos already exist (${photoCount})`);
    }
  }

  async updateClients() {
    const clients = await this.findAll();
    for (const client of clients) {
      await this.updateClient(client.clientId, `Force Updating Client: ${client.clientId}`);
    }
  }

  async executeQuery(query: any, sort?: any, limit?: number, skip?: number): Promise<Client[]> {
    if (!query) throw new BadRequestException('Query is invalid.');
    const queryExec = this.clientModel.find(query);
    if (sort) queryExec.sort(sort);
    if (limit) queryExec.limit(limit);
    if (skip) queryExec.skip(skip);
    return queryExec.exec();
  }

  async getPromoteMobiles(clientId: string): Promise<string[]> {
    if (!clientId) throw new BadRequestException('ClientId is required');
    const promoteClients = await this.promoteClientModel.find({ clientId }).lean();
    return promoteClients.map((pc) => pc.mobile).filter((mobile) => mobile);
  }

  async getAllPromoteMobiles(): Promise<string[]> {
    const allPromoteClients = await this.promoteClientModel
      .find({ clientId: { $exists: true } })
      .lean();
    return allPromoteClients.map((pc) => pc.mobile);
  }

  async isPromoteMobile(mobile: string): Promise<{ isPromote: boolean; clientId?: string }> {
    const promoteClient = await this.promoteClientModel.findOne({ mobile }).lean();
    return {
      isPromote: !!promoteClient && !!promoteClient.clientId,
      clientId: promoteClient?.clientId,
    };
  }

  async addPromoteMobile(clientId: string, mobileNumber: string): Promise<Client> {
    const client = await this.clientModel.findOne({ clientId }).lean();
    if (!client) throw new NotFoundException(`Client ${clientId} not found`);
    const existingPromoteClient = await this.promoteClientModel.findOne({ mobile: mobileNumber }).lean();
    if (existingPromoteClient) {
      if (existingPromoteClient.clientId === clientId) {
        throw new BadRequestException(
          `Mobile ${mobileNumber} is already a promote mobile for client ${clientId}`,
        );
      } else if (existingPromoteClient.clientId) {
        throw new BadRequestException(
          `Mobile ${mobileNumber} is already assigned to client ${existingPromoteClient.clientId}`,
        );
      } else {
        await this.promoteClientModel.updateOne({ mobile: mobileNumber }, { $set: { clientId } });
      }
    } else {
      throw new NotFoundException(
        `Mobile ${mobileNumber} not found in PromoteClient collection. Please add it first.`,
      );
    }
    return client;
  }

  async removePromoteMobile(clientId: string, mobileNumber: string): Promise<Client> {
    const client = await this.clientModel.findOne({ clientId }).lean();
    if (!client) throw new NotFoundException(`Client ${clientId} not found`);
    const result = await this.promoteClientModel.updateOne(
      { mobile: mobileNumber, clientId },
      { $unset: { clientId: 1 } },
    );
    if (result.matchedCount === 0) {
      throw new NotFoundException(
        `Mobile ${mobileNumber} is not a promote mobile for client ${clientId}`,
      );
    }
    return client;
  }
}