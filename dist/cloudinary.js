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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloudinaryService = void 0;
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
const adm_zip_1 = __importDefault(require("adm-zip"));
const fetchWithTimeout_1 = require("./utils/fetchWithTimeout");
class CloudinaryService {
    static async getInstance(_name) {
        if (!CloudinaryService.instance) {
            CloudinaryService.instance = new CloudinaryService();
        }
        return CloudinaryService.instance;
    }
    async downloadAndExtractZip(url) {
        const unique = `${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
        const extractPath = path.join(os.tmpdir(), `cloudinary-extract-${unique}`);
        const zipPath = path.join(os.tmpdir(), `cloudinary-${unique}.zip`);
        console.log(`Starting download of zip file from ${url}`);
        const response = await (0, fetchWithTimeout_1.fetchWithTimeout)(url, { responseType: 'arraybuffer' });
        if (response?.status === 200) {
            console.log('Zip file downloaded successfully.');
            fs.writeFileSync(zipPath, response.data);
            const zip = new adm_zip_1.default(zipPath);
            console.log(`Extracting zip file to ${extractPath}`);
            zip.extractAllTo(extractPath, true);
            console.log('Zip file extracted successfully.');
            try {
                fs.unlinkSync(zipPath);
            }
            catch { }
            return extractPath;
        }
        else {
            const errorMessage = `Unable to download zip file from ${url}`;
            console.error(errorMessage);
            throw new Error(errorMessage);
        }
    }
    async getResourcesFromFolder(folderName) {
        console.log('FETCHING NEW FILES!! for persona folder');
        return this.downloadAndExtractZip(`https://cms.paidgirls.site/folders/${folderName}/files/download-all`);
    }
}
exports.CloudinaryService = CloudinaryService;
//# sourceMappingURL=cloudinary.js.map