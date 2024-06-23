import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClientSchema } from '../clients/schemas/client.schema';
import { TelegramModule } from '../Telegram/Telegram.module';
import { ArchivedClientService } from './archived-client.service';
import { ArchivedClientController } from './archived-client.controller';

@Module({
  imports: [MongooseModule.forFeature([{ collection: 'ArchivedClients', name: 'ArchivedArchivedClientsModule', schema: ClientSchema }]),
    // forwardRef(() => TelegramModule)
  ],
  controllers: [ArchivedClientController],
  providers: [ArchivedClientService],
  exports:[ArchivedClientService]
})
export class ArchivedClientModule { }
