import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { StaffCoverageService } from './staff-coverage.service';
import {
  CreateAdminStaffDto,
  CreateShiftDefinitionDto,
  SetWaiterTableCoverageDto,
  UpdateAdminStaffDto,
  UpdateShiftDefinitionDto,
} from './dto/staff-coverage.dto';
import {
  AdminShiftDefinitionListResponseDto,
  AdminShiftDefinitionResponseDto,
  AdminShiftFloorResponseDto,
  AdminStaffListResponseDto,
  AdminStaffMemberResponseDto,
  AdminWaiterCoverageResponseDto,
} from './dto/staff-coverage-response.dto';

@ApiTags('Staff coverage admin')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'admin',
  version: '1',
})
export class StaffCoverageController {
  constructor(private readonly staff: StaffCoverageService) {}

  @Get('staff')
  @ApiOkResponse({ type: AdminStaffListResponseDto })
  listStaff(@Request() request): Promise<AdminStaffListResponseDto> {
    return this.staff.listStaff(String(request.user.id));
  }

  @Post('staff')
  @ApiOkResponse({ type: AdminStaffMemberResponseDto })
  @HttpCode(HttpStatus.OK)
  createStaff(
    @Request() request,
    @Body() dto: CreateAdminStaffDto,
  ): Promise<AdminStaffMemberResponseDto> {
    return this.staff.createStaff(String(request.user.id), dto);
  }

  @Patch('staff/:membershipId')
  @ApiOkResponse({ type: AdminStaffMemberResponseDto })
  updateStaff(
    @Request() request,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: UpdateAdminStaffDto,
  ): Promise<AdminStaffMemberResponseDto> {
    return this.staff.updateStaff(String(request.user.id), membershipId, dto);
  }

  @Get('shift-definitions')
  @ApiOkResponse({ type: AdminShiftDefinitionListResponseDto })
  listShifts(@Request() request): Promise<AdminShiftDefinitionListResponseDto> {
    return this.staff.listShifts(String(request.user.id));
  }

  @Get('shift-definitions/:id/floor')
  @ApiOkResponse({ type: AdminShiftFloorResponseDto })
  shiftFloor(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminShiftFloorResponseDto> {
    return this.staff.shiftFloor(String(request.user.id), id);
  }

  @Post('shift-definitions')
  @ApiOkResponse({ type: AdminShiftDefinitionResponseDto })
  @HttpCode(HttpStatus.OK)
  createShift(
    @Request() request,
    @Body() dto: CreateShiftDefinitionDto,
  ): Promise<AdminShiftDefinitionResponseDto> {
    return this.staff.createShift(String(request.user.id), dto);
  }

  @Patch('shift-definitions/:id')
  @ApiOkResponse({ type: AdminShiftDefinitionResponseDto })
  updateShift(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShiftDefinitionDto,
  ): Promise<AdminShiftDefinitionResponseDto> {
    return this.staff.updateShift(String(request.user.id), id, dto);
  }

  @Put('staff/:membershipId/table-coverage')
  @ApiOkResponse({ type: AdminWaiterCoverageResponseDto })
  setCoverage(
    @Request() request,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: SetWaiterTableCoverageDto,
  ): Promise<AdminWaiterCoverageResponseDto> {
    return this.staff.setWaiterCoverage(
      String(request.user.id),
      membershipId,
      dto,
    );
  }
}
