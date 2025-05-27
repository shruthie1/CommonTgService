import { Module, forwardRef } from '@nestjs/common';
import { TgSignupController } from './tg-signup.controller';
import { UsersModule } from '../users/users.module';
import { TgSignupService } from './tg-signup.service';

@Module({
    imports: [forwardRef(() => UsersModule)],
    controllers: [TgSignupController],
    providers: [TgSignupService],
    exports: [TgSignupService]
})
export class TgSignupModule { }
