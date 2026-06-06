import { CollectionAnalyticsQueryDto, CollectionQueryDto } from './dto/collection-query.dto';
import { CollectionInsightsService } from './collection-insights.service';
export declare class CollectionInsightsController {
    private readonly collectionInsightsService;
    constructor(collectionInsightsService: CollectionInsightsService);
    listCollections(): Promise<{
        collections: {
            name: string;
            estimatedCount: number;
        }[];
    }>;
    readCollection(collection: string, query: CollectionQueryDto): Promise<{
        collection: string;
        filter: {
            [x: string]: unknown;
        };
        sort: {
            [x: string]: 1 | -1;
        };
        limit: number;
        skip: number;
        returned: number;
        documents: import("mongodb").WithId<import("bson").Document>[];
    }>;
    queryCollection(collection: string, body?: CollectionQueryDto): Promise<{
        collection: string;
        filter: {
            [x: string]: unknown;
        };
        sort: {
            [x: string]: 1 | -1;
        };
        limit: number;
        skip: number;
        returned: number;
        documents: import("mongodb").WithId<import("bson").Document>[];
    }>;
    getStats(collection: string): Promise<{
        collection: string;
        estimatedCount: number;
        indexes: any[] | import("mongodb").IndexDescriptionInfo[];
        storage: {
            count: any;
            size: any;
            avgObjSize: any;
            storageSize: any;
            totalIndexSize: any;
        };
    }>;
    getAnalytics(collection: string, query: CollectionAnalyticsQueryDto): Promise<{
        collection: string;
        estimatedCount: number;
        sampleSize: number;
        fields: {
            field: string;
            present: number;
            coverage: number;
            types: Record<string, number>;
            numeric: {
                count: number;
                min: number;
                max: number;
                avg: number;
            };
            boolean: {
                true: number;
                false: number;
            };
            array: {
                count: number;
                avgLength: number;
            };
        }[];
    }>;
}
