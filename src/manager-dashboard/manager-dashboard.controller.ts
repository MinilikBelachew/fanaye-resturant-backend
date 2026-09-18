import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ManagerDashboardService } from './manager-dashboard.service';
import {
  BranchRevenueResponseDto,
  ManagerDashboardResponseDto,
} from './dto/manager-dashboard-response.dto';

@ApiTags('Manager dashboard')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'manager/dashboard',
  version: '1',
})
export class ManagerDashboardController {
  constructor(
    private readonly managerDashboardService: ManagerDashboardService,
  ) {}

  @Get()
  @ApiQuery({ name: 'businessDate', required: false })
  @ApiOkResponse({ type: ManagerDashboardResponseDto })
  getDashboard(
    @Request() request,
    @Query('businessDate') businessDate?: string,
  ): Promise<ManagerDashboardResponseDto> {
    return this.managerDashboardService.getDashboard(
      String(request.user.id),
      businessDate,
    );
  }

  @Get('branch-revenue')
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['month', 'quarter', 'year'],
  })
  @ApiOkResponse({ type: BranchRevenueResponseDto })
  getBranchRevenue(
    @Request() request,
    @Query('period') period?: string,
  ): Promise<BranchRevenueResponseDto> {
    return this.managerDashboardService.getBranchRevenue(
      String(request.user.id),
      period,
    );
  }
}
