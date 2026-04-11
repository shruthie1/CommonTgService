import { ClientService } from './client.service';
import { CreateClientDto } from './dto/create-client.dto';
import { Client } from './schemas/client.schema';
import { SearchClientDto } from './dto/search-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ExecuteClientQueryDto } from './dto/execute-client-query.dto';
export declare class ClientController {
    private readonly clientService;
    constructor(clientService: ClientService);
    private sanitizeQuery;
    create(createClientDto: CreateClientDto): Promise<Client>;
    search(query: SearchClientDto): Promise<Client[]>;
    updateClient(clientId: string): Promise<"Update client completed" | "Update client skipped">;
    findAllMasked(): Promise<Partial<Client>[]>;
    findOneMasked(clientId: string): Promise<Partial<Client>>;
    findAll(): Promise<Client[]>;
    getPersonaPool(clientId: string): Promise<{
        firstNames: string[];
        bufferLastNames: string[];
        promoteLastNames: string[];
        bios: string[];
        profilePics: string[];
        dbcoll: string;
    }>;
    getExistingAssignments(clientId: string, scope?: 'all' | 'buffer' | 'activeClient'): Promise<{
        assignments: import("./client.service").PersonaAssignmentRecord[];
    }>;
    findOne(clientId: string): Promise<Client>;
    update(clientId: string, updateClientDto: UpdateClientDto): Promise<Client>;
    remove(clientId: string): Promise<Client>;
    executeQuery(requestBody: ExecuteClientQueryDto): Promise<Client[]>;
}
