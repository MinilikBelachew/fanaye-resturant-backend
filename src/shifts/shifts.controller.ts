import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ShiftsService } from './shifts.service';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import { CurrentShiftResponseDto } from './dto/current-shift-response.dto';
import {
  HandoverCandidateDto,
  ShiftHandoverDto,
  ShiftHandoverResponseDto,
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
}
