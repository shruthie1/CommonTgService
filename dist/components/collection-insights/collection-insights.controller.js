"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CollectionInsightsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const collection_query_dto_1 = require("./dto/collection-query.dto");
const collection_insights_service_1 = require("./collection-insights.service");
let CollectionInsightsController = class CollectionInsightsController {
    constructor(collectionInsightsService) {
        this.collectionInsightsService = collectionInsightsService;
    }
    listCollections() {
        return this.collectionInsightsService.listCollections();
    }
    readCollection(collection, query) {
        return this.collectionInsightsService.readCollection(collection, query);
    }
    queryCollection(collection, body = {}) {
        return this.collectionInsightsService.readCollection(collection, body);
    }
    getStats(collection) {
        return this.collectionInsightsService.getCollectionStats(collection);
    }
    getAnalytics(collection, query) {
        return this.collectionInsightsService.getCollectionAnalytics(collection, query.sampleSize);
    }
};
exports.CollectionInsightsController = CollectionInsightsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List Mongo collections available for read/analytics endpoints' }),
    (0, swagger_1.ApiOkResponse)({ schema: { type: 'object', additionalProperties: true } }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CollectionInsightsController.prototype, "listCollections", null);
__decorate([
    (0, common_1.Get)(':collection'),
    (0, swagger_1.ApiOperation)({ summary: 'Read documents from a collection' }),
    (0, swagger_1.ApiParam)({ name: 'collection' }),
    (0, swagger_1.ApiQuery)({ name: 'filter', required: false, description: 'JSON object filter' }),
    (0, swagger_1.ApiQuery)({ name: 'projection', required: false, description: 'JSON object projection' }),
    (0, swagger_1.ApiQuery)({ name: 'sort', required: false, description: 'JSON object sort' }),
    (0, swagger_1.ApiQuery)({ name: 'sortBy', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'skip', required: false, type: Number }),
    (0, swagger_1.ApiOkResponse)({ schema: { type: 'object', additionalProperties: true } }),
    __param(0, (0, common_1.Param)('collection')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, collection_query_dto_1.CollectionQueryDto]),
    __metadata("design:returntype", void 0)
], CollectionInsightsController.prototype, "readCollection", null);
__decorate([
    (0, common_1.Post)(':collection/query'),
    (0, swagger_1.ApiOperation)({ summary: 'Read documents from a collection with a JSON request body' }),
    (0, swagger_1.ApiParam)({ name: 'collection' }),
    (0, swagger_1.ApiBody)({ type: collection_query_dto_1.CollectionQueryDto }),
    (0, swagger_1.ApiOkResponse)({ schema: { type: 'object', additionalProperties: true } }),
    __param(0, (0, common_1.Param)('collection')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, collection_query_dto_1.CollectionQueryDto]),
    __metadata("design:returntype", void 0)
], CollectionInsightsController.prototype, "queryCollection", null);
__decorate([
    (0, common_1.Get)(':collection/stats'),
    (0, swagger_1.ApiOperation)({ summary: 'Get collection storage/index/count stats' }),
    (0, swagger_1.ApiParam)({ name: 'collection' }),
    (0, swagger_1.ApiOkResponse)({ schema: { type: 'object', additionalProperties: true } }),
    __param(0, (0, common_1.Param)('collection')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CollectionInsightsController.prototype, "getStats", null);
__decorate([
    (0, common_1.Get)(':collection/analytics'),
    (0, swagger_1.ApiOperation)({ summary: 'Get generic field coverage/type/numeric analytics for a collection sample' }),
    (0, swagger_1.ApiParam)({ name: 'collection' }),
    (0, swagger_1.ApiQuery)({ name: 'sampleSize', required: false, type: Number }),
    (0, swagger_1.ApiOkResponse)({ schema: { type: 'object', additionalProperties: true } }),
    __param(0, (0, common_1.Param)('collection')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, collection_query_dto_1.CollectionAnalyticsQueryDto]),
    __metadata("design:returntype", void 0)
], CollectionInsightsController.prototype, "getAnalytics", null);
exports.CollectionInsightsController = CollectionInsightsController = __decorate([
    (0, swagger_1.ApiTags)('Collections'),
    (0, common_1.Controller)('collections'),
    __metadata("design:paramtypes", [collection_insights_service_1.CollectionInsightsService])
], CollectionInsightsController);
//# sourceMappingURL=collection-insights.controller.js.map