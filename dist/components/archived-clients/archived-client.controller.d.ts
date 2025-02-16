import { Client } from '../clients/schemas/client.schema';
import { ArchivedClientService } from './archived-client.service';
import { CreateClientDto } from '../clients/dto/create-client.dto';
import { SearchClientDto } from '../clients/dto/search-client.dto';
import { UpdateClientDto } from '../clients/dto/update-client.dto';
export declare class ArchivedClientController {
    private readonly archivedclientService;
    constructor(archivedclientService: ArchivedClientService);
    create(createClientDto: CreateClientDto): Promise<Client>;
    search(query: SearchClientDto): Promise<Client[]>;
    findAll(): Promise<Client[]>;
    checkArchivedClients(): Promise<string>;
    findOne(mobile: string): Promise<Client>;
    fetchOne(mobile: string): Promise<Client>;
    update(mobile: string, updateClientDto: UpdateClientDto): Promise<Client>;
    remove(mobile: string): Promise<Client>;
    executeQuery(query: object): Promise<any>;
}
