import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ShiftsService } from './shifts.service';
import {
  ActiveShiftSummaryDto,
  ManagerForceClockOutDto,
  ManagerForceClockOutResponseDto,
  ManagerForceCloseCashierDrawerDto,
  ManagerForceCloseCashierResponseDto,
} from './dto/manager-force-clock-out.dto';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import { CurrentShiftResponseDto } from './dto/current-shift-response.dto';
import {
  HandoverCandidateDto,
  ShiftHandoverDetailDto,
  ShiftHandoverDto,
  ShiftHandoverResponseDto,
  ShiftHandoversResponseDto,
  WaiterShiftHandoverDto,
  WaiterShiftHandoverResponseDto,
} from './dto/shift-handover.dto';

@ApiTags('Shifts')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'shifts',
  version: '1',
})
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Get('current')
  @ApiOkResponse({ type: CurrentShiftResponseDto })
  @HttpCode(HttpStatus.OK)
  current(@Request() request): Promise<CurrentShiftResponseDto> {
    return this.shiftsService.getCurrent(String(request.user.id));
  }

  @Post('clock-in')
  @ApiOkResponse({ type: CurrentShiftResponseDto })
  @HttpCode(HttpStatus.OK)
  clockIn(
    @Request() request,
    @Body() dto: ClockInDto = {},
  ): Promise<CurrentShiftResponseDto> {
    return this.shiftsService.clockIn(String(request.user.id), dto);
  }

  @Post(':shiftSessionId/clock-out')
  @ApiOkResponse({ type: CurrentShiftResponseDto })
  @HttpCode(HttpStatus.OK)
  clockOut(
    @Request() request,
    @Param('shiftSessionId', ParseUUIDPipe) shiftSessionId: string,
    @Body() dto: ClockOutDto,
  ): Promise<CurrentShiftResponseDto> {
    return this.shiftsService.clockOut(
      String(request.user.id),
      shiftSessionId,
      dto,
    );
  }

  @Get('handover-candidates')
  @ApiOkResponse({ type: [HandoverCandidateDto] })
  @HttpCode(HttpStatus.OK)
  getHandoverCandidates(@Request() request): Promise<HandoverCandidateDto[]> {
    return this.shiftsService.getHandoverCandidates(String(request.user.id));
  }

  @Post('handover')
  @ApiOkResponse({ type: ShiftHandoverResponseDto })
  @HttpCode(HttpStatus.OK)
  handover(
    @Request() request,
    @Body() dto: ShiftHandoverDto,
  ): Promise<ShiftHandoverResponseDto> {
    return this.shiftsService.handover(String(request.user.id), dto);
  }

  @Get('waiter-handover-candidates')
  @ApiOkResponse({ type: [HandoverCandidateDto] })
  @HttpCode(HttpStatus.OK)
  getWaiterHandoverCandidates(
    @Request() request,
  ): Promise<HandoverCandidateDto[]> {
    return this.shiftsService.getWaiterHandoverCandidates(
      String(request.user.id),
    );
  }

  @Post('waiter-handover')
  @ApiOkResponse({ type: WaiterShiftHandoverResponseDto })
  @HttpCode(HttpStatus.OK)
  waiterHandover(
    @Request() request,
    @Body() dto: WaiterShiftHandoverDto,
  ): Promise<WaiterShiftHandoverResponseDto> {
    return this.shiftsService.waiterHandover(String(request.user.id), dto);
  }

  @Get('manager/active-sessions')
  @ApiOkResponse({ type: [ActiveShiftSummaryDto] })
  @HttpCode(HttpStatus.OK)
  listManagerActiveSessions(
    @Request() request,
  ): Promise<ActiveShiftSummaryDto[]> {
    return this.shiftsService.listManagerActiveSessions(
      String(request.user.id),
    );
  }

  @Get('manager/handovers')
  @ApiOkResponse({ type: ShiftHandoversResponseDto })
  @HttpCode(HttpStatus.OK)
  listManagerHandovers(
    @Request() request,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('kind') kind?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<ShiftHandoversResponseDto> {
    return this.shiftsService.listManagerHandovers(String(request.user.id), {
      from,
      to,
      kind,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('manager/handovers/:id')
  @ApiOkResponse({ type: ShiftHandoverDetailDto })
  @HttpCode(HttpStatus.OK)
  getManagerHandoverDetail(
    @Request() request,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ShiftHandoverDetailDto> {
    return this.shiftsService.getManagerHandoverDetail(
      String(request.user.id),
      id,
    );
  }

  @Post('manager/force-clock-out')
  @ApiOkResponse({ type: ManagerForceClockOutResponseDto })
  @HttpCode(HttpStatus.OK)
  managerForceClockOut(
    @Request() request,
    @Body() dto: ManagerForceClockOutDto,
  ): Promise<ManagerForceClockOutResponseDto> {
    return this.shiftsService.managerForceClockOut(
      String(request.user.id),
      dto,
    );
  }
  @Post('manager/force-close-cashier-drawer')
  @ApiOkResponse({ type: ManagerForceCloseCashierResponseDto })
  @HttpCode(HttpStatus.OK)
  managerForceCloseCashierDrawer(
    @Request() request,
    @Body() dto: ManagerForceCloseCashierDrawerDto,
  ): Promise<ManagerForceCloseCashierResponseDto> {
    return this.shiftsService.managerForceCloseCashierDrawer(
      String(request.user.id),
      dto,
    );
  }
}
