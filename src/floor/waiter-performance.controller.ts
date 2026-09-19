import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { WaiterPerformanceResponseDto } from './dto/waiter-performance-response.dto';
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
}
