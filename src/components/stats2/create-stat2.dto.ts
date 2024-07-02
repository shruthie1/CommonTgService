// create-stat.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class CreateStatDto {
  @ApiProperty({ example: '6785668464', description: 'Chat ID' })
  chatId: string;

  @ApiProperty({ example: 12, description: 'Count' })
  count: number;

  @ApiProperty({ example: 50, description: 'Pay Amount' })
  payAmount: number;

  @ApiProperty({ example: true, description: 'Demo Given' })
  demoGiven: boolean;

  @ApiProperty({ example: true, description: 'Demo Given Today' })
  demoGivenToday: boolean;

  @ApiProperty({ example: false, description: 'New User' })
  newUser: boolean;

  @ApiProperty({ example: true, description: 'Paid Reply' })
  paidReply: boolean;

  @ApiProperty({ example: 'Amaan Khan', description: 'Name' })
  name: string;

  @ApiProperty({ example: false, description: 'Second Show' })
  secondShow: boolean;

  @ApiProperty({ example: null, description: 'Did Pay' })
  didPay: boolean | null;

  @ApiProperty({ example: 'shruthi1', description: 'Client' })
  client: string;

  @ApiProperty({ example: 'shruthi', description: 'Profile' })
  profile: string;
}
