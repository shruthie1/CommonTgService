import { Controller, Get, Post, UploadedFile, UseInterceptors, Body, HttpException, ValidationPipe, Logger, Res } from '@nestjs/common';
import { AppService } from './app.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { existsSync, mkdirSync, promises as fs } from 'fs';
import { diskStorage, File as MulterFile } from 'multer';
import { join } from 'path';
import { CloudinaryService } from './cloudinary';
import axios, { AxiosResponse } from 'axios';
import { ExecuteRequestDto } from './components/shared/dto/execute-request.dto';
import { randomUUID } from 'crypto';
import { Response } from 'express';

interface RequestResponse {
    status: number;
    statusText: string;
    headers: Record<string, any>;
    data: any;
}

@Controller()
export class AppController {
    private logger = new Logger('AppController');

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
    async executeRequest(
        @Body(new ValidationPipe({ transform: true })) requestDetails: ExecuteRequestDto,
        @Res() res: Response
    ) {
        const requestId = randomUUID();
        const startTime = Date.now();

        try {
            const { 
                url, 
                method = 'GET', 
                headers = {}, 
                data, 
                params, 
                responseType = 'json',
                timeout = 30000,
                followRedirects = true,
                maxRedirects = 5
            } = requestDetails;
            
            // Log request details
            this.logger.log({
                message: 'Executing HTTP request',
                requestId,
                details: {
                    url,
                    method,
                    headers: this.sanitizeHeaders(headers),
                    params,
                    responseType,
                    timeout,
                    dataSize: data ? JSON.stringify(data).length : 0
                }
            });
            
            const response = await axios({
                url,
                method,
                headers,
                data,
                params,
                responseType,
                timeout,
                maxRedirects: followRedirects ? maxRedirects : 0,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                validateStatus: () => true,
                decompress: true,
                responseEncoding: responseType === 'json' ? 'utf8' : null
            });

            // Set response status
            res.status(response.status);

            // Copy all headers from the upstream response
            Object.entries(response.headers).forEach(([key, value]) => {
                // Handle array of header values
                if (Array.isArray(value)) {
                    res.setHeader(key, value);
                } else {
                    res.setHeader(key, value as string);
                }
            });

            // Log response details
            this.logger.log({
                message: 'Request completed',
                requestId,
                metrics: {
                    executionTime: Date.now() - startTime,
                    status: response.status
                }
            });

            // Send the response data directly
            return res.send(response.data);

        } catch (error) {
            this.logger.error({
                message: 'Request failed',
                requestId,
                error: {
                    message: error.message,
                    code: error.code,
                    stack: error.stack
                }
            });

            // Handle error response
            if (error.response) {
                // Copy error response headers
                Object.entries(error.response.headers).forEach(([key, value]) => {
                    if (Array.isArray(value)) {
                        res.setHeader(key, value);
                    } else {
                        res.setHeader(key, value as string);
                    }
                });
                
                return res.status(error.response.status).send(error.response.data);
            }

            // Handle network or other errors
            return res.status(500).json({
                message: error.message,
                code: error.code
            });
        }
    }

    // Helper method to sanitize sensitive headers
    private sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
        const sensitiveHeaders = ['authorization', 'cookie', 'set-cookie'];
        return Object.entries(headers).reduce((acc, [key, value]) => {
            if (sensitiveHeaders.includes(key.toLowerCase())) {
                acc[key] = '[REDACTED]';
            } else {
                acc[key] = value;
            }
            return acc;
        }, {});
    }
}
