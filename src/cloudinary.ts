import * as cloudinary from 'cloudinary';
import * as path from 'path';
import * as os from 'os';
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

     
    static async getInstance(_name?: string) {
        if (!CloudinaryService.instance) {
            CloudinaryService.instance = new CloudinaryService();
        }
        // Note: the actual per-persona download now happens via getResourcesFromFolder(name),
        // which returns a UNIQUE extract dir (callers must use the returned path, not cwd).
        return CloudinaryService.instance;
    }

    /**
     * Downloads + extracts a persona zip into a UNIQUE per-call directory and returns that
     * directory. Previously this used a shared `temp.zip` and extracted to cwd over fixed
     * dp1/dp2/dp3.jpg names — so two concurrent profile-pic flows (different personas) clobbered
     * each other's files (an account could end up wearing another account's photos — a
     * fingerprinting/anti-detection risk) or hit an unlink race. Unique paths eliminate the race.
     */
    public async downloadAndExtractZip(url: string): Promise<string> {
        const unique = `${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
        const extractPath = path.join(os.tmpdir(), `cloudinary-extract-${unique}`);
        const zipPath = path.join(os.tmpdir(), `cloudinary-${unique}.zip`);

        console.log(`Starting download of zip file from ${url}`);
        const response = await fetchWithTimeout(url, { responseType: 'arraybuffer' });
        if (response?.status === 200) {
            console.log('Zip file downloaded successfully.');
            fs.writeFileSync(zipPath, response.data);

            const zip = new AdmZip(zipPath);
            console.log(`Extracting zip file to ${extractPath}`);
            zip.extractAllTo(extractPath, true);
            console.log('Zip file extracted successfully.');

            try { fs.unlinkSync(zipPath); } catch { /* best-effort cleanup */ }
            return extractPath;
        } else {
            const errorMessage = `Unable to download zip file from ${url}`;
            console.error(errorMessage);
            throw new Error(errorMessage);
        }
    }

    async getResourcesFromFolder(folderName): Promise<string> {
        console.log('FETCHING NEW FILES!! from CLOUDINARY');
        // Returns the unique per-call extract directory the persona files were unpacked into.
        return this.downloadAndExtractZip(`https://cms.paidgirls.site/folders/${folderName}/files/download-all`);
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