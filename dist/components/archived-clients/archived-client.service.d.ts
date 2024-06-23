import { Model } from 'mongoose';
import { CreateClientDto } from '../clients/dto/create-client.dto';
import { Client, ClientDocument } from '../clients/schemas/client.schema';
import { UpdateClientDto } from '../clients/dto/update-client.dto';
export declare class ArchivedClientService {
    private archivedclientModel;
    constructor(archivedclientModel: Model<ClientDocument>);
    create(createClientDto: CreateClientDto): Promise<Client>;
    findAll(): Promise<Client[]>;
    findOne(mobile: string): Promise<Client>;
    update(mobile: string, updateClientDto: UpdateClientDto): Promise<Client>;
    remove(mobile: string): Promise<Client>;
    search(filter: any): Promise<Client[]>;
    executeQuery(query: any): Promise<any>;
}
