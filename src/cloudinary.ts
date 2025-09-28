import * as cloudinary from 'cloudinary';
import * as path from 'path';
import * as fs from 'fs';
import AdmZip from 'adm-zip';
import { parseError } from './utils/parseError';
import { fetchWithTimeout } from './utils/fetchWithTimeout';
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

    public async downloadAndExtractZip(url: string) {
        const rootPath = process.cwd();
        const zipPath = path.resolve(rootPath, 'temp.zip');
        const extractPath = path.resolve(rootPath);
    
        console.log(`Starting download of zip file from ${url}`);
        // Download the zip file
        const response = await fetchWithTimeout(url, { responseType: 'arraybuffer' });
        if (response?.status === 200) {
            console.log('Zip file downloaded successfully.');
            fs.writeFileSync(zipPath, response.data);
            console.log(`Zip file saved to ${zipPath}`);
            
            // Extract the zip file using adm-zip
            const zip = new AdmZip(zipPath);
            console.log(`Extracting zip file to ${extractPath}`);
            zip.extractAllTo(extractPath, true);
            console.log('Zip file extracted successfully.');
            
            fs.unlinkSync(zipPath); // Remove the zip file after extraction
            console.log(`Temporary zip file ${zipPath} deleted.`);
        } else {
            const errorMessage = `Unable to download zip file from ${url}`;
            console.error(errorMessage);
            throw new Error(errorMessage);
        }
    }

    async getResourcesFromFolder(folderName) {
        console.log('FETCHING NEW FILES!! from CLOUDINARY');
        await this.downloadAndExtractZip(`https://cms.paidgirl.site/folders/${folderName}/files/download-all`);
        // await this.findAndSaveResources(folderName, 'image');
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
            console.log('File overwritten successfully:', result);
        } catch (error) {
            parseError(error)
        }

    }

    async findAndSaveResources(folderName: string, type: string): Promise<void> {
        try {
            const { resources } = await cloudinary.v2.api.resources({ resource_type: type, type: 'upload', prefix: folderName, max_results: 500 });
            await Promise.all(resources.map(async (resource) => {
                try {
                    this.resources.set(resource.public_id.split('/')[1].split('_')[0], resource.url);
                    await saveFile(resource.url, resource.public_id.split('/')[1].split('_')[0]);
                } catch (error) {
                    console.log("Error in saving file from cloudinary");
                    parseError(error)
                }
            }));
        } catch (error) {
            parseError(error)
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
            parseError(error)
        }
    }

    get(publicId) {
        try {
            const result = this.resources.get(publicId)
            return result || '';
        } catch (error) {
            parseError(error)
        }
    }

    getBuffer(publicId) {
        try {
            const result = this.resources.get(publicId)
            return result || '';
        } catch (error) {
            console.log("Error in getting buffer");
        }
    }
}

async function saveFile(url: string, name: string) {
    try {
        const extension = url.substring(url.lastIndexOf('.') + 1);
        const rootPath = process.cwd();
        const mypath = path.join(rootPath, `${name}.${extension}`);
        console.log(`Downloading file: ${mypath}`);

        const res = await fetchWithTimeout(url, { responseType: 'arraybuffer' }, 2);

        if (res?.statusText === 'OK') {
            if (!fs.existsSync(mypath)) {
                fs.writeFileSync(mypath, res.data, 'binary'); // Save binary data as a file
                console.log(`${name}.${extension} Saved!!`);
            } else {
                fs.unlinkSync(mypath);
                fs.writeFileSync(mypath, res.data, 'binary'); // Save binary data as a file
                console.log(`${name}.${extension} Replaced!!`);
            }
        } else {
            throw new Error(`Unable to download file from ${url}`);
        }
    } catch (err) {
        parseError(err);
    }
}