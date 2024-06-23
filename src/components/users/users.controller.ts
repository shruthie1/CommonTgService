import { Controller, Get, Post, Body, Param, Patch, Delete, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './schemas/user.schema';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { SearchUserDto } from './dto/search-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiTags('Telegram Users') // Tag to categorize all endpoints in this controller
@Controller('user')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  async create(@Body() createUserDto: User) {
    console.log("creating new user")
    return this.usersService.create(createUserDto);
  }

  @Get('/search')
  @ApiOperation({ summary: 'Search users based on various parameters' })
  async search(@Query() queryParams: SearchUserDto): Promise<User[]> {
    return this.usersService.search(queryParams);
  }

  @Get()
  @ApiOperation({ summary: 'Get all users' })
  async findAll() {
    return this.usersService.findAll();
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
  //@apiresponse({ status: 200, description: 'Query executed successfully.' })
  //@apiresponse({ status: 400, description: 'Invalid query.' })
  //@apiresponse({ status: 500, description: 'Internal server error.' })
  async executeQuery(@Body() query: any): Promise<any> {
    try {
      return await this.usersService.executeQuery(query);
    } catch (error) {
      throw error;  // You might want to handle errors more gracefully
    }
  }

}
