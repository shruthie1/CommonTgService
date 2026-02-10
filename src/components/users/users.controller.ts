import { Controller, Get, Post, Body, Param, Patch, Delete, Query, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './schemas/user.schema';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { SearchUserDto } from './dto/search-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';

@ApiTags('Telegram Users') // Tag to categorize all endpoints in this controller
@Controller('user')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  async create(@Body() createUserDto: CreateUserDto) {
    console.log("creating new user")
    return this.usersService.create(createUserDto);
  }

  @Get('/search')
  @ApiOperation({ summary: 'Search users based on various parameters' })
  async search(@Query() queryParams: SearchUserDto): Promise<User[]> {
    return this.usersService.search(queryParams);
  }

  @Get('top-interacted')
  @ApiOperation({ 
    summary: 'Get users with top interaction scores',
    description: 'Retrieves users ranked by interaction score calculated from saved DB stats. ' +
                 'Score is based on photos, videos, calls, and other interactions. ' +
                 'Movie count has negative weightage as it indicates less genuine interaction. ' +
                 'Supports filtering and pagination for efficient data retrieval.'
  })
  @ApiQuery({ 
    name: 'page', 
    required: false, 
    type: Number,
    description: 'Page number (default: 1, minimum: 1)',
    example: 1,
    minimum: 1
  })
  @ApiQuery({ 
    name: 'limit', 
    required: false, 
    type: Number,
    description: 'Number of results per page (default: 20, max: 100)',
    example: 20,
    minimum: 1,
    maximum: 100
  })
  @ApiQuery({ 
    name: 'minScore', 
    required: false, 
    type: Number,
    description: 'Minimum interaction score to include (default: 0)',
    example: 100,
    minimum: 0
  })
  @ApiQuery({ 
    name: 'minCalls', 
    required: false, 
    type: Number,
    description: 'Minimum total calls required (default: 0)',
    example: 5,
    minimum: 0
  })
  @ApiQuery({ 
    name: 'minPhotos', 
    required: false, 
    type: Number,
    description: 'Minimum photos required (default: 0)',
    example: 10,
    minimum: 0
  })
  @ApiQuery({ 
    name: 'minVideos', 
    required: false, 
    type: Number,
    description: 'Minimum videos required (default: 0)',
    example: 5,
    minimum: 0
  })
  @ApiQuery({
    name: 'excludeTwoFA', 
    required: false, 
    type: Boolean,
    description: 'Exclude users with 2FA enabled (default: false)',
    example: false
  })
  @ApiQuery({
    name: 'excludeAudited',
    required: false,
    type: Boolean,
    description: 'Exclude users whose mobile is in session_audits (default: false). Set true to show only non-audited.',
    example: false
  })
  @ApiQuery({ 
    name: 'gender', 
    required: false, 
    type: String,
    description: 'Filter by gender',
    example: 'male'
  })
  @ApiResponse({ 
    status: 200,
    description: 'Users retrieved successfully with interaction scores',
    schema: {
      type: 'object',
      properties: {
        users: {
          type: 'array',
          description: 'List of users with interaction scores',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'User ID' },
              mobile: { type: 'string' },
              tgId: { type: 'string' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              username: { type: 'string' },
              photoCount: { type: 'number' },
              videoCount: { type: 'number' },
              ownPhotoCount: { type: 'number' },
              ownVideoCount: { type: 'number' },
              otherPhotoCount: { type: 'number' },
              otherVideoCount: { type: 'number' },
              movieCount: { type: 'number', description: 'Has negative impact on score' },
              calls: {
                type: 'object',
                properties: {
                  outgoing: { type: 'number' },
                  incoming: { type: 'number' },
                  video: { type: 'number' },
                  totalCalls: { type: 'number' }
                }
              },
              interactionScore: { 
                type: 'number', 
                description: 'Calculated interaction score (higher = more active/engaged)'
              }
            }
          }
        },
        total: { type: 'number', description: 'Total number of users matching filters' },
        page: { type: 'number', description: 'Current page number' },
        limit: { type: 'number', description: 'Results per page' },
        totalPages: { type: 'number', description: 'Total number of pages' }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Bad Request - invalid query parameters' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })
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
    // Parse and validate query parameters
    const pageNum = page ? parseInt(page, 10) : undefined;
    const limitNum = limit ? parseInt(limit, 10) : undefined;
    const minScoreNum = minScore ? parseFloat(minScore) : undefined;
    const minCallsNum = minCalls ? parseInt(minCalls, 10) : undefined;
    const minPhotosNum = minPhotos ? parseInt(minPhotos, 10) : undefined;
    const minVideosNum = minVideos ? parseInt(minVideos, 10) : undefined;

    // Validate numeric parameters
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

    // return this.usersService.getTopInteractionUsers({
    //   page: pageNum,
    //   limit: limitNum,
    //   minScore: minScoreNum,
    //   minCalls: minCallsNum,
    //   minPhotos: minPhotosNum,
    //   minVideos: minVideosNum,
    //   excludeTwoFA: excludeTwoFABool,
    //   excludeAudited: excludeAuditedBool,
    //   gender,
    // });
  }

  @Get()
  @ApiOperation({ summary: 'Get all users' })
  @ApiQuery({ 
    name: 'limit', 
    required: false, 
    type: Number,
    description: 'Number of results to return (default: 100)',
    example: 100
  })
  @ApiQuery({ 
    name: 'skip', 
    required: false, 
    type: Number,
    description: 'Number of results to skip (default: 0)',
    example: 0
  })
  async findAll(
    @Query('limit') limit?: string,
    @Query('skip') skip?: string
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 100;
    const skipNum = skip ? parseInt(skip, 10) : 0;
    
    if (isNaN(limitNum) || limitNum < 1) {
      throw new BadRequestException('Limit must be a positive integer');
    }
    if (isNaN(skipNum) || skipNum < 0) {
      throw new BadRequestException('Skip must be a non-negative integer');
    }
    
    return this.usersService.findAll(limitNum, skipNum);
  }

  @Get(':tgId')
  @ApiOperation({ summary: 'Get a user by tgId' })
  @ApiParam({ name: 'tgId', description: 'The Telegram ID of the user', type: String })
  async findOne(@Param('tgId') tgId: string) {
    return this.usersService.findOne(tgId);
  }

  @Patch(':tgId')
  @ApiOperation({ summary: 'Update a user by tgId' })
  @ApiParam({ name: 'tgId', description: 'The Telegram ID of the user', type: String })
  async update(@Param('tgId') tgId: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(tgId, updateUserDto);
  }

  @Delete(':tgId')
  @ApiOperation({ summary: 'Delete a user by tgId' })
  @ApiParam({ name: 'tgId', description: 'The Telegram ID of the user', type: String })
  async remove(@Param('tgId') tgId: string) {
    return this.usersService.delete(tgId);
  }

  @Post('query')
  @ApiOperation({ summary: 'Execute a custom MongoDB query' })
  async executeQuery(@Body() requestBody: any): Promise<any> {
    const { query, sort, limit, skip } = requestBody;
    try {
      return await this.usersService.executeQuery(query, sort, limit, skip);
    } catch (error) {
      throw error;  // You might want to handle errors more gracefully
    }
  }


}
