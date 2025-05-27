import { Module, forwardRef } from '@nestjs/common';
import { TgSignupController } from './tg-signup.controller';
import { UsersModule } from '../users/users.module';
import { TgSignupService } from './tg-signup.service';
import { initModule } from '../ConfigurationInit';

@Module({
    imports: [
        initModule.forRoot(),
        forwardRef(() => UsersModule)],
    controllers: [TgSignupController],
    providers: [TgSignupService],
    exports: [TgSignupService]
})
export class TgSignupModule { }
