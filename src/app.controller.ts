import { BadRequestException, Body, Controller, Get, HttpException, HttpStatus, Param, ParseIntPipe, Post, Query, Res, UseInterceptors, ValidationPipe } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import axios, { AxiosError, AxiosResponse } from 'axios';
import { ExecuteRequestDto } from './components/shared/dto/execute-request.dto';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import * as https from 'https';
import { URL } from 'url';
import { parseError , Logger} from './utils';
import { ClientService } from './components/clients/client.service';
import { AppService, VideoDetails } from './app.service';
import { CloudflareCacheInterceptor } from './interceptors/cloudflare-cache.interceptor';
import { NoCache } from './decorators/no-cache.decorator';

@ApiTags('App')
@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);
  private readonly DEFAULT_TIMEOUT = 30000;
  private readonly MAX_CONTENT_SIZE = 50 * 1024 * 1024; // 50MB

  constructor(
    private readonly clientService: ClientService,
    private readonly appService: AppService,
  ) { }

  @Get()
  getHello(): string {
    return 'Hello World!';
  }

  @Get('health')
  health(): string {
    return this.getHello();
  }

  @Get('refreshmap')
  async refreshMap(): Promise<void> {
    await this.clientService.refreshMap();
  }

  @Get('setupClient/:clientId')
  async setupClient(@Param('clientId') clientId: string, @Query() query: any) {
    return this.appService.setupClient(clientId, query);
  }

  @Get('forward')
  async forward(
    @Query('url') url: string,
    @Query() query: Record<string, unknown>,
  ) {
    if (!url) throw new BadRequestException('url query parameter is required');
    try {
      new URL(url);
    } catch {
      throw new BadRequestException('url query parameter must be a valid URL');
    }
    const { url: _url, ...params } = query;
    return this.appService.forwardGetRequest(url, params);
  }

  @Get('processUsers/:limit/:skip')
  async processUsers(
    @Param('limit', ParseIntPipe) limit: number,
    @Param('skip', ParseIntPipe) skip: number,
  ) {
    return this.appService.processEligibleUsers(limit, skip);
  }

  @Get('exit')
  exit(): string {
    setTimeout(() => process.exit(0), 2_000);
    return 'Exiting application... in 2 seconds';
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
      this.logger.log(`[${requestId}] Starting HTTP ${method} request to ${this.sanitizeUrl(url)}`);

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

      const contentType = response.headers['content-type'] != null
        ? String(response.headers['content-type'])
        : undefined;
      if (this.isBinaryResponse(responseType, contentType)) {
        if (!res.getHeader('content-type') && contentType) {
          res.setHeader('content-type', contentType);
        }
        res.send(Buffer.from(response.data));
      } else {
        res.send(response.data);
      }
      return;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      parseError(error, `Failed to Execute Request: ${this.sanitizeUrl(req.url)} | Method: ${req.method?.toUpperCase()}`)
      // Detailed negative case log
      this.logger.error({
        message: `[${requestId}] Request failed after ${executionTime}ms`,
        requestId,
        request: {
          url: this.sanitizeUrl(req.url),
          method: req.method || 'GET',
          params: this.sanitizeParams(req.params),
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
    const sensitiveHeaders = ['authorization', 'cookie', 'proxy-authorization', 'x-api-key', 'api-key', 'apikey', 'api_key', 'x-auth-token', 'access-token', 'refresh-token'];
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

  private sanitizeUrl(url?: string): string {
    return (url || '').replace(/([?&](?:apiKey|apikey|api_key|x-api-key|token|access_token|refresh_token|authorization|auth|key|secret|password)=)[^&]*/gi, '$1[REDACTED]');
  }

  private sanitizeParams(params?: Record<string, string>): Record<string, string> | undefined {
    if (!params) return params;
    const sanitized: Record<string, string> = {};

    for (const [key, value] of Object.entries(params)) {
      sanitized[key] = this.isSensitiveField(key) ? '[REDACTED]' : value;
    }

    return sanitized;
  }

  private isSensitiveField(key: string): boolean {
    return /^(apiKey|apikey|api_key|x-api-key|token|access_token|refresh_token|authorization|auth|key|secret|password)$/i.test(key);
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

  @Get('blockUserAll/:tgId')
  @ApiOperation({ summary: 'Block user across all services' })
  @ApiParam({ name: 'tgId', description: 'Telegram ID of the user', type: String })
  @ApiResponse({ description: 'Returns result of blocking user' })
  async blockUserAll(@Param('tgId') tgId: string) {
    return await this.appService.blockUserAll(tgId);
  }

  @Get('unblockUserAll/:tgId')
  @ApiOperation({ summary: 'Unblock user across all services' })
  @ApiParam({ name: 'tgId', description: 'Telegram ID of the user', type: String })
  @ApiResponse({ description: 'Returns result of unblocking user' })
  async unblockUserAll(@Param('tgId') tgId: string) {
    return await this.appService.unblockUserAll(tgId);
  }

  @Get('isRecentUser')
  @UseInterceptors(CloudflareCacheInterceptor)
  @NoCache()
  @ApiOperation({ summary: 'Check if user is recent and return access data' })
  @ApiQuery({ name: 'chatId', description: 'Chat ID of the user', type: String, required: true })
  @ApiResponse({ description: 'Returns count of recent accesses and video details' })
  async isRecentUser(@Query('chatId') chatId: string) {
    return this.appService.isRecentUser(chatId);
  }

  @Post('isRecentUser')
  @ApiOperation({ summary: 'Update recent user data' })
  @ApiQuery({ name: 'chatId', description: 'Chat ID of the user', type: String, required: true })
  @ApiBody({ description: 'Video details to update', type: Object })
  @ApiResponse({ description: 'Successfully updated recent user data' })
  async updateRecentUser(
    @Query('chatId') chatId: string,
    @Body() videoDetails: any,
  ): Promise<VideoDetails> {
    return await this.appService.updateRecentUser(chatId, videoDetails);
  }

  @Get('resetRecentUser')
  @UseInterceptors(CloudflareCacheInterceptor)
  @NoCache()
  @ApiOperation({ summary: 'Reset recent user data' })
  @ApiQuery({ name: 'chatId', description: 'Chat ID of the user', type: String, required: true })
  @ApiResponse({ description: 'Returns count of recent accesses after reset' })
  async resetRecentUser(@Query('chatId') chatId: string) {
    return this.appService.resetRecentUser(chatId);
  }

  @Get('paymentStats')
  @UseInterceptors(CloudflareCacheInterceptor)
  @NoCache()
  @ApiOperation({ summary: 'Get payment statistics' })
  @ApiQuery({ name: 'chatId', description: 'Chat ID of the user', type: String })
  @ApiQuery({ name: 'profile', description: 'Profile identifier', type: String })
  @ApiResponse({ description: 'Returns payment statistics' })
  async getPaymentStats(
    @Query('chatId') chatId: string,
    @Query('profile') profile: string,
  ) {
    return this.appService.getPaymentStats(chatId, profile);
  }

  @Get('sendToChannel')
  @ApiOperation({ summary: 'Send message to channel' })
  @ApiQuery({ name: 'msg', description: 'Message to send', type: String, required: true })
  @ApiQuery({ name: 'chatId', description: 'Chat ID of the channel', type: String, required: false })
  @ApiQuery({ name: 'token', description: 'Token for authentication', type: String, required: false })
  @ApiResponse({ description: 'Returns result of sending message to channel' })
  async sendToChannel(
    @Query('msg') message: string,
    @Query('chatId') chatId: string,
    @Query('token') token: string,
  ) {
    try {
      if (message.length < 1500) {
        return await this.appService.sendToChannel(chatId, token, message);
      } else {
        console.log('Skipped Message:', decodeURIComponent(message));
        return 'sent';
      }
    } catch (e) {
      parseError(e);
    }
  }

  @Get('sendToAll')
  @ApiOperation({ summary: 'Send endpoint to all clients' })
  @ApiQuery({ name: 'query', description: 'Endpoint to send', type: String, required: true })
  @ApiResponse({ description: 'Returns confirmation of endpoint sent' })
  async sendToAll(@Query('query') query: string) {
    try {
      const decodedEndpoint = decodeURIComponent(query);
      this.appService.sendToAll(decodedEndpoint);
      return `Send ${query}`;
    } catch (e) {
      parseError(e);
      throw e;
    }
  }

  @Get('joinChannelsForClients')
  @ApiOperation({ summary: 'Join channels for clients' })
  @ApiResponse({ description: 'Returns result of joining channels for clients' })
  async joinChannelsforBufferClients(): Promise<string> {
    return this.appService.joinchannelForClients();
  }

  @Get('maskedCls')
  @UseInterceptors(CloudflareCacheInterceptor)
  @NoCache()
  @ApiOperation({ summary: 'Retrieve masked CLS data' })
  @ApiQuery({ name: 'query', description: 'Query parameters', type: Object })
  @ApiResponse({ description: 'Returns masked CLS data' })
  async maskedCls(@Query() query: object): Promise<any> {
    return await this.appService.findAllMasked(query);
  }

  @Get('portalData')
  @ApiOperation({ summary: 'Retrieve portal data' })
  @ApiQuery({ name: 'query', description: 'Query parameters', type: Object })
  @ApiResponse({ description: 'Returns portal data including client and UPIs' })
  async portalData(
    @Query() query: object,
  ): Promise<{ client: any; upis: object }> {
    return await this.appService.portalData(query);
  }

  @Get('/requestcall')
  @ApiOperation({ summary: 'Request a call' })
  @ApiQuery({ name: 'username', description: 'Username', type: String, required: true })
  @ApiQuery({ name: 'chatId', description: 'Chat ID', type: String, required: true })
  @ApiQuery({ name: 'type', description: 'Ladder type', type: String, required: false })
  @ApiResponse({ description: 'Call request processed successfully' })
  async requestCall(
    @Query('username') username: string,
    @Query('chatId') chatId: string,
    @Query('type') type?: string,
  ) {
    return await this.appService.getRequestCall(username, chatId, type);
  }

  @Get('refreshPrimary')
  @ApiOperation({ summary: 'Refresh primary clients' })
  @ApiResponse({ description: 'Returns confirmation of primary clients refresh' })
  async refreshPrimary() {
    this.appService.refreshPrimary();
    return '1';
  }

  @Get('refreshSecondary')
  @ApiOperation({ summary: 'Refresh secondary clients' })
  @ApiResponse({ description: 'Returns confirmation of secondary clients refresh' })
  async refreshSecondary() {
    this.appService.refreshSecondary();
    return '2';
  }

  @Get('exitPrimary')
  @ApiOperation({ summary: 'Exit primary clients' })
  @ApiResponse({ description: 'Returns confirmation of exiting primary clients' })
  async exitPrimary() {
    this.appService.exitPrimary();
    return '1';
  }

  @Get('exitSecondary')
  @ApiOperation({ summary: 'Exit secondary clients' })
  @ApiResponse({ description: 'Returns confirmation of exiting secondary clients' })
  async exitSecondary() {
    this.appService.exitSecondary();
    return '2';
  }

  @Get('/getviddata')
  @ApiOperation({ summary: 'Get video data' })
  @ApiQuery({ name: 'profile', description: 'Profile', type: String, required: false })
  @ApiQuery({ name: 'clientId', description: 'Client ID', type: String, required: false })
  @ApiQuery({ name: 'chatId', description: 'Chat ID', type: String, required: true })
  @ApiResponse({ description: 'Video data retrieved successfully' })
  async getVidData(
    @Query('profile') profile: string,
    @Query('clientId') clientId: string,
    @Query('chatId') chatId: any,
  ) {
    return await this.appService.getUserData(profile, clientId, chatId);
  }

  @Post('/getviddata')
  @ApiOperation({ summary: 'Update video data' })
  @ApiQuery({ name: 'profile', description: 'Profile', type: String, required: false })
  @ApiQuery({ name: 'clientId', description: 'Client ID', type: String, required: false })
  @ApiBody({ description: 'Body data', type: Object })
  @ApiResponse({ description: 'Video data updated successfully' })
  async updateVidData(
    @Query('profile') profile: string,
    @Query('clientId') clientId: string,
    @Body() body: any,
  ) {
    return await this.appService.updateUserData(profile, clientId, body);
  }

  @Post('/getUserConfig')
  @ApiOperation({ summary: 'Update user configuration' })
  @ApiQuery({ name: 'filter', description: 'Filter parameters', type: Object })
  @ApiBody({ description: 'Configuration data', type: Object })
  @ApiResponse({ description: 'User configuration updated successfully' })
  async updtaeUserConfig(@Query() filter: any, @Body() data: any) {
    throw new Error('Method not implemented');
    // return await this.appService.updateUserConfig(filter, data);
  }

  @Get('/getUserConfig')
  @ApiOperation({ summary: 'Get user configuration' })
  async getUserConfig(@Query() filter: any) {
    return this.appService.getUserConfig(filter);
  }

  @Get('/getallupiIds')
  @ApiOperation({ summary: 'Get all UPI IDs' })
  @ApiResponse({ description: 'All UPI IDs retrieved successfully' })
  async getallupiIds() {
    return await this.appService.getallupiIds();
  }

  @Post('/updateUserData/:chatId')
  @ApiOperation({ summary: 'Update user configuration' })
  @ApiParam({ name: 'chatId', description: 'Chat ID', type: String })
  @ApiQuery({ name: 'profile', description: 'Profile', type: String, required: false })
  @ApiBody({ description: 'User data', type: Object })
  @ApiResponse({ description: 'User configuration updated successfully' })
  async updateUserConfig(
    @Param('chatId') chatId: string,
    @Query('profile') profile: string,
    @Body() data: any,
  ) {
    return await this.appService.updateUserConfig(chatId, profile, data);
  }

  @Get('/getUserInfo')
  @UseInterceptors(CloudflareCacheInterceptor)
  @NoCache()
  @ApiOperation({ summary: 'Get user information' })
  @ApiQuery({ name: 'filter', description: 'Filter parameters', type: Object })
  @ApiResponse({ description: 'User information retrieved successfully' })
  async getUserInfo(@Query() filter: any) {
    return await this.appService.getUserInfo(filter);
  }

  @Get('getdata')
  @UseInterceptors(CloudflareCacheInterceptor)
  @NoCache()
  @ApiOperation({ summary: 'Get data and refresh periodically' })
  @ApiResponse({ description: 'Returns HTML data with periodic refresh' })
  async getData(@Res() res: Response): Promise<void> {
    this.appService.checkAndRefresh();

    const data = await this.appService.getData();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
      <html>
        <head><title>UMS dashboard</title></head>
        <body>
          ${data}
          <script>
            setInterval(() => window.location.reload(), 20000);
          </script>
        </body>
      </html>`);
  }
}
