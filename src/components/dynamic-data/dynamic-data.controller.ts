import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { DynamicDataService } from './dynamic-data.service';
import { CreateDynamicDataDto } from './dto/create-dynamic-data.dto';
import { UpdateDynamicDataDto } from './dto/update-dynamic-data.dto';
import { GetDynamicDataDto } from './dto/get-dynamic-data.dto';

@ApiTags('dynamic-data')
@Controller('dynamic-data')
export class DynamicDataController {
  constructor(private readonly dynamicDataService: DynamicDataService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new dynamic data document' })
  @ApiResponse({
    status: 201,
    description: 'The dynamic data document has been successfully created.',
  })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 409, description: 'Conflict - Document already exists' })
  async create(@Body() createDynamicDataDto: CreateDynamicDataDto) {
    return this.dynamicDataService.create(createDynamicDataDto);
  }

  @Get(':configKey')
  @ApiOperation({ summary: 'Get dynamic data by configKey' })
  @ApiParam({ name: 'configKey', description: 'Unique identifier for the document' })
  @ApiQuery({
    name: 'path',
    required: false,
    description: 'Optional path to retrieve specific nested data',
  })
  @ApiResponse({ status: 200, description: 'Returns the requested dynamic data' })
  @ApiResponse({ status: 404, description: 'Document or path not found' })
  async findOne(
    @Param('configKey') configKey: string,
    @Query() { path }: GetDynamicDataDto,
  ) {
    return this.dynamicDataService.findOne(configKey, path);
  }

  @Patch(':configKey')
  @ApiOperation({ summary: 'Update dynamic data by configKey' })
  @ApiParam({ name: 'configKey', description: 'Unique identifier for the document' })
  @ApiResponse({ status: 200, description: 'The dynamic data has been successfully updated' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async update(
    @Param('configKey') configKey: string,
    @Body() updateDynamicDataDto: UpdateDynamicDataDto,
  ) {
    return this.dynamicDataService.update(configKey, updateDynamicDataDto);
  }

  @Delete(':configKey')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete dynamic data by configKey' })
  @ApiParam({ name: 'configKey', description: 'Unique identifier for the document' })
  @ApiQuery({
    name: 'path',
    required: false,
    description: 'Optional path to delete specific nested data',
  })
  @ApiResponse({ status: 204, description: 'The dynamic data has been successfully deleted' })
  @ApiResponse({ status: 404, description: 'Document or path not found' })
  async remove(
    @Param('configKey') configKey: string,
    @Query() { path }: GetDynamicDataDto,
  ) {
    await this.dynamicDataService.remove(configKey, path);
  }
}
