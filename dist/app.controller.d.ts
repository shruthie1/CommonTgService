import { AppService } from './app.service';
import { File as MulterFile } from 'multer';
import { ExecuteRequestDto } from './components/shared/dto/execute-request.dto';
import { Response } from 'express';
export declare class AppController {
    private readonly appService;
    private logger;
    constructor(appService: AppService);
    getHello(): string;
    uploadFileAndUpdate(file: MulterFile): Promise<{
        message: string;
    }>;
    executeRequest(requestDetails: ExecuteRequestDto, res: Response): Promise<Response<any, Record<string, any>>>;
    private sanitizeHeaders;
}
