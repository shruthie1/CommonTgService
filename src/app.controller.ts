import { Controller, Get, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { AppService } from './app.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { existsSync, mkdirSync, promises as fs } from 'fs';
import { diskStorage, File as MulterFile } from 'multer';
import { join } from 'path';
import { CloudinaryService } from './cloudinary';

@Controller()
export class AppController {
    constructor(private readonly appService: AppService) {}

    @Get()
    getHello(): string {
        CloudinaryService.getInstance("kavya")
        return this.appService.getHello();
    }

    @Post('updateCommonService')
    @UseInterceptors(
        FileInterceptor('file', {
            storage: diskStorage({
                destination: (req, file, cb) => {
                    try {
                        const folderPath = join(__dirname, '..', 'uploads');
                        if (!existsSync(folderPath)) {
                            mkdirSync(folderPath, { recursive: true });
                        }
                        cb(null, folderPath);
                    } catch (error) {
                        cb(error, null);
                    }
                },
                filename: (req, file, cb) => {
                    cb(null, 'index.js');
                },
            }),
        }),
    )
    @ApiOperation({ summary: 'Upload a file to update commonService index.js' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: { type: 'string', format: 'binary' },
            },
        },
    })
    async uploadFileAndUpdate(@UploadedFile() file: MulterFile): Promise<{ message: string }> {
        try {
            const targetDir = join(__dirname, '..', 'node_modules', 'commonService', 'dist');
            const filePath = join(targetDir, 'index.js');

            // Ensure the target directory exists
            if (!existsSync(targetDir)) {
                mkdirSync(targetDir, { recursive: true });
            }

            // Read the uploaded file
            const fileBuffer = await fs.readFile(file.path);

            // Write to the target location
            await fs.writeFile(filePath, fileBuffer);

            console.log('commonService/index.js updated successfully.');
            return { message: 'commonService/index.js updated successfully' };
        } catch (error) {
            console.error('Failed to update commonService/index.js:', error);
            throw error;
        }
    }

}
