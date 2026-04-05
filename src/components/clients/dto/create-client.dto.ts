import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsOptional, IsString, IsUrl, Matches } from 'class-validator';

export class CreateClientDto {
    @ApiProperty({ example: 'paid_giirl_shruthiee', description: 'Channel link of the user' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsString()
    readonly channelLink: string;

    @ApiProperty({ example: 'shruthi', description: 'Database collection name' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsString()
    readonly dbcoll: string;

    @ApiProperty({ example: 'PaidGirl.netlify.app/Shruthi1', description: 'Link of the user' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsUrl({}, { message: 'Invalid client link format' })
    readonly link: string;

    @ApiProperty({ example: 'Shruthi Reddy', description: 'Name of the user' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsString()
    readonly name: string;

    @ApiProperty({ example: '+916265240911', description: 'Phone number of the user' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @Matches(/^\+?[0-9]{10,15}$/, { message: 'Invalid phone number format' })
    readonly mobile: string;

    @ApiProperty({ example: 'Ajtdmwajt1@', description: 'Password of the user' })
    @IsString()
    readonly password: string;

    @ApiProperty({ example: 'https://shruthi1.glitch.me', description: 'Repl link of the user' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsUrl({}, { message: 'Invalid repl URL format' })
    readonly repl: string;

    @ApiProperty({ example: 'https://shruthiprom0101.glitch.me', description: 'Promotion Repl link of the user' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsUrl({}, { message: 'Invalid promote repl URL format' })
    readonly promoteRepl: string;

    @ApiProperty({ example: '1BQANOTEuMTA4LjUg==', description: 'Session token' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsString()
    readonly session: string;

    @ApiProperty({ example: 'ShruthiRedd2', description: 'Username of the user' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsString()
    readonly username: string;

    @ApiProperty({ example: 'shruthi1', description: 'Client ID of the user' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsString()
    @Matches(/^[a-z0-9_-]{3,50}$/i, { message: 'Invalid client ID format' })
    readonly clientId: string;

    @ApiProperty({ example: 'https://shruthi1.glitch.me/exit', description: 'Deployment key URL' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsUrl({}, { message: 'Invalid deploy key URL format' })
    readonly deployKey: string;

    @ApiProperty({ example: 'booklet_10', description: 'Product associated with the user' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsString()
    readonly product: string;

    @ApiPropertyOptional({ example: 'paytmqr281005050101xv6mfg02t4m9@paytm', description: 'Paytm QR ID of the user' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsOptional()
    @IsString()
    readonly qrId: string;

    @ApiPropertyOptional({ example: 'myred1808@postbank', description: 'Google Pay ID of the user' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsOptional()
    @IsString()
    readonly gpayId: string;

    @ApiPropertyOptional({ example: ['192.168.1.100:8080', '192.168.1.101:8080'], description: 'Dedicated proxy IPs assigned to this client' })
    @IsOptional()
    @IsArray()
    @ArrayUnique()
    @IsString({ each: true })
    readonly dedicatedIps?: string[];

    @ApiPropertyOptional({ example: 'US', description: 'Preferred country for IP assignment' })
    @Transform(({ value }: TransformFnParams) => value?.trim().toUpperCase())
    @IsOptional()
    @Matches(/^[A-Z]{2}$/, { message: 'preferredIpCountry must be a 2-letter ISO country code' })
    readonly preferredIpCountry?: string;

    @ApiPropertyOptional({ example: true, description: 'Whether to auto-assign IPs to mobile numbers' })
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    readonly autoAssignIps?: boolean;

    @ApiProperty({ description: 'Pool of first names', required: false })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    firstNames?: string[];

    @ApiProperty({ description: 'Pool of last names for buffer clients', required: false })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    bufferLastNames?: string[];

    @ApiProperty({ description: 'Pool of last names for promote clients', required: false })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    promoteLastNames?: string[];

    @ApiProperty({ description: 'Pool of bios', required: false })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    bios?: string[];

    @ApiProperty({ description: 'Pool of profile pic URLs', required: false })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @IsUrl({}, { each: true })
    profilePics?: string[];
}
