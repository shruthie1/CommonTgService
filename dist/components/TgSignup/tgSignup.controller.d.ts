import { TgSignupService } from './TgSignup.service';
import { SendCodeDto, VerifyCodeDto, TgSignupResponse } from './dto/tg-signup.dto';
export declare class TgSignupController {
    private readonly tgSignupService;
    private readonly logger;
    constructor(tgSignupService: TgSignupService);
    sendCode(sendCodeDto: SendCodeDto): Promise<TgSignupResponse>;
    verifyCode(verifyCodeDto: VerifyCodeDto): Promise<TgSignupResponse>;
}
