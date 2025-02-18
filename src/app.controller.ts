import { Controller, Get, Post, UploadedFile, UseInterceptors, Body, HttpException, ValidationPipe } from '@nestjs/common';
import { AppService } from './app.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { existsSync, mkdirSync, promises as fs } from 'fs';
import { diskStorage, File as MulterFile } from 'multer';
import { join } from 'path';
import { CloudinaryService } from './cloudinary';
import axios, { AxiosResponse } from 'axios';
import { ExecuteRequestDto } from './components/shared/dto/execute-request.dto';

interface RequestResponse {
    status: number;
    statusText: string;
    headers: Record<string, any>;
    data: any;
}

@Controller()
export class AppController {
    constructor(private readonly appService: AppService) {}

    @Get()
    getHello(): string {
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

    @Post('execute-request')
    @ApiOperation({ summary: 'Execute an HTTP request with given details' })
    @ApiBody({
        schema: {
            type: 'object',
            required: ['url'],
            properties: {
                url: { type: 'string', description: 'The URL to send the request to' },
                method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], default: 'GET' },
                headers: { type: 'object', additionalProperties: { type: 'string' } },
                data: { type: 'object', description: 'Request body data' },
                params: { type: 'object', additionalProperties: { type: 'string' } }
            }
        }
    })
    async executeRequest(@Body(new ValidationPipe({ transform: true })) requestDetails: ExecuteRequestDto): Promise<RequestResponse> {
        try {
            const { url, method = 'GET', headers = {}, data, params } = requestDetails;
            
            const response: AxiosResponse = await axios({
                url,
                method,
                headers,
                data,
                params,
                validateStatus: () => true // This ensures axios doesn't throw error for non-2xx responses
            });

            return response.data;
        } catch (error) {
            throw new HttpException({
                message: 'Failed to execute request',
                error: error.message
            }, 500);
        }
    }
}
