import {
  Body,
  Controller,
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
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import {
  BillDto,
  CashPaymentResponseDto,
  TransferPaymentResponseDto,
} from './dto/billing-response.dto';
import { CashPaymentDto, TransferPaymentDto } from './dto/payment.dto';

@ApiTags('Billing')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'bills',
  version: '1',
})
export class BillsController {
  constructor(private readonly billingService: BillingService) {}

  @Get(':id')
  @ApiOkResponse({ type: BillDto })
  get(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BillDto> {
    return this.billingService.getBill(String(request.user.id), id);
  }

  @Post(':id/payments/cash')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: CashPaymentResponseDto })
  @HttpCode(HttpStatus.OK)
  cash(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CashPaymentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<CashPaymentResponseDto> {
    return this.billingService.payCash(
      String(request.user.id),
      id,
      dto,
      idempotencyKey,
    );
  }

  @Post(':id/payments/transfer')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: TransferPaymentResponseDto })
  @HttpCode(HttpStatus.OK)
  transfer(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferPaymentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<TransferPaymentResponseDto> {
    return this.billingService.payTransfer(
      String(request.user.id),
      id,
      dto,
      idempotencyKey,
    );
  }
}
