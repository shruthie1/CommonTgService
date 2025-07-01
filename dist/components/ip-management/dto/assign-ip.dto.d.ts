export declare class AssignIpToMobileDto {
    mobile: string;
    clientId: string;
    preferredIp?: string;
}
export declare class BulkAssignIpDto {
    mobiles: string[];
    clientId: string;
}
export declare class ReleaseIpFromMobileDto {
    mobile: string;
}
