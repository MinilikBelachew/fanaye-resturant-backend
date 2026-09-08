import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { SessionBillResponseDto } from './dto/billing-response.dto';

@ApiTags('Billing')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'table-sessions',
  version: '1',
})
export class TableSessionBillController {
  constructor(private readonly billingService: BillingService) {}

  @Get(':id/bill')
  @ApiOkResponse({ type: SessionBillResponseDto })
  getBill(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SessionBillResponseDto> {
    return this.billingService.getSessionBill(String(request.user.id), id);
  }
}
