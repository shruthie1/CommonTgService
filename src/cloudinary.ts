import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import AdmZip from 'adm-zip';
import { fetchWithTimeout } from './utils/fetchWithTimeout';

/**
 * Persona-media fetcher. Despite the historical name, this no longer talks to
 * Cloudinary directly — persona pic bundles are served as zips by the CMS/UMS
 * `/folders/:name/files/download-all` endpoint. The old direct-Cloudinary methods
 * (upload/create_folder/api.resources) were dead code and have been removed.
 */
export class CloudinaryService {
    static instance;

    static async getInstance(_name?: string) {
        if (!CloudinaryService.instance) {
            CloudinaryService.instance = new CloudinaryService();
        }
        // Note: the actual per-persona download happens via getResourcesFromFolder(name),
        // which returns a UNIQUE extract dir (callers must use the returned path, not cwd).
        return CloudinaryService.instance;
    }

    /**
     * Downloads + extracts a persona zip into a UNIQUE per-call directory and returns that
     * directory. Unique paths eliminate the race where two concurrent profile-pic flows
     * (different personas) clobbered each other's files over fixed dp1/dp2/dp3.jpg names —
     * a fingerprinting/anti-detection risk.
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
        console.log('FETCHING NEW FILES!! for persona folder');
        // Returns the unique per-call extract directory the persona files were unpacked into.
        return this.downloadAndExtractZip(`https://cms.paidgirls.site/folders/${folderName}/files/download-all`);
    }
}
