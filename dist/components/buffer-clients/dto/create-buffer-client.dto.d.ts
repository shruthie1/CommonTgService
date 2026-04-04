import { ClientStatusType } from '../../shared/base-client.service';
export declare class CreateBufferClientDto {
    readonly tgId: string;
    readonly mobile: string;
    readonly availableDate: string;
    readonly session: string;
    readonly channels: number;
    readonly clientId: string;
    readonly status?: ClientStatusType;
    message?: string;
    readonly lastUsed?: Date;
}
