import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CreateLeaveRequestDto,
  CreateLeaveTypeDto,
  DecideLeaveRequestDto,
  HrListQueryDto,
  SetStaffLeaveOverridesDto,
  UpdateLeaveTypeDto,
} from './dto/hr.dto';
import { HrService } from './hr.service';

@ApiTags('HR')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({ path: 'admin/hr', version: '1' })
export class HrController {
  constructor(private readonly hr: HrService) {}

  @Get('attendance')
  listAttendance(@Request() req, @Query() query: HrListQueryDto) {
    return this.hr.listAttendance(String(req.user.id), query);
  }

  @Get('leave-types')
  listLeaveTypes(@Request() req) {
    return this.hr.listLeaveTypes(String(req.user.id), false);
  }

  @Post('leave-types')
  createLeaveType(@Request() req, @Body() dto: CreateLeaveTypeDto) {
    return this.hr.createLeaveType(String(req.user.id), dto);
  }

  @Patch('leave-types/:id')
  updateLeaveType(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeaveTypeDto,
  ) {
    return this.hr.updateLeaveType(String(req.user.id), id, dto);
  }

  @Delete('leave-types/:id')
  deleteLeaveType(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.hr.deleteLeaveType(String(req.user.id), id);
  }

  @Get('leave-balances/:membershipId')
  listStaffLeaveBalances(
    @Request() req,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ) {
    return this.hr.listStaffLeaveBalances(String(req.user.id), membershipId);
  }

  @Put('leave-overrides')
  setStaffLeaveOverrides(
    @Request() req,
    @Body() dto: SetStaffLeaveOverridesDto,
  ) {
    return this.hr.setStaffLeaveOverrides(String(req.user.id), dto);
  }

  @Get('leave')
  listLeave(@Request() req, @Query() query: HrListQueryDto) {
    return this.hr.listLeave(String(req.user.id), query);
  }

  @Post('leave')
  createLeave(@Request() req, @Body() dto: CreateLeaveRequestDto) {
    return this.hr.createLeave(String(req.user.id), dto);
  }

  @Patch('leave/:id/decide')
  decideLeave(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideLeaveRequestDto,
  ) {
    return this.hr.decideLeave(String(req.user.id), id, dto);
  }
}
