import { Module, forwardRef } from '@nestjs/common';
import { TelegramController } from './Telegram.controller';
import { UsersModule } from '../users/users.module';
import { BufferClientModule } from '../buffer-clients/buffer-client.module';
import { TelegramService } from './Telegram.service';
import { ActiveChannelsModule } from '../activechannels/activechannels.module';

@Module({
    imports: [
        forwardRef(() => UsersModule),
        BufferClientModule,
        forwardRef(() => ActiveChannelsModule)],
    controllers: [TelegramController],
    providers: [TelegramService],
    exports: [TelegramService]
})
export class TelegramModule { }
