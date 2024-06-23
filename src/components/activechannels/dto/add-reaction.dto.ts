import { ApiProperty,  } from '@nestjs/swagger';

export class AddReactionDto  {
    @ApiProperty({required: true})
    reactions: string[]
}
