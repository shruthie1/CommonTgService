export declare enum ArrayOperationType {
    PUSH = "PUSH",
    POP = "POP",
    INSERT = "INSERT",
    REMOVE = "REMOVE",
    UPDATE = "UPDATE"
}
export declare class ArrayOperation {
    type: ArrayOperationType;
    index?: number;
}
export declare class UpdateDynamicDataDto {
    readonly path: string;
    readonly value: any;
    readonly arrayOperation?: ArrayOperation;
}
