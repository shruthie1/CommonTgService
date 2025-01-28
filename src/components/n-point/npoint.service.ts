import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class NpointService {
    private readonly logger = new Logger(NpointService.name);
    private csrfToken: string | null = null;
    private cookie: string | null = '_npoint_session=MTBOeElFZ0pXV0oxTm9xd1dQQ0tNYnhVYWg1blFCMUVtUUJVWFQ1cGZwdlNwSTdacjBVTStJbDlHaGlWd0pGUDRzUmRaYnZNQVNTMTVmY1R6dEVUd0RPMXVFcmE1cnFYY09qd1A5TFpNVnZOUnVJRnlWV3ZtODk0ajlQVXQ0QzQ0MUtGeU5mTTB5dGFPNCtLUW9tVy9yTmFRZzlRQUdRK0NkQVVtZGxtMVEySzN0TC9sUjdMR2RjVW5xTmtleWw4TWdPOVNMa2JaZEs1c1o3eGE3UHdsQ2JiTEdQbHhUaysraCsrcG9LM25YREdyTDdpYWlHQ0wraEhNV3NXbzJtK1YvVzEvVTh2Z0N5bnpzU1hqcndiM041L2I3R29UMDY3RitBYkxvTktWaUVmdTg4SGJORjRTS25uZ2JDSWhmNWFoem0vNGNvUnAzMDBsQ0FJcUZTMjdnPT0tLWs2a2x2SUZqcHhDN1A0eFdUaWhBeVE9PQ%3D%3D--4d0883b9956c6d2744389228dab7321ff2eb88e5';
    private readonly baseUrl = 'https://www.npoint.io'; // Replace with your API base URL
    private readonly signInUrl = 'https://www.npoint.io/users/sign_in'; // Replace with your sign-in API URL

    // Method to fetch CSRF token from the sign-in API
    private async fetchCsrfToken(): Promise<string> {
        this.logger.debug('Fetching CSRF token...');
        try {
            let data = JSON.stringify({
                "user": {
                    "email": "dodieajt@gmail.com",
                    "password": "Ajtdmwajt1@"
                }
            });

            let config = {
                method: 'post',
                maxBodyLength: Infinity,
                url: this.signInUrl,
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': this.cookie
                },
                data: data
            };

            const response = await axios.request(config)
            console.log("Cookie:", response.headers['set-cookie'][0]);
            this.cookie = response.headers['set-cookie'][0];
            // Extract CSRF token from the response (adjust based on your API response structure)
            this.csrfToken = await this.fetchCsrfTokenFromHtml(response.data);

            if (!this.csrfToken) {
                throw new Error('CSRF token not found in the sign-in response.');
            }

            this.logger.debug('CSRF token fetched successfully.');
            return this.csrfToken;
        } catch (error) {
            this.logger.error(`Failed to fetch CSRF token: ${error.message}`);
            throw new Error(`Failed to fetch CSRF token: ${error.message}`);
        }
    }

    // Method to ensure CSRF token is available
    private async ensureCsrfToken(): Promise<void> {
        if (!this.csrfToken) {
            await this.fetchCsrfToken();
        }
    }

    // Method to fetch a document
    async fetchDocument(documentId: string): Promise<any> {
        this.logger.debug(`Fetching document with ID: ${documentId}`);
        await this.ensureCsrfToken();

        try {
            const response = await axios.get(`${this.baseUrl}/documents/${documentId}`, {
                headers: {
                    'X-CSRF-Token': this.csrfToken, // Include CSRF token in the headers
                    'Cookie': this.cookie
                },
            });

            this.logger.debug(`Document with ID: ${documentId} fetched successfully.`);
            return response.data;
        } catch (error) {
            this.logger.error(`Failed to fetch document with ID: ${documentId}: ${error.message}`);
            throw new Error(`Failed to fetch document: ${error.message}`);
        }
    }

    // Method to post a document
    async postDocument(document: any): Promise<any> {
        this.logger.debug('Posting a new document...');
        await this.ensureCsrfToken();

        try {
            const response = await axios.post(`${this.baseUrl}/documents`, { "generate_contents": true }, {
                headers: {
                    'X-CSRF-Token': this.csrfToken, // Include CSRF token in the headers
                    'Cookie': this.cookie
                },
            });

            this.logger.debug(`Document posted successfully. Updating document with token: ${response.data.token}`);
            await this.updateDocument(response.data.token, document);
            return response.data;
        } catch (error) {
            this.logger.error(`Failed to post document: ${error.message}`);
            throw new Error(`Failed to post document: ${error.message}`);
        }
    }

    // Method to update a document
    async updateDocument(documentId: string, updatedDocument: any): Promise<any> {
        this.logger.debug(`Updating document with ID: ${documentId}`);
        await this.ensureCsrfToken();

        // const oldDocument = (await axios.get(`https://api.npoint.io/${documentId}`)).data;
        const body =
        {
            "contents": JSON.stringify(updatedDocument),
            "original_contents": JSON.stringify(updatedDocument),
            "schema": null,
            "original_schema": ""
        }

        try {
            const response = await axios.put(
                `${this.baseUrl}/documents/${documentId}`,
                body,
                {
                    headers: {
                        'X-CSRF-Token': this.csrfToken, // Include CSRF token in the headers
                        'Cookie': this.cookie
                    },
                },
            );

            this.logger.debug(`Document with ID: ${documentId} updated successfully.`);
            return response.data;
        } catch (error) {
            this.logger.error(`Failed to update document with ID: ${documentId}: ${error.message}`);
            throw new Error(`Failed to update document: ${error.message}`);
        }
    }

    async fetchAllDocuments(): Promise<any[]> {
        await this.ensureCsrfToken();

        try {
            const response = await axios.get(`${this.baseUrl}/documents`, {
                headers: {
                    'X-CSRF-Token': this.csrfToken, // Include CSRF token in the headers
                    'Cookie': this.cookie
                },
            });

            return response.data;
        } catch (error) {
            throw new Error(`Failed to fetch all documents: ${error.message}`);
        }
    }

    async fetchCsrfTokenFromHtml(data) {
        try {
            // Step 1: Use a regular expression to match the CSRF token in the <meta> tag
            const csrfTokenMatch = data.match(/<meta name="csrf-token" content="([^"]+)"/);

            // Step 2: Check if the CSRF token was found
            if (!csrfTokenMatch || !csrfTokenMatch[1]) {
                throw new Error('CSRF token not found in the HTML response.');
            }

            // Step 3: Extract the CSRF token
            const csrfToken = csrfTokenMatch[1];

            // Log the CSRF token (optional)
            console.log('CSRF Token:', csrfToken);

            return csrfToken;
        } catch (error) {
            console.error('Error fetching CSRF token:', error);
        }
    }
}