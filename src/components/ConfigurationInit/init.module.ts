import { Module, Global, OnModuleDestroy, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { ConfigurationService } from './init.service';
import { ConfigurationSchema } from './configuration.schema';
import { ConfigurationController } from './init.controller';
import { Connection } from 'mongoose';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { notifbot } from '../../utils/logbots';
import path from 'path';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      envFilePath: [path.resolve(process.cwd(), '.env'), '.env']
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const uri = process.env.mongouri || configService.get<string>('mongouri');
        if (!uri) {
          throw new Error('MongoDB URI is not configured');
        }

        return {
          uri,
          maxPoolSize: 10,
          serverSelectionTimeoutMS: 10000,
          socketTimeoutMS: 45000,
          connectTimeoutMS: 10000,
          heartbeatFrequencyMS: 10000,
          family: 4,
          retryWrites: true,
          retryReads: true,
        };
      },
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([{
      name: 'configurationModule',
      collection: 'configuration',
      schema: ConfigurationSchema
    }])
  ],
  providers: [ConfigurationService],
  controllers: [ConfigurationController],
  exports: [ConfigurationService, MongooseModule],
})
export class InitModule implements OnModuleDestroy, OnModuleInit {
  private static initializationStatus = {
    isInitialized: false,
    isInitializing: false,
    isDestroying: false,
  };

  private connectionHealthCheckInterval?: NodeJS.Timeout;
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds

  constructor(
    @Inject(getConnectionToken()) private readonly connection: Connection,
    private readonly configService: ConfigService,
  ) { }

  async onModuleInit(): Promise<void> {
    if (InitModule.initializationStatus.isInitializing || InitModule.initializationStatus.isInitialized) {
      return;
    }

    InitModule.initializationStatus.isInitializing = true;

    try {
      console.log(`Initializing configuration module...`);

      await this.validateConnection();
      this.setupConnectionEventHandlers();
      this.startHealthCheck();

      InitModule.initializationStatus.isInitialized = true;
      InitModule.initializationStatus.isInitializing = false;

      console.log(`Started :: ${process.env.clientId}`);

      // Optional: Send notification on successful startup
      await this.sendNotification(`started :: ${process.env.clientId}`);

    } catch (error) {
      InitModule.initializationStatus.isInitializing = false;
      console.error('Failed to initialize configuration module:', error);
      throw error;
    }
  }

  private async validateConnection(): Promise<void> {
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        if (this.connection.readyState !== 1) {
          throw new Error(`MongoDB connection not ready. Current state: ${this.connection.readyState}`);
        }

        // Test the connection with a simple operation
        await this.connection.db.admin().ping();
        console.log('MongoDB connection validated successfully');
        return;

      } catch (error) {
        retryCount++;
        console.warn(`Connection validation attempt ${retryCount}/${maxRetries} failed:`, error);

        if (retryCount >= maxRetries) {
          throw new Error(`Failed to validate MongoDB connection after ${maxRetries} attempts: ${error.message}`);
        }

        // Wait before retrying
        await this.delay(2000 * retryCount);
      }
    }
  }

  private setupConnectionEventHandlers(): void {
    this.connection.on('connected', () => {
      console.log('MongoDB Connected');
    });

    this.connection.on('error', (error) => {
      console.error('MongoDB Connection Error:', error);
    });

    this.connection.on('disconnected', () => {
      console.warn('MongoDB Disconnected');
    });

    this.connection.on('reconnected', () => {
      console.log('MongoDB Reconnected');
    });

    this.connection.on('close', () => {
      console.log('MongoDB Connection Closed');
    });
  }

  private startHealthCheck(): void {
    this.connectionHealthCheckInterval = setInterval(async () => {
      try {
        if (this.connection.readyState === 1) {
          await this.connection.db.admin().ping();
        }
      } catch (error) {
        console.error('MongoDB health check failed:', error);
      }
    }, this.HEALTH_CHECK_INTERVAL);
  }

  private stopHealthCheck(): void {
    if (this.connectionHealthCheckInterval) {
      clearInterval(this.connectionHealthCheckInterval);
      this.connectionHealthCheckInterval = undefined;
    }
  }

  private async sendNotification(message: string): Promise<void> {
    try {
      const url = `${notifbot()}&text=${encodeURIComponent(message)}`;
      await fetchWithTimeout(url, { timeout: 5000 });
    } catch (error) {
      console.warn('Failed to send notification:', error);
      // Don't throw - notification failure shouldn't break initialization
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async onModuleDestroy(): Promise<void> {
    if (InitModule.initializationStatus.isDestroying) {
      return;
    }

    InitModule.initializationStatus.isDestroying = true;

    try {
      console.log('Init Module destroying...');

      this.stopHealthCheck();
      await this.sendNotification(`closed :: ${process.env.clientId}`);

      if (this.connection && this.connection.readyState !== 0) {
        console.log('Closing MongoDB connection...');
        await this.connection.close(true);
      }

    } catch (error) {
      console.error('Error during module destruction:', error);
    } finally {
      InitModule.initializationStatus = {
        isInitialized: false,
        isInitializing: false,
        isDestroying: false,
      };
    }
  }

  // Public method to check initialization status
  static getInitializationStatus() {
    return { ...InitModule.initializationStatus };
  }

  // Public method to check if module is ready
  static isReady(): boolean {
    return InitModule.initializationStatus.isInitialized && !InitModule.initializationStatus.isDestroying;
  }
}