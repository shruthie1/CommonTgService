import { Controller, Get, Post, UploadedFile, UseInterceptors, Body, HttpException, ValidationPipe, Logger } from '@nestjs/common';
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
    @ApiBody({
        schema: {
            type: 'object',
            required: ['url'],
            properties: {
                url: { type: 'string', description: 'The URL to send the request to' },
                method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], default: 'GET' },
                headers: { type: 'object', additionalProperties: { type: 'string' } },
                data: { type: 'object', description: 'Request body data' },
                params: { type: 'object', additionalProperties: { type: 'string' } },
                responseType: { type: 'string', enum: ['json', 'text', 'blob', 'arraybuffer', 'stream'], default: 'json' },
                timeout: { type: 'number', description: 'Request timeout in milliseconds' }
            }
        }
    })
    async executeRequest(@Body(new ValidationPipe({ transform: true })) requestDetails: ExecuteRequestDto): Promise<RequestResponse> {
        const requestId = randomUUID(); // Generate unique request ID for tracking
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
                    followRedirects,
                    maxRedirects,
                    dataSize: data ? JSON.stringify(data).length : 0
                }
            });
            
            const response: AxiosResponse = await axios({
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
                validateStatus: () => true // This ensures axios doesn't throw error for non-2xx responses
            });

            const executionTime = Date.now() - startTime;

            // Prepare response headers
            const responseHeaders = Object.entries(response.headers).reduce((acc, [key, value]) => {
                acc[key] = Array.isArray(value) ? value.join(', ') : value;
                return acc;
            }, {});

            // Handle different response types
            let responseData = response.data;
            const contentType = response.headers['content-type'];

            // If response is binary and responseType wasn't specified
            if (contentType?.includes('application/octet-stream') && responseType === 'json') {
                responseData = Buffer.from(response.data).toString('base64');
                this.logger.debug({
                    message: 'Converted binary response to base64',
                    requestId,
                    contentType
                });
            }

            // If response is XML and responseType is json, try to parse it
            if (contentType?.includes('xml') && responseType === 'json') {
                try {
                    responseData = response.data;
                } catch (e) {
                    this.logger.warn({
                        message: 'Could not parse XML response to JSON',
                        requestId,
                        error: e.message
                    });
                }
            }

            // Log response details
            this.logger.log({
                message: 'Request completed successfully',
                requestId,
                metrics: {
                    executionTime,
                    responseSize: JSON.stringify(responseData).length,
                    status: response.status
                },
                response: {
                    status: response.status,
                    statusText: response.statusText,
                    contentType,
                    headers: this.sanitizeHeaders(responseHeaders)
                }
            });

            return {
                status: response.status,
                statusText: response.statusText,
                headers: responseHeaders,
                data: responseData
            };
        } catch (error) {
            const executionTime = Date.now() - startTime;

            // Enhanced error handling with detailed logging
            const errorResponse = {
                message: 'Failed to execute request',
                error: error.message,
                code: error.code,
                status: error.response?.status,
                statusText: error.response?.statusText,
                headers: error.response?.headers,
            };

            // Handle specific error types
            if (error.code === 'ECONNABORTED') {
                errorResponse.message = 'Request timed out';
            } else if (error.code === 'ENOTFOUND') {
                errorResponse.message = 'Host not found';
            }

            // Log error details
            this.logger.error({
                message: 'Request failed',
                requestId,
                metrics: {
                    executionTime,
                    errorCode: error.code
                },
                error: {
                    message: error.message,
                    stack: error.stack,
                    response: error.response ? {
                        status: error.response.status,
                        statusText: error.response.statusText,
                        headers: this.sanitizeHeaders(error.response.headers)
                    } : undefined
                }
            });

            throw new HttpException(errorResponse, error.response?.status || 500);
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
