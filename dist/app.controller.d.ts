import { ExecuteRequestDto } from './components/shared/dto/execute-request.dto';
import { Response } from 'express';
export declare class AppController {
    private readonly logger;
    private readonly DEFAULT_TIMEOUT;
    private readonly MAX_CONTENT_SIZE;
    constructor();
    getHello(): string;
    executeRequest(req: ExecuteRequestDto, res: Response): Promise<any>;
    private sanitizeHeaders;
    private sanitizeUrl;
    private sanitizeParams;
    private isSensitiveField;
    private isBinaryResponse;
    private handleRequestError;
}
