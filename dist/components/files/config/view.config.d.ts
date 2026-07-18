export declare const VIEW_CONFIG: {
    IMAGE_TYPES: readonly ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "image/bmp"];
    PDF_TYPES: readonly ["application/pdf"];
    TEXT_TYPES: readonly ["text/plain", "text/html", "text/css", "text/javascript", "application/json", "application/xml"];
    AUDIO_TYPES: string[];
    VIDEO_TYPES: string[];
    PREVIEW_SIZE_LIMIT: number;
    THUMBNAIL_OPTIONS: {
        readonly width: 320;
        readonly height: 240;
        readonly quality: 85;
        readonly format: "jpeg";
        readonly fit: "contain";
        readonly background: {
            readonly r: 245;
            readonly g: 245;
            readonly b: 245;
            readonly alpha: 1;
        };
    };
    DEFAULT_THUMBNAILS: {
        video: string;
        audio: string;
    };
    VIDEO_PREVIEW: {
        thumbnailTime: string;
        width: number;
        height: number;
    };
    AUDIO_PREVIEW: {
        duration: boolean;
        metadata: boolean;
        waveform: boolean;
    };
    VIDEO_THUMBNAIL: {
        timePosition: string;
        frameCount: number;
    };
    THUMBNAIL_STYLES: {
        background: {
            startColor: string;
            endColor: string;
        };
        text: {
            color: string;
            fontFamily: string;
            fontSize: {
                title: number;
                format: number;
            };
        };
        playButton: {
            size: number;
            color: string;
            background: string;
        };
    };
};
