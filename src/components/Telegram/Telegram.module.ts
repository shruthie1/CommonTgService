import { Module, forwardRef } from '@nestjs/common';
import { TelegramController } from './Telegram.controller';
import { TelegramService } from './Telegram.service';
import { UsersModule } from '../users/users.module';
import { BufferClientModule } from '../buffer-clients/buffer-client.module';
import { ActiveChannelsModule } from '../active-channels/active-channels.module';
import { ChannelsModule } from '../channels/channels.module';
import { TelegramLogger } from './utils/telegram-logger';
import { TelegramValidationConfig } from './config/telegram-validation.config';
import { initModule } from '../ConfigurationInit';

@Module({
    imports: [
        initModule.forRoot(),
        forwardRef(() => UsersModule),
        BufferClientModule,
        forwardRef(() => ActiveChannelsModule),
        forwardRef(() => ChannelsModule)
    ],
    controllers: [TelegramController],
    providers: [
        TelegramService,
        TelegramValidationConfig,
        {
            provide: 'TELEGRAM_LOGGER',
            useValue: TelegramLogger.getInstance()
        }
    ],
    exports: [TelegramService]
})
export class TelegramModule { }
