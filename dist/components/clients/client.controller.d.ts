import { ClientService } from './client.service';
import { CreateClientDto } from './dto/create-client.dto';
import { Client } from './schemas/client.schema';
import { SearchClientDto } from './dto/search-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
export declare class ClientController {
    private readonly clientService;
    constructor(clientService: ClientService);
    create(createClientDto: CreateClientDto): Promise<Client>;
    search(query: SearchClientDto): Promise<Client[]>;
    searchByPromoteMobile(mobile: string): Promise<{
        clients: Client[];
        matches: Array<{
            clientId: string;
            mobile: string;
        }>;
        searchedMobile: string;
    }>;
    enhancedSearch(query: any): Promise<{
        clients: Client[];
        searchType: string;
        promoteMobileMatches?: Array<{
            clientId: string;
            mobile: string;
        }>;
        totalResults: number;
    }>;
    updateClient(clientId: string): Promise<string>;
    findAllMasked(): Promise<Partial<Client>[]>;
    findOneMasked(clientId: string): Promise<Partial<Client>>;
    findAll(): Promise<Client[]>;
    findOne(clientId: string): Promise<Client>;
    update(clientId: string, updateClientDto: UpdateClientDto): Promise<Client>;
    remove(clientId: string): Promise<Client>;
    executeQuery(requestBody: any): Promise<any>;
    addPromoteMobile(clientId: string, body: {
        mobileNumber: string;
    }): Promise<Client>;
    removePromoteMobile(clientId: string, body: {
        mobileNumber: string;
    }): Promise<Client>;
    getClientIpInfo(clientId: string): Promise<{
        clientId: string;
        mobiles: {
            mainMobile?: {
                mobile: string;
                hasIp: boolean;
                ipAddress?: string;
            };
            promoteMobiles: {
                mobile: string;
                hasIp: boolean;
                ipAddress?: string;
            }[];
        };
        needingAssignment: {
            mainMobile?: string;
            promoteMobiles: string[];
        };
    }>;
    getIpForMobile(mobile: string, clientId?: string): Promise<{
        mobile: string;
        ipAddress: string | null;
        hasAssignment: boolean;
    }>;
    autoAssignIpsToClient(clientId: string): Promise<any>;
    getMobilesNeedingIpAssignment(clientId: string): Promise<{
        clientId: string;
        mobilesNeedingIps: {
            mainMobile?: string;
            promoteMobiles: string[];
        };
        summary: {
            totalNeedingAssignment: number;
            mainMobileNeedsIp: boolean;
            promoteMobilesNeedingIp: number;
        };
    }>;
    releaseIpFromMobile(mobile: string): Promise<{
        success: boolean;
        message: string;
    }>;
}
