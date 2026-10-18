import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CreatePayrollRunDto,
  MarkPayrollPaidDto,
  UpdatePayrollLineDto,
} from './dto/payroll.dto';
import { PayrollService } from './payroll.service';

@ApiTags('Payroll')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({ path: 'admin/payroll', version: '1' })
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('runs')
  listRuns(@Request() req, @Query('branchId') branchId?: string) {
    return this.payroll.listRuns(String(req.user.id), branchId);
  }

  @Post('runs')
  createRun(@Request() req, @Body() dto: CreatePayrollRunDto) {
    return this.payroll.createRun(String(req.user.id), dto);
  }

  @Get('runs/:runId')
  getRun(@Request() req, @Param('runId', ParseUUIDPipe) runId: string) {
    return this.payroll.getRun(String(req.user.id), runId);
  }

  @Patch('runs/:runId/lines/:lineId')
  updateLine(
    @Request() req,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: UpdatePayrollLineDto,
  ) {
    return this.payroll.updateLine(String(req.user.id), runId, lineId, dto);
  }

  @Post('runs/:runId/approve')
  approve(@Request() req, @Param('runId', ParseUUIDPipe) runId: string) {
    return this.payroll.approveRun(String(req.user.id), runId);
  }

  @Post('runs/:runId/mark-paid')
  markPaid(
    @Request() req,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Body() dto: MarkPayrollPaidDto,
  ) {
    return this.payroll.markPaid(String(req.user.id), runId, dto);
  }

  @Get('staff/:membershipId/history')
  staffHistory(
    @Request() req,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ) {
    return this.payroll.listStaffPayHistory(String(req.user.id), membershipId);
  }
}
