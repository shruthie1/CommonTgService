import { Controller, Get, Post, Body, Param, Delete, Query, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { UserDataService } from './user-data.service';
import { CreateUserDataDto } from './dto/create-user-data.dto';
import { UserData } from './schemas/user-data.schema';
import { SearchDto } from './dto/search-user-data.dto';

@ApiTags('UserData of TG clients')
@Controller('userData')
export class UserDataController {
  constructor(private readonly userDataService: UserDataService) {}

  @Post()
  @ApiOperation({ summary: 'Create user data' })
  //@apiresponse({ status: 201, description: 'The user data has been successfully created.' })
  //@apiresponse({ status: 403, description: 'Forbidden.' })
  async create(@Body() createUserDataDto: CreateUserDataDto): Promise<UserData> {
    return this.userDataService.create(createUserDataDto);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search user data' })
  //@apiresponse({ status: 200, description: 'Return the searched user data.' })

  async search(@Query() query: SearchDto): Promise<UserData[]> {
    return this.userDataService.search(query);
  }

  @Get()
  @ApiOperation({ summary: 'Get all user data' })
  //@apiresponse({ status: 200, description: 'Return all user data.' })
  //@apiresponse({ status: 403, description: 'Forbidden.' })
  async findAll(): Promise<UserData[]> {
    return this.userDataService.findAll();
  }

  @Get(':chatId')
  @ApiOperation({ summary: 'Get user data by ID' })
  //@apiresponse({ status: 200, description: 'Return the user data.' })
  //@apiresponse({ status: 404, description: 'User data not found.' })
  async findOne(@Param('chatId') chatId: string): Promise<UserData> {
    return this.userDataService.findOne(chatId);
  }

  @Patch(':chatId')
  @ApiOperation({ summary: 'Update user data by ID' })
  //@apiresponse({ status: 200, description: 'The user data has been successfully updated.' })
  //@apiresponse({ status: 404, description: 'User data not found.' })
  async update(@Param('chatId') chatId: string, @Body() updateUserDataDto: Partial<UserData>): Promise<UserData> {
    return this.userDataService.update(chatId, updateUserDataDto);
  }

  @Delete(':chatId')
  @ApiOperation({ summary: 'Delete user data by ID' })
  //@apiresponse({ status: 200, description: 'The user data has been successfully deleted.' })
  //@apiresponse({ status: 404, description: 'User data not found.' })
  async remove(@Param('chatId') chatId: string): Promise<UserData> {
    return this.userDataService.remove(chatId);
  }

  @Post('query')
  @ApiOperation({ summary: 'Execute a custom MongoDB query' })
  //@apiresponse({ status: 200, description: 'Query executed successfully.' })
  //@apiresponse({ status: 400, description: 'Invalid query.' })
  //@apiresponse({ status: 500, description: 'Internal server error.' })
  async executeQuery(@Body() query: any): Promise<any> {
    try {
      return await this.userDataService.executeQuery(query);
    } catch (error) {
      throw error;  // You might want to handle errors more gracefully
    }
  }
}
