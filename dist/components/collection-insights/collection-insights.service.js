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
exports.CollectionInsightsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const DEFAULT_ANALYTICS_SAMPLE_SIZE = 500;
const MAX_ANALYTICS_SAMPLE_SIZE = 1000;
const SAFE_OPERATORS = new Set([
    '$and',
    '$or',
    '$nor',
    '$eq',
    '$ne',
    '$gt',
    '$gte',
    '$lt',
    '$lte',
    '$in',
    '$nin',
    '$exists',
    '$regex',
    '$options',
    '$elemMatch',
]);
let CollectionInsightsService = class CollectionInsightsService {
    constructor(connection) {
        this.connection = connection;
    }
    async listCollections() {
        const names = await this.getCollectionNames();
        const collections = await Promise.all(names.map(async (name) => ({
            name,
            estimatedCount: await this.safeEstimatedCount(name),
        })));
        return { collections };
    }
    async readCollection(collectionName, options = {}) {
        const collection = await this.getCollection(collectionName);
        const filter = this.normalizeFilter(options.filter);
        const projection = this.normalizeProjection(options.projection);
        const sort = this.normalizeSort(options.sort, options.sortBy, options.sortOrder);
        const limit = this.normalizePositiveInt(options.limit, DEFAULT_LIMIT, MAX_LIMIT);
        const skip = this.normalizeNonNegativeInt(options.skip, 0);
        const cursor = collection.find(filter, projection ? { projection } : undefined);
        if (Object.keys(sort).length > 0)
            cursor.sort(sort);
        if (skip > 0)
            cursor.skip(skip);
        cursor.limit(limit);
        const documents = await cursor.toArray();
        return {
            collection: collection.collectionName,
            filter,
            sort,
            limit,
            skip,
            returned: documents.length,
            documents,
        };
    }
    async getCollectionStats(collectionName) {
        const collection = await this.getCollection(collectionName);
        const [estimatedCount, indexes, collStats] = await Promise.all([
            this.safeEstimatedCount(collection.collectionName),
            collection.indexes().catch(() => []),
            this.safeCollStats(collection.collectionName),
        ]);
        return {
            collection: collection.collectionName,
            estimatedCount,
            indexes,
            storage: collStats ? {
                count: collStats.count,
                size: collStats.size,
                avgObjSize: collStats.avgObjSize,
                storageSize: collStats.storageSize,
                totalIndexSize: collStats.totalIndexSize,
            } : null,
        };
    }
    async getCollectionAnalytics(collectionName, sampleSizeInput) {
        const collection = await this.getCollection(collectionName);
        const sampleSize = this.normalizePositiveInt(sampleSizeInput, DEFAULT_ANALYTICS_SAMPLE_SIZE, MAX_ANALYTICS_SAMPLE_SIZE);
        const [estimatedCount, sample] = await Promise.all([
            this.safeEstimatedCount(collection.collectionName),
            collection.find({}).limit(sampleSize).toArray(),
        ]);
        return {
            collection: collection.collectionName,
            estimatedCount,
            sampleSize: sample.length,
            fields: this.computeFieldAnalytics(sample),
        };
    }
    async getCollection(collectionName) {
        const name = this.normalizeCollectionName(collectionName);
        const names = await this.getCollectionNames();
        if (!names.includes(name)) {
            throw new common_1.NotFoundException(`Collection "${name}" not found`);
        }
        return this.connection.db.collection(name);
    }
    async getCollectionNames() {
        if (!this.connection.db)
            throw new common_1.BadRequestException('MongoDB connection is not ready');
        const collections = await this.connection.db.listCollections({}, { nameOnly: true }).toArray();
        return collections
            .map((item) => item.name)
            .filter((name) => typeof name === 'string' && name.length > 0 && !name.startsWith('system.'))
            .sort((a, b) => a.localeCompare(b));
    }
    normalizeCollectionName(input) {
        const name = String(input || '').trim();
        if (!/^[A-Za-z0-9_.-]+$/.test(name) || name.startsWith('system.')) {
            throw new common_1.BadRequestException('Invalid collection name');
        }
        return name;
    }
    normalizeFilter(input) {
        const filter = this.parseObject(input, 'filter');
        this.assertSafeQueryObject(filter);
        return filter;
    }
    normalizeProjection(input) {
        const projection = this.parseObject(input, 'projection');
        if (Object.keys(projection).length === 0)
            return null;
        for (const [key, value] of Object.entries(projection)) {
            this.assertSafeFieldName(key, 'projection');
            if (![0, 1, true, false].includes(value)) {
                throw new common_1.BadRequestException('projection values must be 0, 1, true, or false');
            }
        }
        return projection;
    }
    normalizeSort(sortInput, sortByInput, sortOrderInput) {
        const sort = this.parseObject(sortInput, 'sort');
        if (Object.keys(sort).length > 0) {
            const normalized = {};
            for (const [key, value] of Object.entries(sort)) {
                this.assertSafeFieldName(key, 'sort');
                normalized[key] = value === -1 || value === 'desc' ? -1 : 1;
            }
            return normalized;
        }
        if (sortByInput === undefined || sortByInput === null || String(sortByInput).trim() === '')
            return {};
        const sortBy = String(sortByInput).trim();
        this.assertSafeFieldName(sortBy, 'sortBy');
        return { [sortBy]: sortOrderInput === 'asc' ? 1 : -1 };
    }
    parseObject(input, field) {
        if (input === undefined || input === null || input === '')
            return {};
        if (typeof input === 'string') {
            try {
                const parsed = JSON.parse(input);
                if (this.isPlainObject(parsed))
                    return parsed;
            }
            catch {
                throw new common_1.BadRequestException(`${field} must be valid JSON`);
            }
            throw new common_1.BadRequestException(`${field} must be an object`);
        }
        if (this.isPlainObject(input))
            return input;
        throw new common_1.BadRequestException(`${field} must be an object`);
    }
    assertSafeQueryObject(input) {
        if (Array.isArray(input)) {
            input.forEach((item) => this.assertSafeQueryObject(item));
            return;
        }
        if (!this.isPlainObject(input))
            return;
        for (const [key, value] of Object.entries(input)) {
            if (key.startsWith('$') && !SAFE_OPERATORS.has(key)) {
                throw new common_1.BadRequestException(`Unsupported query operator: ${key}`);
            }
            if (!key.startsWith('$')) {
                this.assertSafeFieldName(key, 'filter');
            }
            this.assertSafeQueryObject(value);
        }
    }
    assertSafeFieldName(field, context) {
        if (!field || field.includes('\0') || field.includes('$') || !/^[A-Za-z0-9_.-]+$/.test(field)) {
            throw new common_1.BadRequestException(`Invalid ${context} field: ${field}`);
        }
    }
    normalizePositiveInt(input, fallback, max) {
        const parsed = Number(input);
        if (!Number.isFinite(parsed) || parsed <= 0)
            return fallback;
        return Math.min(Math.floor(parsed), max);
    }
    normalizeNonNegativeInt(input, fallback) {
        const parsed = Number(input);
        if (!Number.isFinite(parsed) || parsed < 0)
            return fallback;
        return Math.floor(parsed);
    }
    async safeEstimatedCount(collectionName) {
        try {
            return await this.connection.db.collection(collectionName).estimatedDocumentCount();
        }
        catch {
            return null;
        }
    }
    async safeCollStats(collectionName) {
        try {
            return await this.connection.db.command({ collStats: collectionName });
        }
        catch {
            return null;
        }
    }
    computeFieldAnalytics(documents) {
        const fields = new Map();
        for (const document of documents) {
            const flattened = this.flattenDocument(document);
            for (const [field, value] of Object.entries(flattened)) {
                if (field === '_id')
                    continue;
                const stats = fields.get(field) ?? this.createEmptyFieldStats(field);
                fields.set(field, stats);
                stats.present += 1;
                const type = this.valueType(value);
                stats.types[type] = (stats.types[type] ?? 0) + 1;
                if (typeof value === 'number' && Number.isFinite(value)) {
                    stats.numeric.count += 1;
                    stats.numeric.min = stats.numeric.min === null ? value : Math.min(stats.numeric.min, value);
                    stats.numeric.max = stats.numeric.max === null ? value : Math.max(stats.numeric.max, value);
                    stats.numeric.sum += value;
                }
                else if (typeof value === 'boolean') {
                    if (value)
                        stats.boolean.true += 1;
                    else
                        stats.boolean.false += 1;
                }
                else if (Array.isArray(value)) {
                    stats.array.count += 1;
                    stats.array.totalLength += value.length;
                }
            }
        }
        return Array.from(fields.values())
            .map((stats) => ({
            field: stats.field,
            present: stats.present,
            coverage: documents.length > 0 ? stats.present / documents.length : 0,
            types: stats.types,
            numeric: stats.numeric.count > 0 ? {
                count: stats.numeric.count,
                min: stats.numeric.min,
                max: stats.numeric.max,
                avg: stats.numeric.sum / stats.numeric.count,
            } : undefined,
            boolean: stats.boolean.true + stats.boolean.false > 0 ? stats.boolean : undefined,
            array: stats.array.count > 0 ? {
                count: stats.array.count,
                avgLength: stats.array.totalLength / stats.array.count,
            } : undefined,
        }))
            .sort((a, b) => b.present - a.present || a.field.localeCompare(b.field));
    }
    createEmptyFieldStats(field) {
        return {
            field,
            present: 0,
            types: {},
            numeric: { count: 0, min: null, max: null, sum: 0 },
            boolean: { true: 0, false: 0 },
            array: { count: 0, totalLength: 0 },
        };
    }
    flattenDocument(document, prefix = '', output = {}) {
        for (const [key, value] of Object.entries(document)) {
            const path = prefix ? `${prefix}.${key}` : key;
            if (this.isPlainObject(value) && !(value instanceof Date)) {
                this.flattenDocument(value, path, output);
            }
            else {
                output[path] = value;
            }
        }
        return output;
    }
    valueType(value) {
        if (value === null)
            return 'null';
        if (Array.isArray(value))
            return 'array';
        if (value instanceof Date)
            return 'date';
        return typeof value;
    }
    isPlainObject(input) {
        return input !== null && typeof input === 'object' && !Array.isArray(input) && !(input instanceof Date);
    }
};
exports.CollectionInsightsService = CollectionInsightsService;
exports.CollectionInsightsService = CollectionInsightsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectConnection)()),
    __metadata("design:paramtypes", [mongoose_2.Connection])
], CollectionInsightsService);
//# sourceMappingURL=collection-insights.service.js.map