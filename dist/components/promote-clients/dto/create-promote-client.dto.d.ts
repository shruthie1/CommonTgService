import { ClientStatusType } from '../../shared/base-client.service';
export declare class CreatePromoteClientDto {
    readonly tgId: string;
    readonly mobile: string;
    readonly availableDate: string;
    readonly lastActive: string;
    readonly channels: number;
    readonly clientId?: string;
    readonly status?: ClientStatusType;
    message?: string;
    readonly lastUsed?: Date;
    readonly session?: string;
}
