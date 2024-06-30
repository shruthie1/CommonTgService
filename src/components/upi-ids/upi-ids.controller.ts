import { Controller, Get, Body, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { UpiIdService } from './upi-ids.service';

@ApiTags('UPI Ids')
@Controller('upi-ids')
export class UpiIdController {
  constructor(private readonly UpiIdService: UpiIdService) { }

  @Get()
  @ApiOperation({ summary: 'Get Upi Ids' })
  async findOne(): Promise<any> {
    return this.UpiIdService.findOne();
  }

  @Patch()
  @ApiOperation({ summary: 'Update Upi Ids' })
  @ApiBody({ type: Object })
  async update(@Body() updateUpiIdsdto: any): Promise<any> {
    return this.UpiIdService.update(updateUpiIdsdto);
  }

}
