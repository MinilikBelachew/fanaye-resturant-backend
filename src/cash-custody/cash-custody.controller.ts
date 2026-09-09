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
  Query,
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
import { CashCustodyService } from './cash-custody.service';
import {
  InitiateCashDropDto,
  ReceiveCashDropDto,
  ResolveCashDropDisputeDto,
} from './dto/cash-drop.dto';
import {
  CashDropDto,
  CashDropQueueResponseDto,
  ReceiveCashDropResponseDto,
  WaiterCashSummaryDto,
} from './dto/cash-drop-response.dto';

@ApiTags('Cash custody')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'waiter',
  version: '1',
})
export class WaiterCashController {
  constructor(private readonly cashCustody: CashCustodyService) {}

  @Get('cash-summary')
  @ApiOkResponse({ type: WaiterCashSummaryDto })
  summary(@Request() request): Promise<WaiterCashSummaryDto> {
    return this.cashCustody.waiterCashSummary(String(request.user.id));
  }

  @Get('cash-drops')
  @ApiOkResponse({ type: CashDropQueueResponseDto })
  myDrops(@Request() request): Promise<CashDropQueueResponseDto> {
    return this.cashCustody.listWaiterDrops(String(request.user.id));
  }
}

@ApiTags('Cash custody')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'cash-drops',
  version: '1',
})
export class CashDropsController {
  constructor(private readonly cashCustody: CashCustodyService) {}

  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: CashDropDto })
  @HttpCode(HttpStatus.OK)
  initiate(
    @Request() request,
    @Body() dto: InitiateCashDropDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<CashDropDto> {
    return this.cashCustody.initiateDrop(
      String(request.user.id),
      dto,
      idempotencyKey,
    );
  }

  @Post(':id/receive')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: ReceiveCashDropResponseDto })
  @HttpCode(HttpStatus.OK)
  receive(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceiveCashDropDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ReceiveCashDropResponseDto> {
    return this.cashCustody.receiveDrop(
      String(request.user.id),
      id,
      dto,
      idempotencyKey,
    );
  }
}

@ApiTags('Cash custody')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'cashier',
  version: '1',
})
export class CashierCashDropsController {
  constructor(private readonly cashCustody: CashCustodyService) {}

  @Get('cash-drops')
  @ApiOkResponse({ type: CashDropQueueResponseDto })
  queue(
    @Request() request,
    @Query('status') status?: string,
  ): Promise<CashDropQueueResponseDto> {
    return this.cashCustody.listCashierDrops(String(request.user.id), status);
  }
}

@ApiTags('Cash custody')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'cash-drop-disputes',
  version: '1',
})
export class CashDropDisputesController {
  constructor(private readonly cashCustody: CashCustodyService) {}

  @Post(':id/resolve')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: CashDropDto })
  @HttpCode(HttpStatus.OK)
  resolve(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveCashDropDisputeDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<CashDropDto> {
    return this.cashCustody.resolveDispute(
      String(request.user.id),
      id,
      dto,
      idempotencyKey,
    );
  }
}
