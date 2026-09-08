import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { WaiterMenuResponseDto } from './dto/waiter-menu-response.dto';

@ApiTags('Waiter menu')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'waiter/menu',
  version: '1',
})
export class WaiterMenuController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiQuery({ name: 'tableSessionId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'periodId', required: false })
  @ApiOkResponse({ type: WaiterMenuResponseDto })
  list(
    @Request() request,
    @Query('tableSessionId') tableSessionId?: string,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('periodId') periodId?: string,
  ): Promise<WaiterMenuResponseDto> {
    return this.ordersService.waiterMenu(String(request.user.id), {
      tableSessionId,
      search,
      categoryId,
      periodId,
    });
  }
}
