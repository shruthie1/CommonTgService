import { AppService } from './app.service';
import { File as MulterFile } from 'multer';
export declare class AppController {
    private readonly appService;
    constructor(appService: AppService);
    getHello(): string;
    uploadFileAndUpdate(file: MulterFile): Promise<{
        message: string;
    }>;
}
