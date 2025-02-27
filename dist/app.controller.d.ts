import { AppService } from './app.service';
import { File as MulterFile } from 'multer';
import { ExecuteRequestDto } from './components/shared/dto/execute-request.dto';
interface RequestResponse {
    status: number;
    statusText: string;
    headers: Record<string, any>;
    data: any;
}
export declare class AppController {
    private readonly appService;
    private logger;
    constructor(appService: AppService);
    getHello(): string;
    uploadFileAndUpdate(file: MulterFile): Promise<{
        message: string;
    }>;
    executeRequest(requestDetails: ExecuteRequestDto): Promise<RequestResponse>;
    private sanitizeHeaders;
}
export {};
