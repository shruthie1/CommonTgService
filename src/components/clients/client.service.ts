import { TelegramService } from './../Telegram/Telegram.service';
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  forwardRef,
  Query,
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
import { ArchivedClientService } from '../archived-clients/archived-client.service';
import {
  contains,
  fetchNumbersFromString,
  Logger,
  toBoolean,
} from '../../utils';
import { UpdateClientDto } from './dto/update-client.dto';
import { CreateBufferClientDto } from '../buffer-clients/dto/create-buffer-client.dto';
import { UpdateBufferClientDto } from '../buffer-clients/dto/update-buffer-client.dto';
import * as path from 'path';
import { CloudinaryService } from '../../cloudinary';
import { SearchClientDto } from './dto/search-client.dto';
import { NpointService } from '../n-point/npoint.service';
import { parseError } from '../../utils/parseError';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { notifbot } from '../../utils/logbots';
import { connectionManager } from '../Telegram/utils/connection-manager';
import { SessionService } from '../session-manager';
import { IpManagementService } from '../ip-management/ip-management.service';
import {
  PromoteClient,
  PromoteClientDocument,
} from '../promote-clients/schemas/promote-client.schema';


let settingupClient = Date.now() - 250000
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
  private lastUpdateMap: Map<string, number> = new Map(); // Track last update times

  // Cache management
  private clientsMap: Map<string, Client> = new Map();
  private cacheMetadata: CacheMetadata = {
    lastUpdated: 0,
    isStale: true
  };

  // Intervals and flags
  private checkInterval: NodeJS.Timeout | null = null;
  private refreshInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;
  private isShuttingDown = false;

  // Configuration
  private readonly REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutes
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // 1 second
  private readonly CACHE_WARMUP_THRESHOLD = 20;

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
    @Inject(forwardRef(() => ArchivedClientService))
    private readonly archivedClientService: ArchivedClientService,
    @Inject(forwardRef(() => SessionService))
    private readonly sessionService: SessionService,
    @Inject(forwardRef(() => IpManagementService))
    private readonly ipManagementService: IpManagementService,
    private readonly npointService: NpointService,
  ) { }

  async onModuleInit(): Promise<void> {
    try {
      await this.initializeService();
    } catch (error) {
      this.logger.error('Failed to initialize Client Service', error.stack);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Client Service shutting down...');
    this.isShuttingDown = true;

    try {
      // Clear intervals
      if (this.checkInterval) {
        clearInterval(this.checkInterval);
        this.checkInterval = null;
      }

      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
        this.refreshInterval = null;
      }

      // Wait for any ongoing refresh to complete
      if (this.refreshPromise) {
        await this.refreshPromise;
      }

      // Handle connection shutdown
      await connectionManager.shutdown();

      // Clear cache
      this.clientsMap.clear();
    } catch (error) {
      this.logger.error('Error during service shutdown', error.stack);
    }
  }

  private async initializeService(): Promise<void> {
    try {
      // Warm up cache
      await this.warmupCache();

      // Start periodic tasks
      this.startPeriodicTasks();

      this.isInitialized = true;
    } catch (error) {
      this.logger.error('Service initialization failed', error.stack);
      throw new Error('Client Service initialization failed');
    }
  }

  private async warmupCache(): Promise<void> {
    try {
      await this.refreshCacheFromDatabase();
    } catch (error) {
      this.logger.error('Cache warmup failed', error.stack);
      throw error;
    }
  }

  private startPeriodicTasks(): void {
    // Main periodic check
    this.checkInterval = setInterval(async () => {
      if (this.isShuttingDown) return;

      try {
        await Promise.allSettled([
          this.performPeriodicRefresh(),
          this.checkNpoint()
        ]);
      } catch (error) {
        this.logger.error('Error during periodic tasks', error.stack);
      }
    }, this.REFRESH_INTERVAL);

    // Cache staleness check
    this.refreshInterval = setInterval(() => {
      if (this.isShuttingDown) return;
      this.updateCacheMetadata();
    }, 60000); // Check every minute
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
    const now = Date.now();
    this.cacheMetadata.isStale = (now - this.cacheMetadata.lastUpdated) > this.CACHE_TTL;
  }

  private async refreshCacheFromDatabase(): Promise<void> {
    try {
      const documents = await this.executeWithRetry(async () => {
        return await this.clientModel
          .find({}, { _id: 0, updatedAt: 0 })
          .lean()
          .exec();
      });

      // Create new map to avoid race conditions
      const newClientsMap = new Map<string, Client>();

      documents.forEach((client) => {
        newClientsMap.set(client.clientId, client);
      });

      // Atomic replacement
      this.clientsMap = newClientsMap;
      this.cacheMetadata = {
        lastUpdated: Date.now(),
        isStale: false
      };
    } catch (error) {
      this.logger.error('Failed to refresh cache from database', error.stack);
      throw error;
    }
  }

  async checkNpoint(): Promise<void> {
    try {
      // Commented out implementation - implement when needed
      /*
      const npointIdFull = '7c2682f37bb93ef486ba';
      const npointIdMasked = 'f0d1e44d82893490bbde';
      
      const [maskedResponse, fullResponse] = await Promise.allSettled([
        fetchWithTimeout(`https://api.npoint.io/${npointIdMasked}`, { timeout: 10000 }),
        fetchWithTimeout(`https://api.npoint.io/${npointIdFull}`, { timeout: 10000 })
      ]);

      if (maskedResponse.status === 'fulfilled') {
        const npointMaskedClients = maskedResponse.value.data;
        const existingMaskedClients = await this.findAllMaskedObject();
        
        if (areJsonsNotSame(npointMaskedClients, existingMaskedClients)) {
          await this.npointService.updateDocument(npointIdMasked, existingMaskedClients);
          this.logger.log('Updated Masked Clients from Npoint');
        }
      }

      if (fullResponse.status === 'fulfilled') {
        const npointClients = fullResponse.value.data;
        const existingClients = await this.findAllObject();
        
        if (areJsonsNotSame(npointClients, existingClients)) {
          await this.npointService.updateDocument(npointIdFull, existingClients);
          this.logger.log('Updated Full Clients from Npoint');
        }
      }
      */
    } catch (error) {
      this.logger.error('Error checking npoint', error.stack);
      // Don't throw - this is a background task
    }
  }

  async create(createClientDto: CreateClientDto): Promise<Client> {
    try {
      const createdUser = await this.executeWithRetry(async () => {
        const client = new this.clientModel(createClientDto);
        return await client.save();
      });

      // Update cache
      if (createdUser) {
        this.clientsMap.set(createdUser.clientId, createdUser.toObject());
        this.logger.log(`Client created: ${createdUser.clientId}`);
      }

      return createdUser;
    } catch (error) {
      this.logger.error('Error creating client', error.stack);
      throw error;
    }
  }

  async findAll(): Promise<Client[]> {
    this.ensureInitialized();

    try {
      // Use cache if available and fresh
      if (this.clientsMap.size >= this.CACHE_WARMUP_THRESHOLD && !this.cacheMetadata.isStale) {
        this.logger.debug(`Retrieved ${this.clientsMap.size} clients from cache`);
        return Array.from(this.clientsMap.values());
      }

      // Refresh cache if needed
      if (this.cacheMetadata.isStale || this.clientsMap.size === 0) {
        await this.refreshCacheFromDatabase();
      }

      return Array.from(this.clientsMap.values());

    } catch (error) {
      this.logger.error('Failed to retrieve all clients', error.stack);
      parseError(error, 'Failed to retrieve all clients: ', true);
      throw error;
    }
  }

  async findAllMasked(): Promise<Partial<Client>[]> {
    const clients = await this.findAll();
    return clients.map((client) => {
      const { session, mobile, password, ...maskedClient } = client;
      return { ...maskedClient };
    });
  }

  async findOneMasked(clientId: string): Promise<Partial<Client>> {
    const client = await this.findOne(clientId, true);
    const { session, mobile, password, ...maskedClient } = client;
    return { ...maskedClient };
  }

  async findAllObject(): Promise<Record<string, Client>> {
    const clients = await this.findAll();
    return clients.reduce((acc, client) => {
      acc[client.clientId] = client;
      return acc;
    }, {} as Record<string, Client>);
  }

  async findAllMaskedObject(query?: SearchClientDto): Promise<Record<string, Partial<Client>>> {
    let filteredClients: Client[];

    if (query) {
      const searchResult = await this.enhancedSearch(query);
      filteredClients = searchResult.clients;
    } else {
      filteredClients = await this.findAll();
    }

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

    try {
      // Check cache first
      const cachedClient = this.clientsMap.get(clientId);
      if (cachedClient) {
        return cachedClient;
      }

      // Fallback to database
      const user = await this.executeWithRetry(async () => {
        return await this.clientModel
          .findOne({ clientId }, { _id: 0, updatedAt: 0 })
          .lean()
          .exec();
      });

      if (!user && throwErr) {
        throw new NotFoundException(`Client with ID "${clientId}" not found`);
      }

      // Cache the result if found
      if (user) {
        this.clientsMap.set(clientId, user);
      }

      return user;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error finding client ${clientId}`, error.stack);
      throw error;
    }
  }

  async update(clientId: string, updateClientDto: UpdateClientDto): Promise<Client> {
    this.ensureInitialized();

    try {
      // Clean the update object
      const cleanUpdateDto = this.cleanUpdateObject(updateClientDto);

      // Notify about update
      await this.notifyClientUpdate(clientId);

      const updatedUser = await this.executeWithRetry(async () => {
        return await this.clientModel
          .findOneAndUpdate(
            { clientId },
            { $set: cleanUpdateDto },
            { new: true, upsert: true, runValidators: true }
          )
          .lean()
          .exec();
      });

      if (!updatedUser) {
        throw new NotFoundException(`Client with ID "${clientId}" not found`);
      }

      // Update cache
      this.clientsMap.set(clientId, updatedUser);

      // Background tasks
      this.performPostUpdateTasks(updatedUser);

      this.logger.log(`Client updated: ${clientId}`);
      return updatedUser;

    } catch (error) {
      this.logger.error(`Error updating client ${clientId}`, error.stack);
      throw error;
    }
  }

  async remove(clientId: string): Promise<Client> {
    this.ensureInitialized();

    try {
      const deletedUser = await this.executeWithRetry(async () => {
        return await this.clientModel
          .findOneAndDelete({ clientId })
          .lean()
          .exec();
      });

      if (!deletedUser) {
        throw new NotFoundException(`Client with ID "${clientId}" not found`);
      }

      // Remove from cache
      this.clientsMap.delete(clientId);

      this.logger.log(`Client removed: ${clientId}`);
      return deletedUser;

    } catch (error) {
      this.logger.error(`Error removing client ${clientId}`, error.stack);
      throw error;
    }
  }

  async search(filter: any): Promise<Client[]> {
    try {
      this.logger.debug('Search filter:', JSON.stringify(filter, null, 2));

      // Handle promote mobile relationship
      if (filter.hasPromoteMobiles !== undefined) {
        filter = await this.processPromoteMobileFilter(filter);
      }

      // Process text search fields
      filter = this.processTextSearchFields(filter);

      this.logger.debug('Processed filter:', JSON.stringify(filter, null, 2));

      return await this.executeWithRetry(async () => {
        return await this.clientModel.find(filter).lean().exec();
      });

    } catch (error) {
      this.logger.error('Error in search', error.stack);
      throw error;
    }
  }

  async searchClientsByPromoteMobile(mobileNumbers: string[]): Promise<Client[]> {
    try {
      if (!Array.isArray(mobileNumbers) || mobileNumbers.length === 0) {
        return [];
      }

      const promoteClients = await this.executeWithRetry(async () => {
        return await this.promoteClientModel
          .find({
            mobile: { $in: mobileNumbers },
            clientId: { $exists: true },
          })
          .lean()
          .exec();
      });

      const clientIds = [...new Set(promoteClients.map((pc) => pc.clientId))];

      return await this.executeWithRetry(async () => {
        return await this.clientModel
          .find({ clientId: { $in: clientIds } })
          .lean()
          .exec();
      });

    } catch (error) {
      this.logger.error('Error searching by promote mobile', error.stack);
      throw error;
    }
  }

  async enhancedSearch(filter: any): Promise<SearchResult> {
    try {
      let searchType: 'direct' | 'promoteMobile' | 'mixed' = 'direct';
      let promoteMobileMatches: Array<{ clientId: string; mobile: string }> = [];

      // Handle promote mobile search
      if (filter.promoteMobileNumber) {
        searchType = 'promoteMobile';
        const mobileNumber = filter.promoteMobileNumber;
        delete filter.promoteMobileNumber;

        const promoteClients = await this.executeWithRetry(async () => {
          return await this.promoteClientModel
            .find({
              mobile: {
                $regex: new RegExp(
                  this.escapeRegex(mobileNumber),
                  'i',
                ),
              },
              clientId: { $exists: true },
            })
            .lean()
            .exec();
        });

        promoteMobileMatches = promoteClients.map((pc) => ({
          clientId: pc.clientId,
          mobile: pc.mobile,
        }));

        const clientIds = promoteClients.map((pc) => pc.clientId);
        filter.clientId = { $in: clientIds };
      }

      const clients = await this.search(filter);

      return {
        clients,
        searchType,
        promoteMobileMatches: promoteMobileMatches.length > 0 ? promoteMobileMatches : undefined,
      };

    } catch (error) {
      this.logger.error('Error in enhanced search', error.stack);
      throw error;
    }
  }

  // Private helper methods
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
    try {
      await fetchWithTimeout(
        `${notifbot()}&text=Updating the Existing client: ${clientId}`,
        { timeout: 5000 }
      );
    } catch (error) {
      this.logger.warn('Failed to send update notification', error.message);
    }
  }

  private performPostUpdateTasks(updatedUser: Client): void {
    // Run background tasks without blocking the response
    setImmediate(async () => {
      try {
        await Promise.allSettled([
          this.checkNpoint(),
          this.refreshExternalMaps()
        ]);
      } catch (error) {
        this.logger.error('Error in post-update tasks', error.stack);
      }
    });
  }

  private async refreshExternalMaps(): Promise<void> {
    try {
      await Promise.allSettled([
        fetchWithTimeout(`${process.env.uptimeChecker}/refreshmap`, { timeout: 5000 }),
        fetchWithTimeout(`${process.env.uptimebot}/refreshmap`, { timeout: 5000 })
      ]);
      this.logger.debug('External maps refreshed');
    } catch (error) {
      this.logger.warn('Failed to refresh external maps', error.message);
    }
  }

  private async processPromoteMobileFilter(filter: any): Promise<any> {
    const hasPromoteMobiles = filter.hasPromoteMobiles.toLowerCase() === 'true';
    delete filter.hasPromoteMobiles;

    const clientsWithPromoteMobiles = await this.executeWithRetry(async () => {
      return await this.promoteClientModel
        .find({ clientId: { $exists: true } })
        .distinct('clientId')
        .lean();
    });

    if (hasPromoteMobiles) {
      filter.clientId = { $in: clientsWithPromoteMobiles };
    } else {
      filter.clientId = { $nin: clientsWithPromoteMobiles };
    }

    return filter;
  }

  private processTextSearchFields(filter: any): any {
    const textFields = ['firstName', 'name'];

    textFields.forEach(field => {
      if (filter[field]) {
        filter[field] = {
          $regex: new RegExp(this.escapeRegex(filter[field]), 'i')
        };
      }
    });

    return filter;
  }

  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    retries: number = this.MAX_RETRIES
  ): Promise<T> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        this.logger.warn(`Operation failed on attempt ${attempt}/${retries}`, error.message);

        if (attempt === retries) {
          throw error;
        }

        const delay = this.RETRY_DELAY * Math.pow(2, attempt - 1);
        await this.sleep(delay);
      }
    }

    throw new Error('All retry attempts failed');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Health check and monitoring
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
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
    };
  }


  async setupClient(
    clientId: string,
    setupClientQueryDto: SetupClientQueryDto,
  ) {
    this.logger.log(
      `Received New Client Request for - ${clientId}`,
      settingupClient,
    );
    if (
      toBoolean(process.env.AUTO_CLIENT_SETUP) &&
      Date.now() > settingupClient + 240000
    ) {
      settingupClient = Date.now();
      const existingClient = await this.findOne(clientId);
      const existingClientMobile = existingClient.mobile;
      this.logger.log('setupClientQueryDto:', setupClientQueryDto);
      const today = new Date(Date.now()).toISOString().split('T')[0];
      const query = { availableDate: { $lte: today }, channels: { $gt: 200 } };
      const newBufferClient = (
        await this.bufferClientService.executeQuery(query, { tgId: 1 })
      )[0];
      if (newBufferClient) {
        try {
          await fetchWithTimeout(
            `${notifbot()}&text=Received New Client Request for - ${clientId} - OldNumber: ${existingClient.mobile} || ${existingClient.username}`,
          );
          this.telegramService.setActiveClientSetup({
            ...setupClientQueryDto,
            clientId,
            existingMobile: existingClientMobile,
            newMobile: newBufferClient.mobile,
          });
          await connectionManager.getClient(newBufferClient.mobile);

          await this.updateClientSession(newBufferClient.session);
          // const archivedClient = await this.archivedClientService.findOne(newBufferClient.mobile)
          // if (archivedClient) {
          //     await fetchWithTimeout(`${notifbot()}&text=Using Old Session from Archived Clients- NewNumber:${newBufferClient.mobile}`);
          //     await this.updateClientSession(archivedClient.session)
          // } else {
          //     await connectionManager.getClient(newBufferClient.mobile, false, true);
          //     await this.generateNewSession(newBufferClient.mobile)
          // }
        } catch (error) {
          parseError(error);
          this.logger.log('Removing buffer as error');
          const availableDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0];
          await this.bufferClientService.createOrUpdate(
            newBufferClient.mobile,
            { availableDate },
          );
          this.telegramService.setActiveClientSetup(undefined);
        } finally {
          await connectionManager.unregisterClient(newBufferClient.mobile);
        }
      } else {
        await fetchWithTimeout(
          `${notifbot()}&text=Buffer Clients not available, Requested by ${clientId}`,
        );
        this.logger.log('Buffer Clients not available');
      }
    } else {
      this.logger.log(
        'Profile Setup Recently tried, wait ::',
        settingupClient - Date.now(),
      );
    }
  }

  async updateClientSession(newSession: string) {
    try {
      let updatedUsername = '';
      this.logger.log('Updating Client Session');
      const setup = this.telegramService.getActiveClientSetup();
      const {
        days,
        archiveOld,
        clientId,
        existingMobile,
        formalities,
        newMobile,
      } = setup;
      await sleep(2000);
      const existingClient = await this.findOne(clientId);
      await connectionManager.getClient(newMobile, {
        handler: true,
        autoDisconnect: false,
      });
      const firstName = existingClient.name.split(' ')[0];
      const middleName = existingClient.name.split(' ')[1];
      const firstNameCaps = firstName[0].toUpperCase() + firstName.slice(1);
      const middleNameCaps = middleName
        ? middleName[0].toUpperCase() + middleName.slice(1)
        : '';
      const baseUsername =
        `${firstNameCaps.slice(0, 4)}${middleNameCaps.slice(0, 3)}` +
        fetchNumbersFromString(clientId);
      try {
        updatedUsername = await this.telegramService.updateUsername(
          newMobile,
          baseUsername,
        );
      } catch (error) {
        parseError(error, 'Error in updating username', true);
      }
      await fetchWithTimeout(
        `${notifbot()}&text=Updated username for NewNumber:${newMobile} || ${updatedUsername}`,
      );
      await connectionManager.unregisterClient(newMobile);
      const existingClientUser = (
        await this.usersService.search({ mobile: existingMobile })
      )[0];
      await this.update(clientId, {
        mobile: newMobile,
        username: updatedUsername,
        session: newSession,
      });
      await fetchWithTimeout(existingClient.deployKey, {}, 1);
      await this.bufferClientService.remove(newMobile);
      setTimeout(async () => {
        await this.updateClient(
          clientId,
          'Delayed update after buffer removal',
        );
      }, 15000);

      try {
        if (existingClientUser) {
          try {
            if (toBoolean(formalities)) {
              await connectionManager.getClient(existingMobile, {
                handler: true,
                autoDisconnect: false,
              });
              this.logger.log('Started Formalities');
              await this.telegramService.updateNameandBio(
                existingMobile,
                'Deleted Account',
                `New Acc: @${updatedUsername}`,
              );
              await this.telegramService.deleteProfilePhotos(existingMobile);
              await this.telegramService.updateUsername(existingMobile, '');
              await this.telegramService.updatePrivacyforDeletedAccount(
                existingMobile,
              );
              this.logger.log('Formalities finished');
              await connectionManager.unregisterClient(existingMobile);
              await fetchWithTimeout(`${notifbot()}&text=Formalities finished`);
            } else {
              this.logger.log('Formalities skipped');
            }
            if (archiveOld) {
              const availableDate = new Date(
                Date.now() + (days + 1) * 24 * 60 * 60 * 1000,
              )
                .toISOString()
                .split('T')[0];
              const bufferClientDto:
                | CreateBufferClientDto
                | UpdateBufferClientDto = {
                mobile: existingMobile,
                availableDate,
                session: existingClient.session,
                tgId: existingClientUser.tgId,
                channels: 170,
                status: days > 35 ? 'inactive' : 'active',
              };
              const updatedBufferClient =
                await this.bufferClientService.createOrUpdate(
                  existingMobile,
                  bufferClientDto,
                );
              // await this.archivedClientService.update(existingMobile, existingClient);
              this.logger.log('client Archived: ', updatedBufferClient);
              await fetchWithTimeout(`${notifbot()}&text=Client Archived`);
            } else {
              this.logger.log('Client Archive Skipped');
              await fetchWithTimeout(
                `${notifbot()}&text=Client Archive Skipped`,
              );
            }
          } catch (error) {
            this.logger.log('Cannot Archive Old Client');
            const errorDetails = parseError(
              error,
              'Error in Archiving Old Client',
              true,
            );
            if (
              contains(errorDetails.message.toLowerCase(), [
                'expired',
                'unregistered',
                'deactivated',
                'session_revoked',
                'user_deactivated_ban',
              ])
            ) {
              this.logger.log('Deleting User: ', existingClientUser.mobile);
              await this.bufferClientService.remove(existingClientUser.mobile);
            } else {
              this.logger.log('Not Deleting user');
            }
          }
        }
      } catch (error) {
        parseError(error, 'Error in Archiving Old Client outer', true);
        this.logger.log('Error in Archiving Old Client');
      }
      this.telegramService.setActiveClientSetup(undefined);
      this.logger.log('Update finished Exitting Exiiting TG Service');
      await fetchWithTimeout(`${notifbot()}&text=Update finished`);
    } catch (e) {
      parseError(e, 'Error in updating client session', true);
      this.telegramService.setActiveClientSetup(undefined);
    }
  }

  async updateClient(clientId: string, message: string = '') {
    this.logger.log(`Updating Client: ${clientId} - ${message}`);
    const now = Date.now();
    const lastUpdate = this.lastUpdateMap.get(clientId) || 0;
    const cooldownPeriod = 30000;
    if (now - lastUpdate < cooldownPeriod) {
      this.logger.log(
        `Skipping update for ${clientId} - cooldown period not elapsed. Try again in ${Math.ceil((cooldownPeriod - (now - lastUpdate)) / 1000)} seconds`,
      );
      return;
    }

    const client = await this.findOne(clientId);
    try {
      this.lastUpdateMap.set(clientId, now);
      await CloudinaryService.getInstance(client?.dbcoll?.toLowerCase());
      const telegramClient = await connectionManager.getClient(client.mobile, {
        handler: false,
      });
      await sleep(2000);
      const me = await telegramClient.getMe();
      const rootPath = process.cwd();
      await telegramClient.updateProfilePic(path.join(rootPath, 'dp1.jpg'));
      if (
        !me.username ||
        me.username !== client.username ||
        !me.username
          ?.toLowerCase()
          .startsWith(me.firstName.split(' ')[0].toLowerCase())
      ) {
        const client = await this.findOne(clientId);
        const firstName = client.name.split(' ')[0];
        const middleName = client.name.split(' ')[1];
        const firstNameCaps = firstName[0].toUpperCase() + firstName.slice(1);
        const middleNameCaps = middleName
          ? middleName[0].toUpperCase() + middleName.slice(1)
          : '';
        const baseUsername =
          `${firstNameCaps.slice(0, 4)}${middleNameCaps.slice(0, 3)}` +
          fetchNumbersFromString(clientId);
        const updatedUsername =
          await telegramClient.updateUsername(baseUsername);
        await this.update(client.clientId, { username: updatedUsername });
      }
      await sleep(1000);
      if (me.firstName !== client.name) {
        this.logger.log(
          `Updating first name for ${clientId} from ${me.firstName} to ${client.name}`,
        );
        await telegramClient.updateProfile(client.name, `Genuine Paid Girl🥰, Best Services❤️`);
      } else {
        this.logger.log(`First name for ${clientId} is already up to date`);
      }
      await sleep(1000);
      await telegramClient.deleteProfilePhotos();
      await sleep(1000);
      await telegramClient.updatePrivacy();
      await sleep(1000);
      this.logger.log(rootPath, 'trying to update dp');
      await telegramClient.updateProfilePic(path.join(rootPath, 'dp1.jpg'));
      await sleep(1000);
      await telegramClient.updateProfilePic(path.join(rootPath, 'dp2.jpg'));
      await sleep(1000);
      await telegramClient.updateProfilePic(path.join(rootPath, 'dp3.jpg'));
      await sleep(1000);
      await fetchWithTimeout(
        `${notifbot()}&text=Updated Client: ${clientId} - ${message}`,
      );
      await fetchWithTimeout(client.deployKey);
    } catch (error) {
      this.lastUpdateMap.delete(clientId);
      parseError(error);
    } finally {
      connectionManager.unregisterClient(client.mobile);
    }
  }

  async updateClients() {
    const clients = await this.findAll();
    for (const client of Object.values(clients)) {
      await this.updateClient(
        client.clientId,
        `Force Updating Client: ${client.clientId}`,
      );
    }
  }

  async generateNewSession(phoneNumber: string, attempt: number = 1) {
    try {
      this.logger.log('String Generation started');
      await fetchWithTimeout(
        `${notifbot()}&text=String Generation started for NewNumber:${phoneNumber}`,
      );
      await sleep(1000);
      const response = await fetchWithTimeout(
        `${process.env.uptimebot}/login?phone=${phoneNumber}&force=${true}`,
        { timeout: 15000 },
        1,
      );
      if (response) {
        this.logger.log(`Code Sent successfully`, response.data);
        await fetchWithTimeout(`${notifbot()}&text=Code Sent successfully`);
        await this.bufferClientService.update(phoneNumber, {
          availableDate: new Date(Date.now() + 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0],
        });
      } else {
        await fetchWithTimeout(`${notifbot()}&text=Failed to send Code`);
        this.logger.log('Failed to send Code', response);
        if (attempt < 2) {
          await sleep(8000);
          await this.generateNewSession(phoneNumber, attempt + 1);
        }
      }
    } catch (error) {
      this.logger.log(error);
      if (attempt < 2) {
        await sleep(8000);
        await this.generateNewSession(phoneNumber, attempt + 1);
      }
    }
  }

  async executeQuery(
    query: any,
    sort?: any,
    limit?: number,
    skip?: number,
  ): Promise<Client[]> {
    try {
      if (!query) {
        throw new BadRequestException('Query is invalid.');
      }
      const queryExec = this.clientModel.find(query);

      if (sort) {
        queryExec.sort(sort);
      }

      if (limit) {
        queryExec.limit(limit);
      }

      if (skip) {
        queryExec.skip(skip);
      }

      return await queryExec.exec();
    } catch (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  // ==================== PROMOTE MOBILE MANAGEMENT ====================

  /**
   * Get all promote mobiles for a client from PromoteClient collection
   */
  async getPromoteMobiles(clientId: string): Promise<string[]> {
    if (!clientId) {
      throw new BadRequestException('ClientId is required');
    }
    const promoteClients = await this.promoteClientModel
      .find({ clientId })
      .lean();
    return promoteClients.map((pc) => pc.mobile).filter((mobile) => mobile); // Filter out null/undefined mobiles
  }

  /**
   * Get all promote mobiles for all clients (utility for other services)
   */
  async getAllPromoteMobiles(): Promise<string[]> {
    const allPromoteClients = await this.promoteClientModel
      .find({ clientId: { $exists: true } })
      .lean();
    return allPromoteClients.map((pc) => pc.mobile);
  }

  /**
   * Check if a mobile is a promote mobile for any client
   */
  async isPromoteMobile(
    mobile: string,
  ): Promise<{ isPromote: boolean; clientId?: string }> {
    const promoteClient = await this.promoteClientModel
      .findOne({ mobile })
      .lean();
    return {
      isPromote: !!promoteClient && !!promoteClient.clientId, // Only true if assigned to a client
      clientId: promoteClient?.clientId,
    };
  }

  async addPromoteMobile(
    clientId: string,
    mobileNumber: string,
  ): Promise<Client> {
    // Verify client exists
    const client = await this.clientModel.findOne({ clientId }).lean();
    if (!client) {
      throw new NotFoundException(`Client ${clientId} not found`);
    }

    // Check if mobile is already a promote mobile for this or another client
    const existingPromoteClient = await this.promoteClientModel
      .findOne({ mobile: mobileNumber })
      .lean();
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
        // Mobile exists but not assigned to any client, assign it to this client
        await this.promoteClientModel.updateOne(
          { mobile: mobileNumber },
          { $set: { clientId } },
        );
      }
    } else {
      throw new NotFoundException(
        `Mobile ${mobileNumber} not found in PromoteClient collection. Please add it first.`,
      );
    }

    return client;
  }

  async removePromoteMobile(
    clientId: string,
    mobileNumber: string,
  ): Promise<Client> {
    // Verify client exists
    const client = await this.clientModel.findOne({ clientId }).lean();
    if (!client) {
      throw new NotFoundException(`Client ${clientId} not found`);
    }

    // Remove clientId from the PromoteClient document (making it unassigned)
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

  /**
   * Get IP address for a mobile number
   * This method uses the simplified IP management system (no mobileType needed)
   * @param mobile Mobile number to get IP for
   * @param clientId Optional client ID for context
   * @returns IP address string or null if none found/assigned
   */
  async getIpForMobile(
    mobile: string,
    clientId?: string,
  ): Promise<string | null> {
    if (!mobile) {
      throw new BadRequestException('Mobile number is required');
    }

    this.logger.debug(
      `Getting IP for mobile: ${mobile}${clientId ? ` (client: ${clientId})` : ''}`,
    );

    try {
      // Use the simplified IP management service to get IP for mobile
      const ipAddress = await this.ipManagementService.getIpForMobile(mobile);

      if (ipAddress) {
        this.logger.debug(`Found IP for mobile ${mobile}: ${ipAddress}`);
        return ipAddress;
      }

      this.logger.debug(`No IP found for mobile ${mobile}`);
      return null;
    } catch (error) {
      this.logger.error(
        `Failed to get IP for mobile ${mobile}: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  /**
   * Check if a mobile number has an assigned IP
   * @param mobile Mobile number to check
   * @returns boolean indicating if IP is assigned
   */
  async hasMobileAssignedIp(mobile: string): Promise<boolean> {
    const ip = await this.getIpForMobile(mobile);
    return ip !== null;
  }

  /**
   * Get all mobile numbers (main + promote) for a client that need IP assignment
   * @param clientId Client ID
   * @returns Array of mobile numbers without IP assignments
   */
  async getMobilesNeedingIpAssignment(clientId: string): Promise<{
    mainMobile?: string;
    promoteMobiles: string[];
  }> {
    this.logger.debug(
      `Getting mobiles needing IP assignment for client: ${clientId}`,
    );

    const client = await this.findOne(clientId);
    const result = {
      mainMobile: undefined as string | undefined,
      promoteMobiles: [] as string[],
    };

    // Check main mobile
    if (client.mobile && !(await this.hasMobileAssignedIp(client.mobile))) {
      result.mainMobile = client.mobile;
    }

    // Get promote mobiles from PromoteClient collection and check for IP assignment
    const promoteMobiles = await this.getPromoteMobiles(clientId);
    for (const mobile of promoteMobiles) {
      if (!(await this.hasMobileAssignedIp(mobile))) {
        result.promoteMobiles.push(mobile);
      }
    }

    this.logger.debug(
      `Mobiles needing IP assignment for client ${clientId}:`,
      result,
    );
    return result;
  }

  /**
   * Auto-assign IPs to all mobile numbers for a client
   * Uses the simplified IP management system (no mobileType field needed)
   * @param clientId Client ID
   * @returns Assignment result summary
   */
  async autoAssignIpsToClient(clientId: string): Promise<{
    clientId: string;
    mainMobile: { mobile: string; ipAddress: string | null; status: string };
    promoteMobiles: Array<{
      mobile: string;
      ipAddress: string | null;
      status: string;
    }>;
    summary: {
      totalMobiles: number;
      assigned: number;
      failed: number;
      errors: string[];
    };
  }> {
    this.logger.debug(
      `Auto-assigning IPs to all mobiles for client: ${clientId}`,
    );

    const client = await this.findOne(clientId);
    const errors: string[] = [];
    let assigned = 0;
    let failed = 0;

    // Handle main mobile - no mobileType needed in simplified system
    let mainMobileResult: {
      mobile: string;
      ipAddress: string | null;
      status: string;
    };
    try {
      const mainMapping = await this.ipManagementService.assignIpToMobile({
        mobile: client.mobile,
        clientId: client.clientId,
        // Note: No mobileType field - simplified!
      });
      mainMobileResult = {
        mobile: client.mobile,
        ipAddress: mainMapping.ipAddress,
        status: 'assigned',
      };
      assigned++;
    } catch (error) {
      mainMobileResult = {
        mobile: client.mobile,
        ipAddress: null,
        status: 'failed',
      };
      errors.push(`Main mobile ${client.mobile}: ${error.message}`);
      failed++;
    }

    // Handle promote mobiles - no mobileType needed in simplified system
    const promoteMobileResults: Array<{
      mobile: string;
      ipAddress: string | null;
      status: string;
    }> = [];

    // Get promote mobiles from PromoteClient collection
    const promoteMobiles = await this.getPromoteMobiles(clientId);
    for (const promoteMobile of promoteMobiles) {
      try {
        const promoteMapping = await this.ipManagementService.assignIpToMobile({
          mobile: promoteMobile,
          clientId: client.clientId,
          // Note: No mobileType field - simplified!
        });
        promoteMobileResults.push({
          mobile: promoteMobile,
          ipAddress: promoteMapping.ipAddress,
          status: 'assigned',
        });
        assigned++;
      } catch (error) {
        promoteMobileResults.push({
          mobile: promoteMobile,
          ipAddress: null,
          status: 'failed',
        });
        errors.push(`Promote mobile ${promoteMobile}: ${error.message}`);
        failed++;
      }
    }

    const totalMobiles = 1 + promoteMobiles.length;

    this.logger.log(
      `Auto-assignment completed for ${clientId}: ${assigned}/${totalMobiles} assigned`,
    );

    return {
      clientId,
      mainMobile: mainMobileResult,
      promoteMobiles: promoteMobileResults,
      summary: {
        totalMobiles,
        assigned,
        failed,
        errors,
      },
    };
  }

  /**
   * Get client IP information summary
   * Shows which mobiles have IPs and which don't
   * @param clientId Client ID
   * @returns Comprehensive IP summary for the client
   */
  async getClientIpInfo(clientId: string): Promise<{
    clientId: string;
    clientName: string;
    mainMobile: {
      mobile: string;
      ipAddress: string | null;
      hasIp: boolean;
    };
    promoteMobiles: Array<{
      mobile: string;
      ipAddress: string | null;
      hasIp: boolean;
    }>;
    dedicatedIps: string[];
    summary: {
      totalMobiles: number;
      mobilesWithIp: number;
      mobilesWithoutIp: number;
    };
  }> {
    this.logger.debug(`Getting IP info for client: ${clientId}`);

    const client = await this.findOne(clientId);

    // Get IP for main mobile
    const mainMobileIp = await this.getIpForMobile(client.mobile, clientId);
    const mainMobile = {
      mobile: client.mobile,
      ipAddress: mainMobileIp,
      hasIp: mainMobileIp !== null,
    };

    // Get IPs for promote mobiles
    const promoteMobiles = [];
    let mobilesWithIp = mainMobile.hasIp ? 1 : 0;

    // Get promote mobiles from PromoteClient collection
    const clientPromoteMobiles = await this.getPromoteMobiles(clientId);
    for (const mobile of clientPromoteMobiles) {
      const ip = await this.getIpForMobile(mobile, clientId);
      const hasIp = ip !== null;

      promoteMobiles.push({
        mobile,
        ipAddress: ip,
        hasIp,
      });

      if (hasIp) mobilesWithIp++;
    }

    const totalMobiles = 1 + clientPromoteMobiles.length;
    const mobilesWithoutIp = totalMobiles - mobilesWithIp;

    return {
      clientId,
      clientName: client.name,
      mainMobile,
      promoteMobiles,
      dedicatedIps: client.dedicatedIps || [],
      summary: {
        totalMobiles,
        mobilesWithIp,
        mobilesWithoutIp,
      },
    };
  }

  /**
   * Release IP from a mobile number
   * @param mobile Mobile number to release IP from
   * @returns Success status
   */
  async releaseIpFromMobile(
    mobile: string,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.debug(`Releasing IP from mobile: ${mobile}`);

    try {
      await this.ipManagementService.releaseIpFromMobile({ mobile });

      this.logger.log(`Successfully released IP from mobile: ${mobile}`);
      return {
        success: true,
        message: `IP released from mobile ${mobile}`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to release IP from mobile ${mobile}: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        message: `Failed to release IP: ${error.message}`,
      };
    }
  }
}
