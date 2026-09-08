import {
  Controller,
  Get,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
  list(@Request() request) {
    return this.billingService.listPayments(String(request.user.id));
  }
}
