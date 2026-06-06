import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import {
  createPromotionRuntime,
  PromotionRuntime,
  type ChannelIntelligenceDocument,
  type AggregateableCollectionLike,
  type MongoCollectionLike,
} from 'promo-helper';
import { RedisClient } from '../../utils/redisClient';
import { UserDataService } from '../user-data/user-data.service';

export interface AttributionResult {
  attributedChannels: Array<{ channelId: string; mobile: string; weight: number }>;
}

export interface InitializationStatus {
  initialized: boolean;
  redis: boolean;
  error?: string;
}

@Injectable()
export class PromotionIntelligenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PromotionIntelligenceService.name);
  private runtime: PromotionRuntime | null = null;
  private initializing: Promise<InitializationStatus> | null = null;
  private initialized = false;
  private initError: string | null = null;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly userDataService: UserDataService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.initialize();
  }

  async onModuleDestroy(): Promise<void> {
    this.closeRuntimeResources();
  }

  async initialize(): Promise<InitializationStatus> {
    if (this.initialized) {
      return { initialized: true, redis: !!this.runtime?.tracker };
    }
    if (this.initializing) {
      return this.initializing;
    }

    const initializing = this.initializeRuntime();
    this.initializing = initializing;
    try {
      return await initializing;
    } finally {
      if (this.initializing === initializing) {
        this.initializing = null;
      }
    }
  }

  private async initializeRuntime(): Promise<InitializationStatus> {
    try {
      if (!this.connection.db) {
        throw new Error('MongoDB connection is not ready');
      }

      const intelligenceCollection: MongoCollectionLike<ChannelIntelligenceDocument> & AggregateableCollectionLike =
        this.connection.db.collection<ChannelIntelligenceDocument>('channelIntelligence');
      const activeChannelsCollection = this.connection.db.collection('activeChannels');

      let redis = null;
      try {
        redis = RedisClient.getClient();
      } catch (error) {
        this.logger.warn(`Redis unavailable for promotion intelligence: ${error instanceof Error ? error.message : error}`);
      }
      this.runtime = await createPromotionRuntime({
        channelIntelligenceCollection: intelligenceCollection,
        activeChannelCollection: activeChannelsCollection,
        redis,
        enableLocks: !!redis,
        enableAttribution: !!redis,
        enablePercentiles: true,
      });

      this.initialized = true;
      this.initError = null;
      return { initialized: true, redis: !!redis };
    } catch (error) {
      this.closeRuntimeResources();
      const message = error instanceof Error ? error.message : String(error);
      this.initError = message;
      this.logger.warn(`Promotion intelligence initialization failed: ${message}`);
      return { initialized: false, redis: false, error: message };
    }
  }

  async getHealth() {
    const status = await this.initialize();
    return {
      ...status,
      channelIntelligence: this.initialized,
      percentiles: !!this.runtime?.percentiles,
      attribution: !!this.runtime?.attribution,
      lastError: this.initError,
    };
  }

  async getChannel(channelId: string): Promise<ChannelIntelligenceDocument | null> {
    this.assertReady(false);
    return this.runtime!.intelligence.get(channelId);
  }

  async getChannels(channelIds: string[]): Promise<ChannelIntelligenceDocument[]> {
    this.assertReady(false);
    if (!Array.isArray(channelIds)) {
      throw new BadRequestException('channelIds must be an array');
    }
    return this.runtime!.intelligence.batchGet(channelIds);
  }

  async getTopChannels(limit = 50): Promise<ChannelIntelligenceDocument[]> {
    this.assertReady(false);
    return this.runtime!.intelligence.getTopChannels(this.normalizeLimit(limit, 50, 500));
  }

  async getPercentiles(refresh = false) {
    this.assertReady(false);
    const percentiles = this.runtime!.percentiles;
    if (!percentiles) {
      throw new ServiceUnavailableException('Percentile engine is not initialized');
    }
    if (refresh) {
      return percentiles.getPercentiles();
    }
    return percentiles.getCachedPercentiles() || percentiles.getPercentiles();
  }

  async recordPromotionSend(channelId: string, mobile: string, clientId: string): Promise<{ recorded: true }> {
    this.assertReady(true);
    if (!channelId || !mobile || !clientId) {
      throw new BadRequestException('channelId, mobile, and clientId are required');
    }
    if (!this.runtime!.tracker) {
      throw new ServiceUnavailableException('Redis promotion tracker is not initialized');
    }
    await this.runtime!.tracker.recordSend(channelId, mobile, clientId);
    return { recorded: true };
  }

  async attributeConversion(commonChatIds: string[], chatId?: string, profile?: string, isPaid = false): Promise<AttributionResult> {
    this.assertReady(true);
    if (!Array.isArray(commonChatIds)) {
      throw new BadRequestException('commonChatIds must be an array');
    }

    if (!this.runtime!.attribution) {
      throw new ServiceUnavailableException('Conversion attribution is not initialized');
    }
    const result = await this.runtime!.attribution.attributeConversion(commonChatIds, isPaid);

    if (chatId) {
      const normalizedProfile = this.normalizeProfile(profile);
      const filter = normalizedProfile ? { chatId, profile: normalizedProfile } : { chatId };
      await this.userDataService.bulkUpdateUsers(filter, {
        $set: {
          promotionChannels: result.attributedChannels.map((item) => item.channelId),
          attributionMethod: result.attributedChannels.length > 0 ? 'telegram_lookup' : 'none',
          attributedAt: Date.now(),
        },
      });
    }

    return result;
  }

  async recordChannelConversion(channelId: string, weight = 1, isPaid = false): Promise<{ recorded: true }> {
    this.assertReady(false);
    if (!channelId) {
      throw new BadRequestException('channelId is required');
    }

    const normalizedWeight = this.normalizeWeight(weight);
    await this.runtime!.intelligence.recordConversion(channelId, normalizedWeight);
    if (isPaid) {
      await this.runtime!.intelligence.recordPaidConversion(channelId, normalizedWeight);
    }
    return { recorded: true };
  }

  private assertReady(requireRedis: boolean): void {
    if (!this.initialized) {
      throw new ServiceUnavailableException(this.initError || 'Promotion intelligence is not initialized');
    }
    if (requireRedis && !this.runtime?.tracker) {
      throw new ServiceUnavailableException('Redis is required for this promotion intelligence endpoint');
    }
  }

  private normalizeLimit(limit: number, fallback: number, max: number): number {
    const parsed = Number(limit);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(Math.floor(parsed), max);
  }

  private closeRuntimeResources(): void {
    this.runtime = null;
    this.initializing = null;
    this.initialized = false;
    PromotionRuntime.reset();
  }

  private normalizeWeight(weight: unknown): number {
    const parsed = Number(weight);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }

  private normalizeProfile(profile: unknown): string | null {
    if (typeof profile !== 'string') return null;
    const normalized = profile.trim();
    return normalized.length > 0 ? normalized : null;
  }
}
