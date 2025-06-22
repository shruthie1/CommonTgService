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
    updateClient(clientId: string): Promise<string>;
    findAllMasked(): Promise<Partial<Client>[]>;
    findAll(): Promise<Client[]>;
    syncNpoint(): Promise<void>;
    findOne(clientId: string): Promise<Client>;
    update(clientId: string, updateClientDto: UpdateClientDto): Promise<Client>;
    remove(clientId: string): Promise<Client>;
    executeQuery(requestBody: any): Promise<any>;
    addPromoteMobile(clientId: string, mobileNumber: string): Promise<Client>;
    removePromoteMobile(clientId: string, mobileNumber: string): Promise<Client>;
}
