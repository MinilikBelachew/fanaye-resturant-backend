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
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { ExpectedRoomSessionVersionDto } from './dto/expected-table-session-version.dto';
import {
  BillRequestCreatedDto,
  SessionBillResponseDto,
} from './dto/billing-response.dto';

@ApiTags('Billing')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'room-sessions',
  version: '1',
})
export class RoomSessionBillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get(':id/bill')
  @ApiOkResponse({ type: SessionBillResponseDto })
  getBill(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SessionBillResponseDto> {
    return this.billingService.getRoomSessionBill(String(request.user.id), id);
  }

  @Post(':id/bill-requests')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: BillRequestCreatedDto })
  @HttpCode(HttpStatus.OK)
  requestBill(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExpectedRoomSessionVersionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<BillRequestCreatedDto> {
    return this.billingService.requestBillForRoom(
      String(request.user.id),
      id,
      dto,
      idempotencyKey,
    );
  }
}
