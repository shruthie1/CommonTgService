import { Controller, Get, Post, Body, Param, Patch, Query, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './schemas/user.schema';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse } from '@nestjs/swagger';
import { SearchUserDto } from './dto/search-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ExecuteUserQueryDto } from './dto/execute-user-query.dto';

@ApiTags('Telegram Users')
@Controller('user')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiBody({ type: CreateUserDto })
  @ApiCreatedResponse({ type: User })
  async create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get('/search')
  @ApiOperation({ summary: 'Search users' })
  @ApiQuery({ name: 'tgId', required: false, description: 'Telegram ID' })
  @ApiQuery({ name: 'mobile', required: false, description: 'Mobile number' })
  @ApiQuery({ name: 'twoFA', required: false, description: '2FA status', type: Boolean })
  @ApiQuery({ name: 'expired', required: false, description: 'Expiration status', type: Boolean })
  @ApiQuery({ name: 'session', required: false, description: 'Session string' })
  @ApiQuery({ name: 'firstName', required: false, description: 'First name (partial match)' })
  @ApiQuery({ name: 'lastName', required: false, description: 'Last name' })
  @ApiQuery({ name: 'username', required: false, description: 'Telegram username' })
  @ApiQuery({ name: 'gender', required: false, description: 'Gender' })
  @ApiQuery({ name: 'demoGiven', required: false, description: 'Demo given status', type: Boolean })
  @ApiQuery({ name: 'starred', required: false, description: 'Starred status', type: Boolean })
  @ApiOkResponse({ type: [User] })
  async search(@Query() queryParams: SearchUserDto): Promise<User[]> {
    return this.usersService.search(queryParams);
  }

  @Get('top-relationships')
  @ApiOperation({ summary: 'Get users ranked by relationship quality' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'minScore', required: false, type: Number })
  @ApiQuery({ name: 'gender', required: false, type: String })
  @ApiQuery({ name: 'excludeTwoFA', required: false, type: Boolean })
  @ApiOkResponse({ schema: { type: 'object', properties: { users: { type: 'array' }, total: { type: 'number' }, page: { type: 'number' }, limit: { type: 'number' }, totalPages: { type: 'number' } } } })
  async topRelationships(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('minScore') minScore?: string,
    @Query('gender') gender?: string,
    @Query('excludeTwoFA') excludeTwoFA?: string,
  ) {
    return this.usersService.topRelationships({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      minScore: minScore ? parseFloat(minScore) : undefined,
      gender,
      excludeTwoFA: excludeTwoFA === 'true' });
  }

  @Get('top-interacted')
  @ApiOperation({ summary: 'Get users ranked by interaction score' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'minScore', required: false, type: Number })
  @ApiQuery({ name: 'minCalls', required: false, type: Number })
  @ApiQuery({ name: 'minPhotos', required: false, type: Number })
  @ApiQuery({ name: 'minVideos', required: false, type: Number })
  @ApiQuery({ name: 'excludeTwoFA', required: false, type: Boolean })
  @ApiQuery({ name: 'excludeAudited', required: false, type: Boolean })
  @ApiQuery({ name: 'gender', required: false, type: String })
  @ApiQuery({ name: 'starred', required: false, type: Boolean })
  @ApiOkResponse({ schema: { type: 'object', properties: { users: { type: 'array' }, total: { type: 'number' }, page: { type: 'number' }, limit: { type: 'number' }, totalPages: { type: 'number' } } } })
  async getTopInteractionUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('minScore') minScore?: string,
    @Query('minCalls') minCalls?: string,
    @Query('minPhotos') minPhotos?: string,
    @Query('minVideos') minVideos?: string,
    @Query('excludeTwoFA') excludeTwoFA?: string,
    @Query('excludeAudited') excludeAudited?: string,
    @Query('gender') gender?: string,
    @Query('starred') starred?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : undefined;
    const limitNum = limit ? parseInt(limit, 10) : undefined;
    const minScoreNum = minScore ? parseFloat(minScore) : undefined;
    const minCallsNum = minCalls ? parseInt(minCalls, 10) : undefined;
    const minPhotosNum = minPhotos ? parseInt(minPhotos, 10) : undefined;
    const minVideosNum = minVideos ? parseInt(minVideos, 10) : undefined;

    if (pageNum !== undefined && (isNaN(pageNum) || pageNum < 1)) {
      throw new BadRequestException('Page must be a positive integer');
    }
    if (limitNum !== undefined && (isNaN(limitNum) || limitNum < 1 || limitNum > 100)) {
      throw new BadRequestException('Limit must be between 1 and 100');
    }
    if (minScoreNum !== undefined && (isNaN(minScoreNum) || minScoreNum < 0)) {
      throw new BadRequestException('minScore must be a non-negative number');
    }
    if (minCallsNum !== undefined && (isNaN(minCallsNum) || minCallsNum < 0)) {
      throw new BadRequestException('minCalls must be a non-negative integer');
    }
    if (minPhotosNum !== undefined && (isNaN(minPhotosNum) || minPhotosNum < 0)) {
      throw new BadRequestException('minPhotos must be a non-negative integer');
    }
    if (minVideosNum !== undefined && (isNaN(minVideosNum) || minVideosNum < 0)) {
      throw new BadRequestException('minVideos must be a non-negative integer');
    }

    const excludeTwoFABool = excludeTwoFA === 'true' ? true : (excludeTwoFA === 'false' ? false : undefined);
    const excludeAuditedBool = excludeAudited === 'true';

    return this.usersService.top({
      page: pageNum,
      limit: limitNum,
      minScore: minScoreNum,
      minCalls: minCallsNum,
      minPhotos: minPhotosNum,
      minVideos: minVideosNum,
      excludeTwoFA: excludeTwoFABool,
      excludeAudited: excludeAuditedBool,
      gender,
      starred: starred === 'true' ? true : undefined });
  }

  @Get()
  @ApiOperation({ summary: 'Get all users with optional sorting' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, type: String, description: 'Field to sort by (e.g. msgs, totalChats, contacts, calls.totalCalls, score, lastActive, otherPhotoCount, otherVideoCount, relationships.score)' })
  @ApiQuery({ name: 'sortOrder', required: false, type: String, description: 'Sort order: asc or desc (default: desc)' })
  @ApiOkResponse({ type: [User] })
  async findAll(
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 100;
    const skipNum = skip ? parseInt(skip, 10) : 0;

    if (isNaN(limitNum) || limitNum < 1) {
      throw new BadRequestException('Limit must be a positive integer');
    }
    if (isNaN(skipNum) || skipNum < 0) {
      throw new BadRequestException('Skip must be a non-negative integer');
    }

    const sort = sortBy ? { [sortBy]: (sortOrder === 'asc' ? 1 : -1) as 1 | -1 } : undefined;
    return this.usersService.findAllSorted(limitNum, skipNum, sort);
  }

  @Get(':mobile/relationships')
  @ApiOperation({ summary: 'Get relationship details for a specific user' })
  @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
  @ApiOkResponse({ type: User })
  @ApiNotFoundResponse({ description: 'User not found.' })
  async getUserRelationships(@Param('mobile') mobile: string) {
    return this.usersService.getUserRelationships(mobile);
  }

  @Get('aggregate-sort')
  @ApiOperation({ summary: 'Sort users by computed/nested fields (global)' })
  @ApiQuery({ name: 'field', required: true, type: String, description: 'Computed field: intimateTotal, privateMsgsTopContacts, privateMediaTopContacts, privateVoiceTotal, privateMsgsBestContact, relTopIntimate, relTopMedia, relTopVoice, relCommonChats, relTopCalls, relMeaningfulCalls, relMutualContacts, callPartners, totalCallDuration, longestCall, missedCalls, privateMsgsCallPartners' })
  @ApiQuery({ name: 'sortOrder', required: false, type: String, description: 'asc or desc (default: desc)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiOkResponse({ type: [User] })
  @ApiBadRequestResponse({ description: 'Unknown computed field.' })
  async aggregateSort(
    @Query('field') field: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    if (!field) throw new BadRequestException('field is required');
    const order = sortOrder === 'asc' ? 1 : -1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const skipNum = skip ? parseInt(skip, 10) : 0;
    return this.usersService.aggregateSort(field, order as 1 | -1, limitNum, skipNum);
  }

  @Post('recompute-score/:mobile')
  @ApiOperation({ summary: 'Recompute relationship score (live Telegram connection)' })
  @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
  @ApiOkResponse({ type: User })
  @ApiNotFoundResponse({ description: 'User not found.' })
  async recomputeScore(@Param('mobile') mobile: string) {
    await this.usersService.computeRelationshipScore(mobile);
    return this.usersService.getUserRelationships(mobile);
  }

  @Get(':tgId')
  @ApiOperation({ summary: 'Get user by tgId' })
  @ApiParam({ name: 'tgId', description: 'Telegram user ID', type: String })
  @ApiOkResponse({ type: User })
  @ApiNotFoundResponse({ description: 'User not found.' })
  async findOne(@Param('tgId') tgId: string) {
    return this.usersService.findOne(tgId);
  }

  @Patch(':tgId')
  @ApiOperation({ summary: 'Update user by tgId' })
  @ApiParam({ name: 'tgId', description: 'Telegram user ID', type: String })
  @ApiBody({ type: UpdateUserDto })
  @ApiOkResponse({ schema: { type: 'number', description: 'Number of modified documents' } })
  @ApiNotFoundResponse({ description: 'User not found.' })
  async update(@Param('tgId') tgId: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(tgId, updateUserDto);
  }

  @Patch(':mobile/star')
  @ApiOperation({ summary: 'Toggle starred status for a user' })
  @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
  @ApiOkResponse({ schema: { type: 'object', properties: { mobile: { type: 'string' }, starred: { type: 'boolean' } } } })
  @ApiNotFoundResponse({ description: 'User not found.' })
  async toggleStar(@Param('mobile') mobile: string) {
    return this.usersService.toggleStar(mobile);
  }

  @Patch(':tgId/expire')
  @ApiOperation({ summary: 'Mark user as expired (soft delete)' })
  @ApiParam({ name: 'tgId', description: 'Telegram user ID', type: String })
  @ApiOkResponse({ description: 'User marked as expired.' })
  @ApiNotFoundResponse({ description: 'User not found.' })
  async expire(@Param('tgId') tgId: string) {
    return this.usersService.delete(tgId);
  }

  @Post('query')
  @ApiOperation({ summary: 'Execute custom MongoDB query' })
  @ApiBody({ type: ExecuteUserQueryDto })
  @ApiOkResponse({ type: [User] })
  async executeQuery(@Body() requestBody: ExecuteUserQueryDto): Promise<any> {
    const { query, sort, limit, skip } = requestBody;
    return this.usersService.executeQuery(query, sort, limit, skip);
  }
}
