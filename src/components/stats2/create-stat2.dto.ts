// create-stat.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class CreateStatDto {
  @ApiProperty({ description: 'Chat ID' })
  chatId: string;

  @ApiProperty({ description: 'Count' })
  count: number;

  @ApiProperty({ description: 'Pay Amount' })
  payAmount: number;

  @ApiProperty({ description: 'Demo Given' })
  demoGiven: boolean;

  @ApiProperty({ description: 'Demo Given Today' })
  demoGivenToday: boolean;

  @ApiProperty({ description: 'New User' })
  newUser: boolean;

  @ApiProperty({ description: 'Paid Reply' })
  paidReply: boolean;

  @ApiProperty({ description: 'Name' })
  name: string;

  @ApiProperty({ description: 'Second Show' })
  secondShow: boolean;

  @ApiProperty({ description: 'Did Pay' })
  didPay: boolean | null;

  @ApiProperty({ description: 'Client' })
  client: string;

  @ApiProperty({ description: 'Profile' })
  profile: string;
}
