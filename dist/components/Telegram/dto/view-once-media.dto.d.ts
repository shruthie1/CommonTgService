export declare enum MediaSourceType {
    PATH = "path",
    BASE64 = "base64",
    BINARY = "binary"
}
export declare class ViewOnceMediaDto {
    chatId: string;
    sourceType: MediaSourceType;
    path?: string;
    base64Data?: string;
    binaryData?: any;
    caption?: string;
    filename?: string;
}
