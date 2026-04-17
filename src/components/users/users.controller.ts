import { Controller, Get, Post, Body, Param, Patch, Query, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './schemas/user.schema';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { SearchUserDto } from './dto/search-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';

@ApiTags('Telegram Users')
@Controller('user')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  async create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get('/search')
  @ApiOperation({ summary: 'Search users' })
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
      excludeTwoFA: excludeTwoFA === 'true',
    });
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
  async getTopInteractionUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('minScore') minScore?: string,
    @Query('minCalls') minCalls?: string,
    @Query('minPhotos') minPhotos?: string,
    @Query('minVideos') minVideos?: string,
    @Query('excludeTwoFA') excludeTwoFA?: string,
    @Query('excludeAudited') excludeAudited?: string,
    @Query('gender') gender?: string
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
    });
  }

  @Get()
  @ApiOperation({ summary: 'Get all users with optional sorting' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, type: String, description: 'Field to sort by (e.g. msgs, totalChats, contacts, calls.totalCalls, score, lastActive, otherPhotoCount, otherVideoCount, relationships.score)' })
  @ApiQuery({ name: 'sortOrder', required: false, type: String, description: 'Sort order: asc or desc (default: desc)' })
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
  @ApiParam({ name: 'mobile' })
  async getUserRelationships(@Param('mobile') mobile: string) {
    return this.usersService.getUserRelationships(mobile);
  }

  @Post('recompute-score/:mobile')
  @ApiOperation({ summary: 'Recompute relationship score (live Telegram connection)' })
  @ApiParam({ name: 'mobile' })
  async recomputeScore(@Param('mobile') mobile: string) {
    await this.usersService.computeRelationshipScore(mobile);
    return this.usersService.getUserRelationships(mobile);
  }

  @Get(':tgId')
  @ApiOperation({ summary: 'Get user by tgId' })
  @ApiParam({ name: 'tgId' })
  async findOne(@Param('tgId') tgId: string) {
    return this.usersService.findOne(tgId);
  }

  @Patch(':tgId')
  @ApiOperation({ summary: 'Update user by tgId' })
  @ApiParam({ name: 'tgId' })
  async update(@Param('tgId') tgId: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(tgId, updateUserDto);
  }

  @Patch(':tgId/expire')
  @ApiOperation({ summary: 'Mark user as expired (soft delete)' })
  @ApiParam({ name: 'tgId' })
  async expire(@Param('tgId') tgId: string) {
    return this.usersService.delete(tgId);
  }

  @Post('query')
  @ApiOperation({ summary: 'Execute custom MongoDB query' })
  async executeQuery(@Body() requestBody: any): Promise<any> {
    const { query, sort, limit, skip } = requestBody;
    return this.usersService.executeQuery(query, sort, limit, skip);
  }
}
