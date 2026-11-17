import {
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Post,
  Query,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { FloorKioskService } from './floor-kiosk.service';

@ApiTags('Floor Kiosk')
@Controller({
  path: 'floor/kiosk',
  version: '1',
})
export class FloorKioskController {
  constructor(private readonly service: FloorKioskService) {}

  @Post('unlock')
  @ApiOkResponse({
    description:
      'Unlock Shared Floor Tablet Mode with the branch global 4-digit PIN (or Manager PIN).',
  })
  unlock(
    @Body()
    body: {
      tenantIdentifier?: string;
      branchId?: string;
      pin: string;
    },
  ) {
    return this.service.unlockKiosk(body);
  }

  @Get('board')
  @ApiOkResponse({
    description:
      'Get all branch tables, current-shift waiter ownership, and READY kitchen items.',
  })
  getBoard(@Headers('authorization') authHeader?: string) {
    return this.service.getKioskBoard(authHeader);
  }

  @Post('verify-table-access')
  @ApiOkResponse({
    description:
      'Verify waiter 4-digit PIN, active shift, and current-shift table ownership before opening a table.',
  })
  verifyTableAccess(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: { tableId: string; pin: string },
  ) {
    return this.service.verifyTableAccess(authHeader, body);
  }

  @Post('pair-device')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  pairDevice(@Request() request, @Body() body?: { branchId?: string }) {
    const userId = request?.user?.id;
    if (!userId) throw new UnauthorizedException();
    return this.service.pairDevice(String(userId), body?.branchId);
  }

  @Get('settings')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  getSettings(@Request() request, @Query('branchId') branchId?: string) {
    const userId = request?.user?.id;
    if (!userId) throw new UnauthorizedException();
    return this.service.getKioskSettings(String(userId), branchId);
  }

  @Patch('settings')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  updateSettings(
    @Request() request,
    @Body()
    body: {
      branchId?: string;
      floorKioskPin?: string | null;
      readyOverdueMinutes?: number;
    },
  ) {
    const userId = request?.user?.id;
    if (!userId) throw new UnauthorizedException();
    return this.service.updateKioskSettings(String(userId), body);
  }
}

