import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ArchivedClientSchema } from './schemas/archived-client.schema';
import { TelegramModule } from '../Telegram/Telegram.module';
import { ArchivedClientService } from './archived-client.service';
import { ArchivedClientController } from './archived-client.controller';
import { InitModule } from '../ConfigurationInit/init.module';
import { ClientModule } from '../clients/client.module';

@Module({
  imports: [
    InitModule,
    MongooseModule.forFeature([{ collection: 'archivedClients', name: 'ArchivedClient', schema: ArchivedClientSchema }]),
    forwardRef(() => TelegramModule),
    forwardRef(() => ClientModule)
  ],
  controllers: [ArchivedClientController],
  providers: [ArchivedClientService],
  exports: [ArchivedClientService]
})
export class ArchivedClientModule { }
