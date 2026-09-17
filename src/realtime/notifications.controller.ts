import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'notifications',
  version: '1',
})
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOkResponse({
    description: 'Paginated inbox for the current staff membership',
  })
  list(
    @Request() request,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notifications.listForUser(String(request.user.id), {
      unreadOnly: unreadOnly === '1' || unreadOnly === 'true',
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  @Patch('read-all')
  markAllRead(@Request() request) {
    return this.notifications.markAllRead(String(request.user.id));
  }

  @Patch(':id/read')
  markRead(@Request() request, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(String(request.user.id), id);
  }
}
