import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { PublicReceiptDto } from './dto/billing-response.dto';

@ApiTags('Public Receipt')
@Controller({
  path: 'public/receipts',
  version: '1',
})
export class PublicReceiptsController {
  constructor(private readonly billingService: BillingService) {}

  @Get(':billId')
  @ApiOkResponse({ type: PublicReceiptDto })
  get(
    @Param('billId', ParseUUIDPipe) billId: string,
  ): Promise<PublicReceiptDto> {
    return this.billingService.getPublicReceipt(billId);
  }
}
