import { Controller, Get, Post, Body, Param, Delete, Query, Patch, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam, ApiBody } from '@nestjs/swagger';
import { UserDataService } from './user-data.service';
import { CreateUserDataDto } from './dto/create-user-data.dto';
import { UserData } from './schemas/user-data.schema';
import { SearchDto } from './dto/search-user-data.dto';
import { UpdateUserDataDto } from './dto/update-user-data.dto';
import { NoCache } from 'src/decorators';
import { CloudflareCacheInterceptor } from '../../interceptors';

@ApiTags('UserData of TG clients')
@Controller('userData')
export class UserDataController {
  constructor(private readonly userDataService: UserDataService) { }

  @Post()
  @ApiOperation({ summary: 'Create user data', description: 'Creates a new user data entry in the database.' })
  @ApiBody({ type: CreateUserDataDto, description: 'User data to create' })
  @ApiResponse({ status: 201, description: 'User data successfully created.', type: UserData })
  @ApiResponse({ status: 400, description: 'Invalid input data.' })
  async create(@Body() createUserDataDto: CreateUserDataDto): Promise<UserData> {
    return this.userDataService.create(createUserDataDto);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search user data', description: 'Searches user data based on provided query parameters.' })
  @ApiQuery({ name: 'profile', required: false, description: 'User profile identifier', type: String, example: 'user123' })
  @ApiQuery({ name: 'chatId', required: false, description: 'Chat ID associated with the user', type: String, example: 'chat456' })
  @ApiQuery({ name: 'isTesting', required: false, description: 'Filter for testing users', type: Boolean, example: true })
  @ApiQuery({ name: 'banned', required: false, description: 'Filter for banned users', type: Boolean, example: false })
  @ApiResponse({ status: 200, description: 'List of matching user data.', type: [UserData] })
  @ApiResponse({ status: 400, description: 'Invalid query parameters.' })
  async search(@Query() query: SearchDto): Promise<UserData[]> {
    return this.userDataService.search(query);
  }

  @Get()
  @ApiOperation({ summary: 'Get all user data', description: 'Retrieves all user data entries from the database.' })
  @ApiResponse({ status: 200, description: 'List of all user data.', type: [UserData] })
  async findAll(): Promise<UserData[]> {
    return this.userDataService.findAll();
  }

  @Patch('updateAll/:chatId')
  @ApiOperation({ summary: 'Update all user data by chat ID', description: 'Updates all user data entries associated with a specific chat ID.' })
  @ApiParam({ name: 'chatId', description: 'Chat ID to update user data for', type: String, example: 'chat456' })
  @ApiBody({ type: UpdateUserDataDto, description: 'User data fields to update' })
  @ApiResponse({ status: 200, description: 'User data successfully updated.', type: Object })
  @ApiResponse({ status: 400, description: 'Invalid input data.' })
  @ApiResponse({ status: 404, description: 'No user data found for the given chat ID.' })
  async updateAll(@Param('chatId') chatId: string, @Body() updateUserDataDto: UpdateUserDataDto): Promise<any> {
    return this.userDataService.updateAll(chatId, updateUserDataDto);
  }

  @Get(':profile/:chatId')
  @ApiOperation({ summary: 'Get user data by profile and chat ID', description: 'Retrieves a specific user data entry by profile and chat ID.' })
  @ApiParam({ name: 'profile', description: 'User profile identifier', type: String, example: 'user123' })
  @ApiParam({ name: 'chatId', description: 'Chat ID associated with the user', type: String, example: 'chat456' })
  @ApiResponse({ status: 200, description: 'User data found.', type: UserData })
  @ApiResponse({ status: 404, description: 'User data not found.' })
  async findOne(@Param('profile') profile: string, @Param('chatId') chatId: string): Promise<UserData> {
    return this.userDataService.findOne(profile, chatId);
  }

  @Patch(':profile/:chatId')
  @ApiOperation({ summary: 'Update user data by profile and chat ID', description: 'Updates a specific user data entry identified by profile and chat ID.' })
  @ApiParam({ name: 'profile', description: 'User profile identifier', type: String, example: 'user123' })
  @ApiParam({ name: 'chatId', description: 'Chat ID associated with the user', type: String, example: 'chat456' })
  @ApiBody({ type: UpdateUserDataDto, description: 'User data fields to update' })
  @ApiResponse({ status: 200, description: 'User data successfully updated.', type: UserData })
  @ApiResponse({ status: 400, description: 'Invalid input data.' })
  @ApiResponse({ status: 404, description: 'User data not found.' })
  async update(@Param('profile') profile: string, @Param('chatId') chatId: string, @Body() updateUserDataDto: UpdateUserDataDto): Promise<UserData> {
    return this.userDataService.update(profile, chatId, updateUserDataDto);
  }

  @Delete(':profile/:chatId')
  @ApiOperation({ summary: 'Delete user data by profile and chat ID', description: 'Deletes a specific user data entry identified by profile and chat ID.' })
  @ApiParam({ name: 'profile', description: 'User profile identifier', type: String, example: 'user123' })
  @ApiParam({ name: 'chatId', description: 'Chat ID associated with the user', type: String, example: 'chat456' })
  @ApiResponse({ status: 200, description: 'User data successfully deleted.', type: UserData })
  @ApiResponse({ status: 404, description: 'User data not found.' })
  async remove(@Param('profile') profile: string, @Param('chatId') chatId: string): Promise<UserData> {
    return this.userDataService.remove(profile, chatId);
  }

  @Get('clear-count')
  @UseInterceptors(CloudflareCacheInterceptor)
  @NoCache()
  @ApiOperation({ summary: 'Clear count for user data', description: 'Clears the count for user data, optionally filtered by chat ID.' })
  @ApiQuery({ name: 'chatId', required: false, description: 'Chat ID to clear count for', type: String, example: 'chat456' })
  @ApiResponse({ status: 200, description: 'Count cleared successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid chat ID.' })
  clearCount(@Query('chatId') chatId?: string) {
    return this.userDataService.clearCount(chatId);
  }

  @Post('query')
  @ApiOperation({ summary: 'Execute a custom MongoDB query', description: 'Executes a custom MongoDB query with optional sorting, limiting, and skipping.' })
  @ApiBody({
    description: 'MongoDB query parameters',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'object', description: 'MongoDB query object', example: { profile: 'user123' } },
        sort: { type: 'object', description: 'Sort criteria', example: { createdAt: -1 } },
        limit: { type: 'number', description: 'Maximum number of results', example: 10 },
        skip: { type: 'number', description: 'Number of results to skip', example: 0 }
      }
    }
  })
  @ApiResponse({ status: 200, description: 'Query executed successfully.', type: Object })
  @ApiResponse({ status: 400, description: 'Invalid query parameters.' })
  async executeQuery(@Body() requestBody: any): Promise<any> {
    try {
      const { query, sort, limit, skip } = requestBody;
      return await this.userDataService.executeQuery(query, sort, limit, skip);
    } catch (error) {
      throw error;
    }
  }
}