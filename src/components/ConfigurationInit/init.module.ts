import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule} from '@nestjs/mongoose';
import { ConfigurationService } from './init.service';
import { ConfigurationSchema } from './configuration.schema';
import { ConfigurationController } from './init.controller';

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
export class initModule {}
