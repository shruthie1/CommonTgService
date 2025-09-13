import { Controller, Get, Post, Body, ValidationPipe, HttpException, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import axios, { AxiosError, AxiosResponse } from 'axios';
import { ExecuteRequestDto } from './components/shared/dto/execute-request.dto';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import * as https from 'https';
import { URL } from 'url';
import { parseError , Logger} from './utils';

@ApiTags('App')
@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);
  private readonly DEFAULT_TIMEOUT = 30000;
  private readonly MAX_CONTENT_SIZE = 50 * 1024 * 1024; // 50MB

  constructor() { }

  @Get()
  getHello(): string {
    return 'Hello World!';
  }
  @Post('execute-request')
  @ApiOperation({
    summary: 'Execute an HTTP request with given details',
    description: 'Makes an HTTP request to the specified URL with provided configuration and returns the response'
  })
  @ApiResponse({ status: 201, description: 'Request executed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error or request execution failed' })
  async executeRequest(
    @Body(new ValidationPipe({
      transform: true,
      forbidNonWhitelisted: true,
      whitelist: true
    })) req: ExecuteRequestDto,
    @Res() res: Response
  ): Promise<any> {
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
        timeout = this.DEFAULT_TIMEOUT,
        followRedirects = true,
        maxRedirects = 5
      } = req;

      // Basic validation
      if (!url) {
        throw new HttpException('URL is required', HttpStatus.BAD_REQUEST);
      }

      try {
        const parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          throw new HttpException(
            'Invalid URL protocol. Only HTTP and HTTPS are supported.',
            HttpStatus.BAD_REQUEST
          );
        }
      } catch (error) {
        throw new HttpException('Invalid URL format', HttpStatus.BAD_REQUEST);
      }

      // Positive case start log (basic)
      this.logger.log(`[${requestId}] Starting HTTP ${method} request to ${url}`);

      const httpsAgent = new https.Agent({
        rejectUnauthorized: true
      });

      const response: AxiosResponse = await axios({
        url,
        method,
        headers: {
          ...headers,
          'x-api-key': process.env.X_API_KEY || 'santoor',
        },
        data,
        params,
        responseType,
        timeout,
        maxRedirects: followRedirects ? maxRedirects : 0,
        maxContentLength: this.MAX_CONTENT_SIZE,
        maxBodyLength: this.MAX_CONTENT_SIZE,
        validateStatus: null,
        decompress: true,
        httpsAgent,
        transitional: {
          clarifyTimeoutError: true
        }
      });

      const executionTime = Date.now() - startTime;

      // Positive case completion log (basic)
      this.logger.log(`[${requestId}] Completed in ${executionTime}ms with status ${response.status}`);

      // Set response headers except transfer-encoding
      Object.entries(response.headers).forEach(([key, value]) => {
        if (key.toLowerCase() === 'transfer-encoding') return;
        if (Array.isArray(value)) {
          res.setHeader(key, value);
        } else if (value) {
          res.setHeader(key, value.toString());
        }
      });

      res.status(response.status);

      if (this.isBinaryResponse(responseType, response.headers['content-type'])) {
        if (!res.getHeader('content-type') && response.headers['content-type']) {
          res.setHeader('content-type', response.headers['content-type']);
        }
        res.send(Buffer.from(response.data));
      } else {
        res.send(response.data);
      }
      return;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      parseError(error, `Failed to Execute Request: ${req.url} | Method: ${req.method?.toUpperCase()}`)
      // Detailed negative case log
      this.logger.error({
        message: `[${requestId}] Request failed after ${executionTime}ms`,
        requestId,
        request: {
          url: req.url,
          method: req.method || 'GET',
          params: req.params,
          headers: this.sanitizeHeaders(req.headers || {}),
          timeout: req.timeout || this.DEFAULT_TIMEOUT,
          responseType: req.responseType || 'json'
        },
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
          code: error.code,
          status: error.response?.status,
          responseData: error.response?.data
        }
      });

      const errorDetails = this.handleRequestError(error, requestId);

      res.status(errorDetails.status || HttpStatus.INTERNAL_SERVER_ERROR);
      res.send(errorDetails);
      return;
    }
  }


  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sensitiveHeaders = ['authorization', 'cookie', 'proxy-authorization'];
    const sanitized = { ...headers };

    // Redact sensitive headers
    sensitiveHeaders.forEach(header => {
      Object.keys(sanitized).forEach(key => {
        if (key.toLowerCase() === header.toLowerCase()) {
          sanitized[key] = '[REDACTED]';
        }
      });
    });

    return sanitized;
  }

  private isBinaryResponse(responseType: string, contentType?: string): boolean {
    if (responseType === 'arraybuffer') return true;

    if (contentType) {
      const binaryTypes = [
        'application/octet-stream',
        'image/',
        'audio/',
        'video/',
        'application/pdf',
        'application/zip',
        'application/x-zip-compressed',
        'application/binary'
      ];

      return binaryTypes.some(type => contentType.toLowerCase().includes(type.toLowerCase()));
    }

    return false;
  }

  private handleRequestError(error: any, requestId: string): any {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      // Handle specific error types
      if (axiosError.code === 'ECONNABORTED') {
        return {
          status: HttpStatus.GATEWAY_TIMEOUT,
          error: 'Request timeout',
          message: 'The request took too long to complete',
          requestId
        };
      }

      if (axiosError.code === 'ECONNREFUSED') {
        return {
          status: HttpStatus.BAD_GATEWAY,
          error: 'Connection refused',
          message: 'Could not connect to the target server',
          requestId
        };
      }

      if (axiosError.response) {
        return {
          status: axiosError.response.status,
          headers: this.sanitizeHeaders(axiosError.response.headers as Record<string, string>),
          data: axiosError.response.data,
          requestId
        };
      }

      if (axiosError.request) {
        return {
          status: HttpStatus.BAD_GATEWAY,
          error: 'No response',
          message: 'The request was made but no response was received',
          code: axiosError.code,
          requestId
        };
      }

      return {
        status: HttpStatus.BAD_GATEWAY,
        error: axiosError.code || 'Request failed',
        message: axiosError.message,
        requestId
      };
    }

    // Handle non-Axios errors
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal server error',
      message: error.message || 'An unexpected error occurred',
      requestId
    };
  }
}
