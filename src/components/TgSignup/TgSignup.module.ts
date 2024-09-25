import { Module, forwardRef } from '@nestjs/common';
import { TgSignupController } from './tgSignup.controller';

@Module({
    imports: [],
    controllers: [TgSignupController]
})
export class TgSignupModule { }
