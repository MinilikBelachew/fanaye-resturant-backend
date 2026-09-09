import {
  Body,
  Controller,
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
import { BillRequestCreatedDto } from './dto/billing-response.dto';

@ApiTags('Billing')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'table-sessions',
  version: '1',
})
export class TableSessionBillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post(':id/bill-requests')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: BillRequestCreatedDto })
  @HttpCode(HttpStatus.OK)
  requestBill(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExpectedTableSessionVersionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<BillRequestCreatedDto> {
    return this.billingService.requestBill(
      String(request.user.id),
      id,
      dto,
      idempotencyKey,
    );
  }
}
