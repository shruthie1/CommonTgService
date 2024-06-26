import { ClientService } from './client.service';
import { CreateClientDto } from './dto/create-client.dto';
import { Client } from './schemas/client.schema';
import { SearchClientDto } from './dto/search-client.dto';
import { SetupClientQueryDto } from './dto/setup-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
export declare class ClientController {
    private readonly clientService;
    constructor(clientService: ClientService);
    create(createClientDto: CreateClientDto): Promise<Client>;
    search(query: SearchClientDto): Promise<Client[]>;
    findAllMasked(): Promise<Client[]>;
    findAll(): Promise<Client[]>;
    updateClient(clientId: string): Promise<void>;
    findOne(clientId: string): Promise<Client>;
    setupClient(clientId: string, setupClientQueryDto: SetupClientQueryDto): Promise<string>;
    update(clientId: string, updateClientDto: UpdateClientDto): Promise<Client>;
    remove(clientId: string): Promise<Client>;
    executeQuery(requestBody: any): Promise<any>;
}
