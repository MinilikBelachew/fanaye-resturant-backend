import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { ExpectedTableSessionVersionDto } from './dto/expected-table-session-version.dto';
import {
  BillDto,
  BillRequestCreatedDto,
  CashierBillRequestsResponseDto,
} from './dto/billing-response.dto';

@ApiTags('Billing')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'bill-requests',
  version: '1',
})
export class BillRequestsController {
  constructor(private readonly billingService: BillingService) {}

  @Post(':id/generate')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: BillDto })
  @HttpCode(HttpStatus.OK)
  generate(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExpectedTableSessionVersionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<BillDto> {
    return this.billingService.generateBill(
      String(request.user.id),
      id,
      dto,
      idempotencyKey,
    );
  }

  @Delete(':id')
  @ApiOkResponse({ type: BillRequestCreatedDto })
  cancel(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BillRequestCreatedDto> {
    return this.billingService.cancelBillRequest(String(request.user.id), id);
  }
}

@ApiTags('Billing')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'cashier',
  version: '1',
})
export class CashierBillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('bill-requests')
  @ApiOkResponse({ type: CashierBillRequestsResponseDto })
  list(@Request() request): Promise<CashierBillRequestsResponseDto> {
    return this.billingService.listCashierBillRequests(String(request.user.id));
  }
}
