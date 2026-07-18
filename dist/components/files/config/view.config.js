"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VIEW_CONFIG = void 0;
exports.VIEW_CONFIG = {
    IMAGE_TYPES: [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/svg+xml',
        'image/bmp',
    ],
    PDF_TYPES: ['application/pdf'],
    TEXT_TYPES: [
        'text/plain',
        'text/html',
        'text/css',
        'text/javascript',
        'application/json',
        'application/xml',
    ],
    AUDIO_TYPES: [
        'audio/mpeg',
        'audio/wav',
        'audio/ogg',
        'audio/mp3',
        'audio/aac',
        'audio/webm',
    ],
    VIDEO_TYPES: [
        'video/mp4',
        'video/mpeg',
        'video/webm',
        'video/quicktime',
        'video/x-msvideo',
        'video/x-matroska',
    ],
    PREVIEW_SIZE_LIMIT: 1024 * 1024 * 100,
    THUMBNAIL_OPTIONS: {
        width: 320,
        height: 240,
        quality: 85,
        format: 'jpeg',
        fit: 'contain',
        background: {
            r: 245,
            g: 245,
            b: 245,
            alpha: 1,
        },
    },
    DEFAULT_THUMBNAILS: {
        video: 'assets/video-thumbnail.png',
        audio: 'assets/audio-thumbnail.png',
    },
    VIDEO_PREVIEW: {
        thumbnailTime: '00:00:01',
        width: 320,
        height: 240,
    },
    AUDIO_PREVIEW: {
        duration: true,
        metadata: true,
        waveform: true,
    },
    VIDEO_THUMBNAIL: {
        timePosition: '00:00:01',
        frameCount: 1,
    },
    THUMBNAIL_STYLES: {
        background: {
            startColor: '#1a73e8',
            endColor: '#174ea6',
        },
        text: {
            color: '#ffffff',
            fontFamily: 'Arial',
            fontSize: {
                title: 12,
                format: 11,
            },
        },
        playButton: {
            size: 40,
            color: '#1a73e8',
            background: '#ffffff',
        },
    },
};
//# sourceMappingURL=view.config.js.map