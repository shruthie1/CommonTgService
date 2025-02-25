import { Module, forwardRef } from '@nestjs/common';
import { TelegramController } from './Telegram.controller';
import { TelegramService } from './Telegram.service';
import { UsersModule } from '../users/users.module';
import { BufferClientModule } from '../buffer-clients/buffer-client.module';
import { ActiveChannelsModule } from '../active-channels/active-channels.module';
import { ChannelsModule } from '../channels/channels.module';
import { ConnectionManager } from './utils/connection-manager';
import { TelegramLogger } from './utils/telegram-logger';

@Module({
    imports: [
        forwardRef(() => UsersModule),
        BufferClientModule,
        forwardRef(() => ActiveChannelsModule),
        forwardRef(() => ChannelsModule)
    ],
    controllers: [TelegramController],
    providers: [
        TelegramService,
        {
            provide: 'CONNECTION_MANAGER',
            useValue: ConnectionManager.getInstance()
        },
        {
            provide: 'TELEGRAM_LOGGER',
            useValue: TelegramLogger.getInstance()
        }
    ],
    exports: [TelegramService]
})
export class TelegramModule { }
