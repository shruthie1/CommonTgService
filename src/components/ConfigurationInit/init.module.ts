import { Module, Global, OnModuleDestroy, Inject, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { ConfigurationService } from './init.service';
import { ConfigurationSchema } from './configuration.schema';
import { ConfigurationController } from './init.controller';
import { Connection } from 'mongoose';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { ppplbot } from '../../utils/logbots';
@Global()
@Module({
  imports: [
    ConfigModule.forRoot(), // Ensure ConfigModule is imported
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri: process.env.mongouri,
      }),
    }),
    MongooseModule.forFeature([{
      name: 'configurationModule', collection: 'configuration', schema: ConfigurationSchema
    }])
  ],
  providers: [ConfigurationService],
  controllers: [ConfigurationController],
  exports: [ConfigModule, MongooseModule],
})
export class initModule implements OnModuleDestroy, OnModuleInit {
  constructor(@Inject(getConnectionToken()) private readonly connection: Connection) {}
  async onModuleInit() {
    console.log(`Started :: ${process.env.clientId}`)
    await fetchWithTimeout(`${ppplbot()}&text=${encodeURIComponent(`Started :: ${process.env.clientId}`)}`);
  }

  async onModuleDestroy() {
    console.log("Init Module Destroying")
    await fetchWithTimeout(`${ppplbot()}&text=${encodeURIComponent(`closed :: ${process.env.clientId}`)}`);
    this.closeConnection();
  }

  private closeConnection() {
    console.log("Closing mongoose connection")
    this.connection.close(true)
  }
}