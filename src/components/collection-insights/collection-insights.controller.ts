import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CollectionAnalyticsQueryDto, CollectionQueryDto } from './dto/collection-query.dto';
import { CollectionInsightsService } from './collection-insights.service';

@ApiTags('Collections')
@Controller('collections')
export class CollectionInsightsController {
    constructor(private readonly collectionInsightsService: CollectionInsightsService) {}

    @Get()
    @ApiOperation({ summary: 'List Mongo collections available for read/analytics endpoints' })
    @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
    listCollections() {
        return this.collectionInsightsService.listCollections();
    }

    @Get(':collection')
    @ApiOperation({ summary: 'Read documents from a collection' })
    @ApiParam({ name: 'collection' })
    @ApiQuery({ name: 'filter', required: false, description: 'JSON object filter' })
    @ApiQuery({ name: 'projection', required: false, description: 'JSON object projection' })
    @ApiQuery({ name: 'sort', required: false, description: 'JSON object sort' })
    @ApiQuery({ name: 'sortBy', required: false })
    @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'skip', required: false, type: Number })
    @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
    readCollection(@Param('collection') collection: string, @Query() query: CollectionQueryDto) {
        return this.collectionInsightsService.readCollection(collection, query);
    }

    @Post(':collection/query')
    @ApiOperation({ summary: 'Read documents from a collection with a JSON request body' })
    @ApiParam({ name: 'collection' })
    @ApiBody({ type: CollectionQueryDto })
    @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
    queryCollection(@Param('collection') collection: string, @Body() body: CollectionQueryDto = {}) {
        return this.collectionInsightsService.readCollection(collection, body);
    }

    @Get(':collection/stats')
    @ApiOperation({ summary: 'Get collection storage/index/count stats' })
    @ApiParam({ name: 'collection' })
    @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
    getStats(@Param('collection') collection: string) {
        return this.collectionInsightsService.getCollectionStats(collection);
    }

    @Get(':collection/analytics')
    @ApiOperation({ summary: 'Get generic field coverage/type/numeric analytics for a collection sample' })
    @ApiParam({ name: 'collection' })
    @ApiQuery({ name: 'sampleSize', required: false, type: Number })
    @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
    getAnalytics(@Param('collection') collection: string, @Query() query: CollectionAnalyticsQueryDto) {
        return this.collectionInsightsService.getCollectionAnalytics(collection, query.sampleSize);
    }
}
