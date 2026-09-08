import {
  Controller,
  Get,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ManagerDashboardService } from './manager-dashboard.service';
import { ManagerDashboardResponseDto } from './dto/manager-dashboard-response.dto';

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
}
