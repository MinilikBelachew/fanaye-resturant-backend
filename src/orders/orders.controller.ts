import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { ConfirmOrderDto } from './dto/confirm-order.dto';
import { ConfirmOrderResponseDto } from './dto/order-response.dto';

@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'orders',
  version: '1',
})
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: ConfirmOrderResponseDto })
  @HttpCode(HttpStatus.OK)
  confirm(
    @Request() request,
    @Body() dto: ConfirmOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ConfirmOrderResponseDto> {
    return this.ordersService.confirmOrder(
      String(request.user.id),
      dto,
      idempotencyKey,
    );
  }
}
