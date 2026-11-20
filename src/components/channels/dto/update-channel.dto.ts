import { PartialType } from '@nestjs/swagger';
import { CreateChannelDto } from './create-channel.dto';

export class UpdateChannelDto extends PartialType(CreateChannelDto) {
  constructor() {
    super();
    // PartialType copies the create DTO's initializers (private=false, forbidden=false, banned=false,
    // bannedAt=null, ...). The ValidationPipe builds this class with `new` and then assigns the body,
    // so without this every PATCH reset those flags. A PATCH holds only the fields the caller sent.
    for (const key of Object.keys(this)) delete (this as Record<string, unknown>)[key];
  }
}
