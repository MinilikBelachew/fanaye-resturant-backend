import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ExpectedVersionDto } from './dto/expected-version.dto';
import { ServedOrderItemDto } from './dto/order-response.dto';
import { OrdersService } from './orders.service';

@ApiTags('Order items')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'order-items',
  version: '1',
})
export class OrderItemsServedController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post(':id/served')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ServedOrderItemDto })
  served(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExpectedVersionDto,
  ): Promise<ServedOrderItemDto> {
    return this.ordersService.markServed(
      String(request.user.id),
      id,
      dto.expectedVersion,
    );
  }
}
