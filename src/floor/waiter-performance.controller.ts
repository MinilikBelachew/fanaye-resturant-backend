import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { WaiterPerformanceResponseDto } from './dto/waiter-performance-response.dto';
import {
  WaiterDetailResponseDto,
  WaiterOrderHistoryResponseDto,
} from './dto/waiter-detail.dto';
import { WaiterPerformanceService } from './waiter-performance.service';

@ApiTags('Waiter performance')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'manager/waiters',
  version: '1',
})
export class WaiterPerformanceController {
  constructor(private readonly performance: WaiterPerformanceService) {}

  @Get()
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['day', 'week', 'month'],
  })
  @ApiOkResponse({ type: WaiterPerformanceResponseDto })
  list(
    @Request() request,
    @Query('period') period?: string,
  ): Promise<WaiterPerformanceResponseDto> {
    return this.performance.list(String(request.user.id), period);
  }

  @Get(':membershipId/detail')
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['day', 'week', 'month'],
  })
  @ApiOkResponse({ type: WaiterDetailResponseDto })
  detail(
    @Request() request,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Query('period') period?: string,
  ): Promise<WaiterDetailResponseDto> {
    return this.performance.getDetail(
      String(request.user.id),
      membershipId,
      period,
    );
  }

  @Get(':membershipId/orders')
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['day', 'week', 'month'],
  })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOkResponse({ type: WaiterOrderHistoryResponseDto })
  orders(
    @Request() request,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Query('period') period?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<WaiterOrderHistoryResponseDto> {
    return this.performance.listOrders(String(request.user.id), membershipId, {
      period,
      q,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
