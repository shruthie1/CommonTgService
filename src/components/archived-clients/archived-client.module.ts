import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClientSchema } from '../clients/schemas/client.schema';
import { TelegramModule } from '../Telegram/Telegram.module';
import { ArchivedClientService } from './archived-client.service';
import { ArchivedClientController } from './archived-client.controller';
import { initModule } from '../ConfigurationInit/init.module';
import { ClientModule } from '../clients/client.module';

@Module({
  imports: [
    initModule,
    MongooseModule.forFeature([{ collection: 'ArchivedClients', name: 'ArchivedArchivedClientsModule', schema: ClientSchema }]),
    forwardRef(() => TelegramModule),
    forwardRef(() => ClientModule)
  ],
  controllers: [ArchivedClientController],
  providers: [ArchivedClientService],
  exports: [ArchivedClientService]
})
export class ArchivedClientModule { }
