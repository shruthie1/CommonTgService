import { Module, forwardRef } from '@nestjs/common';
import { TgSignupController } from './tgSignup.controller';
import { UsersModule } from '../users/users.module';
import { TgSignupService } from './TgSignup.service';

@Module({
    imports: [forwardRef(() => UsersModule)],
    controllers: [TgSignupController],
    providers: [TgSignupService],
    exports: [TgSignupService]
})
export class TgSignupModule { }
