import { ClientStatusType } from '../../shared/base-client.service';
export declare class SearchPromoteClientDto {
    readonly tgId?: string;
    readonly mobile?: string;
    readonly clientId?: string;
    readonly status?: ClientStatusType;
    readonly availableDate?: string;
    readonly channels?: number;
}
