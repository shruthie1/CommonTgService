console.log("in Cloudinary");
import * as cloudinary from 'cloudinary';
import * as path from 'path';
import * as fs from 'fs';
import { fetchWithTimeout } from './utils';

export class CloudinaryService {
    static instance;
    resources = new Map();

    constructor() {
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
        } catch (error) {
            console.log(error);
        }

    }

    async findAndSaveResources(folderName, type) {
        try {
            const { resources } = await cloudinary.v2.api.resources({ resource_type: type, type: 'upload', prefix: folderName, max_results: 500 });
            resources.forEach(async (resource) => {
                try {
                    this.resources.set(resource.public_id.split('/')[1].split('_')[0], resource.url);
                    await saveFile(resource.url, resource.public_id.split('/')[1].split('_')[0]);
                } catch (error) {
                    console.log(resource);
                    console.log(error)
                }

            });
        } catch (error) {
            console.log(error);
        }
    }

    async createFolder(folderName) {
        try {
            const result = await cloudinary.v2.api.create_folder(folderName);

            return result;
        } catch (error) {
            console.error('Error creating folder:', error);
            throw error;
        }
    }

    // Function to upload files from URLs to a specific folder in Cloudinary
    async uploadFilesToFolder(folderName) {
        const uploadPromises = Array.from(this.resources.entries()).map(async ([key, url]) => {
            try {
                const result = await cloudinary.v2.uploader.upload_large(url, {
                    folder: folderName,
                    resource_type: 'auto',
                    public_id: key, // Set the key as the public_id
                });

                return result;
            } catch (error) {
                console.error('Error uploading file:', error);
                throw error;
            }
        });

        try {
            return await Promise.all(uploadPromises);
        } catch (error) {
            console.error('Error uploading files:', error);
            throw error;
        }
    }

    async printResources() {
        try {
            this.resources?.forEach((val, key) => {
                console.log(key, ":", val);
            })
        } catch (error) {
            console.log(error);
        }
    }

    get(publicId) {
        try {
            const result = this.resources.get(publicId)
            return result || '';
        } catch (error) {
            console.log(error);
        }
    }

    getBuffer(publicId) {
        try {
            const result = this.resources.get(publicId)
            return result || '';
        } catch (error) {
            console.log(error);
        }
    }
}

async function saveFile(url, name) {
    const extension = url.substring(url.lastIndexOf('.') + 1, url.length);
    const mypath = path.resolve(__dirname, `../${name}.${extension}`);
    fetchWithTimeout(url, { responseType: 'arraybuffer' }, 2)
        .then(res => {
            if (res?.statusText === 'OK') {
                try {
                    if (!fs.existsSync(mypath)) {
                        fs.writeFileSync(mypath, res.data, 'binary'); // Save binary data as a file
                        console.log(`${name}.${extension} Saved!!`);
                    } else {
                        fs.unlinkSync(mypath);
                        fs.writeFileSync(mypath, res.data, 'binary'); // Save binary data as a file
                        console.log(`${name}.${extension} Replaced!!`);
                    }
                } catch (err) {
                    console.error(err);
                }
            } else {
                throw new Error(`Unable to download file from ${url}`);
            }
        }).catch(err => {
            console.error(err);
        });
}



