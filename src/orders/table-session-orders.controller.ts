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
import { OrdersService } from './orders.service';
import { SessionOrdersResponseDto } from './dto/order-response.dto';

@ApiTags('Table sessions')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'table-sessions',
  version: '1',
})
export class TableSessionOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get(':id/orders')
  @ApiOkResponse({ type: SessionOrdersResponseDto })
  list(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SessionOrdersResponseDto> {
    return this.ordersService.listSessionOrders(String(request.user.id), id);
  }
}
