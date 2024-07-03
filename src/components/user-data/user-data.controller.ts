import { Controller, Get, Post, Body, Param, Delete, Query, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { UserDataService } from './user-data.service';
import { CreateUserDataDto } from './dto/create-user-data.dto';
import { UserData } from './schemas/user-data.schema';
import { SearchDto } from './dto/search-user-data.dto';
import { UpdateUserDataDto } from './dto/update-user-data.dto';

@ApiTags('UserData of TG clients')
@Controller('userData')
export class UserDataController {
  constructor(private readonly userDataService: UserDataService) { }

  @Post()
  @ApiOperation({ summary: 'Create user data' })
  async create(@Body() createUserDataDto: CreateUserDataDto): Promise<UserData> {
    return this.userDataService.create(createUserDataDto);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search user data' })
  async search(@Query() query: SearchDto): Promise<UserData[]> {
    return this.userDataService.search(query);
  }

  @Get()
  @ApiOperation({ summary: 'Get all user data' })
  async findAll(): Promise<UserData[]> {
    return this.userDataService.findAll();
  }


  @Patch('updateAll/:chatId')
  @ApiOperation({ summary: 'Update user data by ID' })
  async updateAll(@Param('chatId') chatId: string, @Body() updateUserDataDto: UpdateUserDataDto): Promise<any> {
    return this.userDataService.updateAll(chatId, updateUserDataDto);
  }


  @Get(':profile/:chatId')
  @ApiOperation({ summary: 'Get user data by ID' })
  async findOne(@Param('profile') profile: string, @Param('chatId') chatId: string): Promise<UserData> {
    return this.userDataService.findOne(profile, chatId);
  }

  @Patch(':profile/:chatId')
  @ApiOperation({ summary: 'Update user data by ID' })
  async update(@Param('profile') profile: string, @Param('chatId') chatId: string, @Body() updateUserDataDto: UpdateUserDataDto): Promise<UserData> {
    return this.userDataService.update(profile, chatId, updateUserDataDto);
  }

  @Delete(':profile/:chatId')
  @ApiOperation({ summary: 'Delete user data by ID' })
  async remove(@Param('profile') profile: string, @Param('chatId') chatId: string): Promise<UserData> {
    return this.userDataService.remove(profile, chatId);
  }

  @Post('query')
  @ApiOperation({ summary: 'Execute a custom MongoDB query' })
  async executeQuery(@Body() requestBody: any): Promise<any> {
    try {
      const { query, sort, limit, skip } = requestBody;
      return await this.userDataService.executeQuery(query, sort, limit, skip);
    } catch (error) {
      throw error;
    }
  }
}
