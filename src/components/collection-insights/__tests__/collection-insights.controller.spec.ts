import { CollectionInsightsController } from '../collection-insights.controller';

describe('CollectionInsightsController', () => {
    const svc = {
        listCollections: jest.fn(),
        readCollection: jest.fn(),
        getCollectionStats: jest.fn(),
        getCollectionAnalytics: jest.fn(),
    };
    const controller = new CollectionInsightsController(svc as any);

    afterEach(() => jest.clearAllMocks());

    test('listCollections delegates', () => {
        svc.listCollections.mockReturnValue('list');
        expect(controller.listCollections()).toBe('list');
        expect(svc.listCollections).toHaveBeenCalled();
    });

    test('readCollection delegates with query', () => {
        svc.readCollection.mockReturnValue('read');
        const query = { filter: '{}' } as any;
        expect(controller.readCollection('userData', query)).toBe('read');
        expect(svc.readCollection).toHaveBeenCalledWith('userData', query);
    });

    test('queryCollection delegates with body', () => {
        svc.readCollection.mockReturnValue('query');
        const body = { sortBy: 'x' } as any;
        expect(controller.queryCollection('userData', body)).toBe('query');
        expect(svc.readCollection).toHaveBeenCalledWith('userData', body);
    });

    test('queryCollection defaults body to {}', () => {
        svc.readCollection.mockReturnValue('query');
        expect(controller.queryCollection('userData', undefined as any)).toBe('query');
        expect(svc.readCollection).toHaveBeenCalledWith('userData', {});
    });

    test('getStats delegates', () => {
        svc.getCollectionStats.mockReturnValue('stats');
        expect(controller.getStats('userData')).toBe('stats');
        expect(svc.getCollectionStats).toHaveBeenCalledWith('userData');
    });

    test('getAnalytics delegates with sampleSize', () => {
        svc.getCollectionAnalytics.mockReturnValue('analytics');
        expect(controller.getAnalytics('userData', { sampleSize: 100 } as any)).toBe('analytics');
        expect(svc.getCollectionAnalytics).toHaveBeenCalledWith('userData', 100);
    });
});
