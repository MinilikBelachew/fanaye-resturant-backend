import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BillingService } from './billing.service';

@ApiTags('Billing')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'cashier',
  version: '1',
})
export class CashierPaymentsController {
  constructor(private readonly billingService: BillingService) {}

  @Get('payments')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  list(
    @Request() request,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.billingService.listPayments(String(request.user.id), {
      from,
      to,
    });
  }

  @Get('payments/:paymentId')
  detail(
    @Request() request,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    return this.billingService.getPaymentDetail(
      String(request.user.id),
      paymentId,
    );
  }
}
