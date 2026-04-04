import { Client } from '../schemas/client.schema';
export declare class PromoteMobileMatchDto {
    clientId: string;
    mobile: string;
}
export declare class PromoteMobileSearchResponseDto {
    clients: Client[];
    matches: PromoteMobileMatchDto[];
    searchedMobile: string;
}
export declare class EnhancedClientSearchResponseDto {
    clients: Client[];
    searchType: 'direct' | 'promoteMobile' | 'mixed';
    promoteMobileMatches?: PromoteMobileMatchDto[];
    totalResults: number;
}
