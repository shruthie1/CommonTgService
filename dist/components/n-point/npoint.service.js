"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var NpointService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NpointService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
let NpointService = NpointService_1 = class NpointService {
    constructor() {
        this.logger = new common_1.Logger(NpointService_1.name);
        this.csrfToken = null;
        this.cookie = '_npoint_session=MTBOeElFZ0pXV0oxTm9xd1dQQ0tNYnhVYWg1blFCMUVtUUJVWFQ1cGZwdlNwSTdacjBVTStJbDlHaGlWd0pGUDRzUmRaYnZNQVNTMTVmY1R6dEVUd0RPMXVFcmE1cnFYY09qd1A5TFpNVnZOUnVJRnlWV3ZtODk0ajlQVXQ0QzQ0MUtGeU5mTTB5dGFPNCtLUW9tVy9yTmFRZzlRQUdRK0NkQVVtZGxtMVEySzN0TC9sUjdMR2RjVW5xTmtleWw4TWdPOVNMa2JaZEs1c1o3eGE3UHdsQ2JiTEdQbHhUaysraCsrcG9LM25YREdyTDdpYWlHQ0wraEhNV3NXbzJtK1YvVzEvVTh2Z0N5bnpzU1hqcndiM041L2I3R29UMDY3RitBYkxvTktWaUVmdTg4SGJORjRTS25uZ2JDSWhmNWFoem0vNGNvUnAzMDBsQ0FJcUZTMjdnPT0tLWs2a2x2SUZqcHhDN1A0eFdUaWhBeVE9PQ%3D%3D--4d0883b9956c6d2744389228dab7321ff2eb88e5';
        this.baseUrl = 'https://www.npoint.io';
        this.signInUrl = 'https://www.npoint.io/users/sign_in';
    }
    async fetchCsrfToken() {
        this.logger.debug('Fetching CSRF token...');
        try {
            const data = JSON.stringify({
                "user": {
                    "email": "dodieajt@gmail.com",
                    "password": "Ajtdmwajt1@"
                }
            });
            const config = {
                method: 'post',
                maxBodyLength: Infinity,
                url: this.signInUrl,
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': this.cookie
                },
                data: data
            };
            const response = await axios_1.default.request(config);
            console.log("Cookie:", response.headers['set-cookie'][0]);
            this.cookie = response.headers['set-cookie'][0];
            this.csrfToken = await this.fetchCsrfTokenFromHtml(response.data);
            if (!this.csrfToken) {
                throw new Error('CSRF token not found in the sign-in response.');
            }
            this.logger.debug('CSRF token fetched successfully.');
            return this.csrfToken;
        }
        catch (error) {
            this.logger.error(`Failed to fetch CSRF token: ${error.message}`);
            throw new Error(`Failed to fetch CSRF token: ${error.message}`);
        }
    }
    async ensureCsrfToken() {
        if (!this.csrfToken) {
            await this.fetchCsrfToken();
        }
    }
    async fetchDocument(documentId) {
        this.logger.debug(`Fetching document with ID: ${documentId}`);
        await this.ensureCsrfToken();
        try {
            const response = await axios_1.default.get(`${this.baseUrl}/documents/${documentId}`, {
                headers: {
                    'X-CSRF-Token': this.csrfToken,
                    'Cookie': this.cookie
                },
            });
            this.logger.debug(`Document with ID: ${documentId} fetched successfully.`);
            return response.data;
        }
        catch (error) {
            this.logger.error(`Failed to fetch document with ID: ${documentId}: ${error.message}`);
            throw new Error(`Failed to fetch document: ${error.message}`);
        }
    }
    async postDocument(document) {
        this.logger.debug('Posting a new document...');
        await this.ensureCsrfToken();
        try {
            const response = await axios_1.default.post(`${this.baseUrl}/documents`, { "generate_contents": true }, {
                headers: {
                    'X-CSRF-Token': this.csrfToken,
                    'Cookie': this.cookie
                },
            });
            this.logger.debug(`Document posted successfully. Updating document with token: ${response.data.token}`);
            await this.updateDocument(response.data.token, document);
            return response.data;
        }
        catch (error) {
            this.logger.error(`Failed to post document: ${error.message}`);
            throw new Error(`Failed to post document: ${error.message}`);
        }
    }
    async updateDocument(documentId, updatedDocument) {
        this.logger.debug(`Updating document with ID: ${documentId}`);
        await this.ensureCsrfToken();
        const body = {
            "contents": JSON.stringify(updatedDocument),
            "original_contents": JSON.stringify(updatedDocument),
            "schema": null,
            "original_schema": ""
        };
        try {
            const response = await axios_1.default.put(`${this.baseUrl}/documents/${documentId}`, body, {
                headers: {
                    'X-CSRF-Token': this.csrfToken,
                    'Cookie': this.cookie
                },
            });
            this.logger.debug(`Document with ID: ${documentId} updated successfully.`);
            return response.data;
        }
        catch (error) {
            this.logger.error(`Failed to update document with ID: ${documentId}: ${error.message}`);
            throw new Error(`Failed to update document: ${error.message}`);
        }
    }
    async fetchAllDocuments() {
        await this.ensureCsrfToken();
        try {
            const response = await axios_1.default.get(`${this.baseUrl}/documents`, {
                headers: {
                    'X-CSRF-Token': this.csrfToken,
                    'Cookie': this.cookie
                },
            });
            return response.data;
        }
        catch (error) {
            throw new Error(`Failed to fetch all documents: ${error.message}`);
        }
    }
    async fetchCsrfTokenFromHtml(data) {
        try {
            const csrfTokenMatch = data.match(/<meta name="csrf-token" content="([^"]+)"/);
            if (!csrfTokenMatch || !csrfTokenMatch[1]) {
                throw new Error('CSRF token not found in the HTML response.');
            }
            const csrfToken = csrfTokenMatch[1];
            console.log('CSRF Token:', csrfToken);
            return csrfToken;
        }
        catch (error) {
            console.error('Error fetching CSRF token:', error);
        }
    }
};
exports.NpointService = NpointService;
exports.NpointService = NpointService = NpointService_1 = __decorate([
    (0, common_1.Injectable)()
], NpointService);
//# sourceMappingURL=npoint.service.js.map