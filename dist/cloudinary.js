"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloudinaryService = void 0;
console.log("in Cloudinary");
const cloudinary = require("cloudinary");
const path = require("path");
const fs = require("fs");
const utils_1 = require("./utils");
class CloudinaryService {
    constructor() {
        this.resources = new Map();
        cloudinary.v2.config({
            cloud_name: process.env.CL_NAME,
            api_key: process.env.CL_APIKEY,
            api_secret: process.env.CL_APISECRET
        });
    }
    static async getInstance(name) {
        if (!CloudinaryService.instance) {
            CloudinaryService.instance = new CloudinaryService();
        }
        await CloudinaryService.instance.getResourcesFromFolder(name);
        return CloudinaryService.instance;
    }
    async getResourcesFromFolder(folderName) {
        console.log('FETCHING NEW FILES!! from CLOUDINARY');
        await this.findAndSaveResources(folderName, 'image');
    }
    async createNewFolder(folderName) {
        await this.createFolder(folderName);
        await this.uploadFilesToFolder(folderName);
    }
    async overwriteFile() {
        const cloudinaryFileId = "index_nbzca5.js";
        const localFilePath = "./src/test.js";
        try {
            const result = await cloudinary.v2.uploader.upload(localFilePath, {
                resource_type: 'auto',
                overwrite: true,
                invalidate: true,
                public_id: cloudinaryFileId
            });
            console.log(result);
        }
        catch (error) {
            (0, utils_1.parseError)(error);
        }
    }
    async findAndSaveResources(folderName, type) {
        try {
            const { resources } = await cloudinary.v2.api.resources({ resource_type: type, type: 'upload', prefix: folderName, max_results: 500 });
            await Promise.all(resources.map(async (resource) => {
                try {
                    this.resources.set(resource.public_id.split('/')[1].split('_')[0], resource.url);
                    await saveFile(resource.url, resource.public_id.split('/')[1].split('_')[0]);
                }
                catch (error) {
                    console.log(resource);
                    (0, utils_1.parseError)(error);
                }
            }));
        }
        catch (error) {
            (0, utils_1.parseError)(error);
        }
    }
    async createFolder(folderName) {
        try {
            const result = await cloudinary.v2.api.create_folder(folderName);
            return result;
        }
        catch (error) {
            console.error('Error creating folder:', error);
            throw error;
        }
    }
    async uploadFilesToFolder(folderName) {
        const uploadPromises = Array.from(this.resources.entries()).map(async ([key, url]) => {
            try {
                const result = await cloudinary.v2.uploader.upload_large(url, {
                    folder: folderName,
                    resource_type: 'auto',
                    public_id: key,
                });
                return result;
            }
            catch (error) {
                console.error('Error uploading file:', error);
                throw error;
            }
        });
        try {
            return await Promise.all(uploadPromises);
        }
        catch (error) {
            console.error('Error uploading files:', error);
            throw error;
        }
    }
    async printResources() {
        try {
            this.resources?.forEach((val, key) => {
                console.log(key, ":", val);
            });
        }
        catch (error) {
            (0, utils_1.parseError)(error);
        }
    }
    get(publicId) {
        try {
            const result = this.resources.get(publicId);
            return result || '';
        }
        catch (error) {
            (0, utils_1.parseError)(error);
        }
    }
    getBuffer(publicId) {
        try {
            const result = this.resources.get(publicId);
            return result || '';
        }
        catch (error) {
            console.log(error);
        }
    }
}
exports.CloudinaryService = CloudinaryService;
async function saveFile(url, name) {
    const extension = url.substring(url.lastIndexOf('.') + 1);
    const rootPath = process.cwd();
    const mypath = path.join(rootPath, `${name}.${extension}`);
    console.log(mypath);
    (0, utils_1.fetchWithTimeout)(url, { responseType: 'arraybuffer' }, 2)
        .then(res => {
        if (res?.statusText === 'OK') {
            try {
                if (!fs.existsSync(mypath)) {
                    fs.writeFileSync(mypath, res.data, 'binary');
                    console.log(`${name}.${extension} Saved!!`);
                }
                else {
                    fs.unlinkSync(mypath);
                    fs.writeFileSync(mypath, res.data, 'binary');
                    console.log(`${name}.${extension} Replaced!!`);
                }
            }
            catch (err) {
                (0, utils_1.parseError)(err);
            }
        }
        else {
            throw new Error(`Unable to download file from ${url}`);
        }
    }).catch(err => {
        (0, utils_1.parseError)(err);
    });
}
//# sourceMappingURL=cloudinary.js.map