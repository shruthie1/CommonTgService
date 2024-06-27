import { Module, Global, OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getConnectionToken} from '@nestjs/mongoose';
import { ConfigurationService } from './init.service';
import { ConfigurationSchema } from './configuration.schema';
import { ConfigurationController } from './init.controller';
import { Connection } from 'mongoose';

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
  providers:[ConfigurationService],
  controllers:[ConfigurationController],
  exports: [ConfigModule, MongooseModule],
})
export class initModule implements OnModuleDestroy {
  constructor(@Inject(getConnectionToken()) private readonly connection: Connection) {}

  onModuleDestroy() {
    console.log("Init Module Destroying")
    this.closeConnection();
  }

  private closeConnection() {
    console.log("Closing mongoose connection")
    this.connection.close(true)
  }
}