import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreateLeaveRequestDto } from './dto/hr.dto';
import { HrService } from './hr.service';

@ApiTags('My HR')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({ path: 'me/hr', version: '1' })
export class MeHrController {
  constructor(private readonly hr: HrService) {}

  @Get('leave')
  listMyLeave(@Request() req) {
    return this.hr.listMyLeave(String(req.user.id));
  }

  @Post('leave')
  requestMyLeave(@Request() req, @Body() dto: CreateLeaveRequestDto) {
    return this.hr.requestMyLeave(String(req.user.id), dto);
  }

  @Patch('leave/:id/cancel')
  cancelMyLeave(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.hr.cancelMyLeave(String(req.user.id), id);
  }
}
