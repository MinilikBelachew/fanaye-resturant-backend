import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ManagerReportsResponseDto } from './dto/manager-reports-response.dto';
import { ManagerReportsService } from './manager-reports.service';

@ApiTags('Manager reports')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'manager/reports',
  version: '1',
})
export class ManagerReportsController {
  constructor(private readonly reports: ManagerReportsService) {}

  @Get()
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['day', 'week', 'month'],
  })
  @ApiQuery({
    name: 'section',
    required: false,
    enum: ['all', 'waiters', 'cancels', 'inventory', 'cash', 'stations'],
  })
  @ApiOkResponse({ type: ManagerReportsResponseDto })
  getReports(
    @Request() request,
    @Query('period') period?: string,
    @Query('section') section?: string,
  ): Promise<ManagerReportsResponseDto> {
    return this.reports.getReports(String(request.user.id), period, section);
  }
}
