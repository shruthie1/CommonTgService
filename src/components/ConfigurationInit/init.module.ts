import { Module, Global, OnModuleDestroy, Inject, OnModuleInit, DynamicModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { ConfigurationService } from './init.service';
import { ConfigurationSchema } from './configuration.schema';
import { ConfigurationController } from './init.controller';
import { Connection } from 'mongoose';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { notifbot } from '../../utils/logbots';

@Global()
@Module({
  providers: [ConfigurationService],
  controllers: [ConfigurationController],
})
export class initModule implements OnModuleDestroy, OnModuleInit {
  constructor(@Inject(getConnectionToken()) private readonly connection: Connection) {}

  static forRoot(): DynamicModule {
    const mongooseModules = [
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
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
          };
        },
        inject: [ConfigService],
      }),
      MongooseModule.forFeature([{
        name: 'configurationModule',
        collection: 'configuration',
        schema: ConfigurationSchema
      }])
    ];

    return {
      module: initModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          cache: true,
          expandVariables: true,
          envFilePath: '.env',
        }),
        ...mongooseModules
      ],
      exports: [ConfigModule, ...mongooseModules],
      providers: [ConfigurationService],
      controllers: [ConfigurationController],
      global: true,
    };
  }
  
  async onModuleInit() {
    console.log(`Initializing configuration module...`);
    try {
      await this.connection.asPromise();
      console.log(`MongoDB connection established`);
      console.log(`Started :: ${process.env.clientId}`);
    } catch (error) {
      console.error('Failed to initialize MongoDB connection:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    console.log("Init Module Destroying");
    try {
      await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(`closed :: ${process.env.clientId}`)}`);
      await this.closeConnection();
    } catch (error) {
      console.error('Error during module cleanup:', error);
    }
  }

  private async closeConnection() {
    console.log("Closing mongoose connection");
    try {
      await this.connection.close(true);
      console.log("MongoDB connection closed successfully");
    } catch (error) {
      console.error('Error closing MongoDB connection:', error);
      throw error;
    }
  }
}