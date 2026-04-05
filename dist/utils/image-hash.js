"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AHASH_MATCH_THRESHOLD = void 0;
exports.computeAHash = computeAHash;
exports.hammingDistance = hammingDistance;
const sharp_1 = __importDefault(require("sharp"));
exports.AHASH_MATCH_THRESHOLD = 10;
async function computeAHash(imageBuffer) {
    const { data } = await (0, sharp_1.default)(imageBuffer)
        .resize(8, 8, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const pixels = Array.from(data);
    const mean = pixels.reduce((sum, v) => sum + v, 0) / pixels.length;
    return pixels.map((v) => (v >= mean ? '1' : '0')).join('');
}
function hammingDistance(a, b) {
    let distance = 0;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i])
            distance++;
    }
    return distance;
}
//# sourceMappingURL=image-hash.js.map