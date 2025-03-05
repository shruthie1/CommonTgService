import { Controller, Get, Post, Body, ValidationPipe, Logger, Res } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiOperation } from '@nestjs/swagger';
import axios from 'axios';
import { ExecuteRequestDto } from './components/shared/dto/execute-request.dto';
import { randomUUID } from 'crypto';
import { Response } from 'express';

@Controller()
export class AppController {
    private logger = new Logger('AppController');

    constructor(private readonly appService: AppService) {}

    @Get()
    getHello(): string {
        return this.appService.getHello();
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
            });

            // Set response status
            res.status(response.status);

            // Copy all headers from the upstream response
            Object.entries(response.headers).forEach(([key, value]) => {
                // Skip transfer-encoding as it might conflict with our response
                if (key.toLowerCase() === 'transfer-encoding') return;

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
                    status: response.status,
                    contentType: response.headers['content-type']
                }
            });

            // For binary responses, send the raw buffer
            if (responseType === 'arraybuffer' ||
                response.headers['content-type']?.includes('application/octet-stream') ||
                response.headers['content-type']?.includes('image/') ||
                response.headers['content-type']?.includes('audio/') ||
                response.headers['content-type']?.includes('video/') ||
                response.headers['content-type']?.includes('application/pdf')) {

                // Ensure content-type is preserved
                if (!res.getHeader('content-type') && response.headers['content-type']) {
                    res.setHeader('content-type', response.headers['content-type']);
                }

                // Send raw buffer for binary data
                return res.send(Buffer.from(response.data));
            }

            // For other types, send as is
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
                    if (key.toLowerCase() === 'transfer-encoding') return;
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
