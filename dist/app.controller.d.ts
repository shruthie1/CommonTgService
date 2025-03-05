import { AppService } from './app.service';
import { ExecuteRequestDto } from './components/shared/dto/execute-request.dto';
import { Response } from 'express';
export declare class AppController {
    private readonly appService;
    private logger;
    constructor(appService: AppService);
    getHello(): string;
    executeRequest(requestDetails: ExecuteRequestDto, res: Response): Promise<Response<any, Record<string, any>>>;
    private sanitizeHeaders;
}
