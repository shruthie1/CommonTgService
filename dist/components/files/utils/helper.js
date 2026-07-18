"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeFileName = sanitizeFileName;
exports.getSafeFilePath = getSafeFilePath;
exports.getFileExtension = getFileExtension;
const path_1 = __importStar(require("path"));
const url_1 = require("url");
const mime = __importStar(require("mime-types"));
const VIDEO_ROOT = path_1.default.resolve(process.cwd(), 'videos');
function sanitizeFileName(name) {
    return (0, path_1.basename)(name, (0, path_1.extname)(name)).replace(/[^\w.\-]/g, '_');
}
function getSafeFilePath(filename) {
    const resolvedPath = (0, path_1.resolve)(VIDEO_ROOT, filename);
    return resolvedPath.startsWith(VIDEO_ROOT) ? resolvedPath : null;
}
function getFileExtension(contentType, url) {
    const extFromHeader = mime.extension(contentType);
    const extFromUrl = (0, path_1.extname)(new url_1.URL(url).pathname).split('?')[0];
    return extFromHeader || extFromUrl.replace('.', '') || 'mp4';
}
//# sourceMappingURL=helper.js.map