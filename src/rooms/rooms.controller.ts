import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CheckInRoomStayDto,
  CreateHotelRoomDto,
  ForceCloseRoomSessionDto,
  OpenRoomSessionDto,
  RedeemBreakfastDto,
  UpdateHotelRoomDto,
  UpdateRoomServiceSettingsDto,
  UpsertRoomFloorCoverageDto,
} from './dto/rooms.dto';
import { RoomsService } from './rooms.service';

@ApiTags('Rooms')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'rooms',
  version: '1',
})
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get('settings')
  getSettings(@Request() request) {
    return this.rooms.getSettings(String(request.user.id));
  }

  @Patch('settings')
  updateSettings(
    @Request() request,
    @Body() dto: UpdateRoomServiceSettingsDto,
  ) {
    return this.rooms.updateSettings(String(request.user.id), dto);
  }

  @Get('hotel-rooms')
  listRooms(@Request() request) {
    return this.rooms.listRooms(String(request.user.id));
  }

  @Post('hotel-rooms')
  @HttpCode(HttpStatus.OK)
  createRoom(@Request() request, @Body() dto: CreateHotelRoomDto) {
    return this.rooms.createRoom(String(request.user.id), dto);
  }

  @Patch('hotel-rooms/:id')
  updateRoom(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHotelRoomDto,
  ) {
    return this.rooms.updateRoom(String(request.user.id), id, dto);
  }

  @Delete('hotel-rooms/:id')
  archiveRoom(@Request() request, @Param('id', ParseUUIDPipe) id: string) {
    return this.rooms.archiveRoom(String(request.user.id), id);
  }

  @Get('stays/in-house')
  listInHouse(@Request() request) {
    return this.rooms.listInHouseStays(String(request.user.id));
  }

  @Post('stays/check-in')
  @HttpCode(HttpStatus.OK)
  checkIn(@Request() request, @Body() dto: CheckInRoomStayDto) {
    return this.rooms.checkIn(String(request.user.id), dto);
  }

  @Post('stays/:id/check-out')
  @HttpCode(HttpStatus.OK)
  checkOut(@Request() request, @Param('id', ParseUUIDPipe) id: string) {
    return this.rooms.checkOut(String(request.user.id), id);
  }

  @Get('stays/:id/entitlements')
  entitlements(@Request() request, @Param('id', ParseUUIDPipe) id: string) {
    return this.rooms.listEntitlements(String(request.user.id), id);
  }

  @Post('breakfast/redeem')
  @HttpCode(HttpStatus.OK)
  redeemBreakfast(@Request() request, @Body() dto: RedeemBreakfastDto) {
    return this.rooms.redeemBreakfast(String(request.user.id), dto);
  }

  @Get('coverages')
  listCoverages(@Request() request) {
    return this.rooms.listCoverages(String(request.user.id));
  }

  @Post('coverages')
  @HttpCode(HttpStatus.OK)
  upsertCoverage(@Request() request, @Body() dto: UpsertRoomFloorCoverageDto) {
    return this.rooms.upsertCoverage(String(request.user.id), dto);
  }

  @Delete('coverages/:id')
  deleteCoverage(@Request() request, @Param('id', ParseUUIDPipe) id: string) {
    return this.rooms.deleteCoverage(String(request.user.id), id);
  }

  @Get('my-rooms')
  myRooms(@Request() request) {
    return this.rooms.listMyRooms(String(request.user.id));
  }

  @Post('sessions')
  @HttpCode(HttpStatus.OK)
  openSession(@Request() request, @Body() dto: OpenRoomSessionDto) {
    return this.rooms.openSession(String(request.user.id), dto);
  }

  @Post('sessions/:id/force-close')
  @HttpCode(HttpStatus.OK)
  forceCloseSession(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ForceCloseRoomSessionDto,
  ) {
    return this.rooms.forceCloseSession(String(request.user.id), id, dto);
  }
}
