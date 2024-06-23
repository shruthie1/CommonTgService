import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Document } from 'mongoose';

export type ClientDocument = Client & Document;

@Schema({ collection: 'clients', versionKey: false, autoIndex: true })
export class Client extends Document{
    @ApiProperty({ example: 'paid_giirl_shruthiee', description: 'Channel link of the user' })
    @Prop({ required: true })
    channelLink: string;
  
    @ApiProperty({ example: 'shruthi', description: 'Database collection name' })
    @Prop({ required: true })
    dbcoll: string;
  
    @ApiProperty({ example: 'PaidGirl.netlify.app/Shruthi1', description: 'Link of the user' })
    @Prop({ required: true })
    link: string;
  
    @ApiProperty({ example: 'Shruthi Reddy', description: 'Name of the user' })
    @Prop({ required: true })
    name: string;
  
    @ApiProperty({ example: '916265240911', description: 'mobile number of the user' })
    @Prop({ required: true })
    mobile: string;
  
    @ApiProperty({ example: 'Ajtdmwajt1@', description: 'Password of the user' })
    @Prop({ required: true })
    password: string;
  
    @ApiProperty({ example: 'https://shruthi1.glitch.me', description: 'Repl link of the user' })
    @Prop({ required: true })
    repl: string;
  
    @ApiProperty({ example: '1BQANOTEuM==', description: 'Session token' })
    @Prop({ required: true })
    session: string;
  
    @ApiProperty({ example: 'ShruthiRedd2', description: 'Username of the user' })
    @Prop({ required: true })
    userName: string;
  
    @ApiProperty({ example: 'shruthi1', description: 'Client ID of the user' })
    @Prop({ required: true })
    clientId: string;
  
    @ApiProperty({ example: 'https://shruthi1.glitch.me/exit', description: 'Deployment key URL' })
    @Prop({ required: true })
    deployKey: string;
  
    @ApiProperty({ example: 'ShruthiRedd2', description: 'Main account of the user' })
    @Prop({ required: true })
    mainAccount: string;
  
    @ApiProperty({ example: 'booklet_10', description: 'Product associated with the user' })
    @Prop({ required: true })
    product: string;
}

export const ClientSchema = SchemaFactory.createForClass(Client);
