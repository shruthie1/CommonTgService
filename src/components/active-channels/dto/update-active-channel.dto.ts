import { PartialType } from '@nestjs/swagger';
import { CreateActiveChannelDto } from './create-active-channel.dto';

export class UpdateActiveChannelDto extends PartialType(CreateActiveChannelDto) {
  constructor() {
    super();
    // PartialType copies the create DTO's initializers (banned=false, bannedAt=null, private=false,
    // ...). The ValidationPipe builds this class with `new` and then assigns the body, so without
    // this every PATCH carried banned=false: an unban on a title-only edit. A PATCH holds only the
    // fields the caller sent; an explicit `banned: false` is still the unban.
    for (const key of Object.keys(this)) delete (this as Record<string, unknown>)[key];
  }
}
