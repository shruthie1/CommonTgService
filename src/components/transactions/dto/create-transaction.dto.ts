import { ApiProperty } from '@nestjs/swagger';

export class CreateTransactionDto {
  @ApiProperty({ description: 'Unique transaction ID (UTR).' })
  transactionId: string;

  @ApiProperty({ description: 'Amount involved in the transaction.' })
  amount: number;

  @ApiProperty({ description: 'Issue type reported by the user.' })
  issue: string;

  @ApiProperty({ description: 'Refund method selected by the user.' })
  refundMethod: string;

  @ApiProperty({ description: 'Image URL for transaction proof.', required: false })
  transactionImage?: string;

  @ApiProperty({ description: 'User profile ID.' })
  profile: string;

  @ApiProperty({ description: 'User chat ID.' })
  chatId: string;

  @ApiProperty({ description: 'IP address of the user.' })
  ip: string;
}
