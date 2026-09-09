import {
  Body,
  Controller,
  Get,
  Headers,
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
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DailyCloseService } from './daily-close.service';
import {
  CreateDailyCloseDto,
  ListDailyClosesQueryDto,
  VersionedDailyCloseDto,
} from './dto/daily-close.dto';
import {
  DailyCloseListResponseDto,
  DailyCloseLockResponseDto,
  DailyClosePreviewResponseDto,
  DailyCloseResponseDto,
} from './dto/daily-close-response.dto';

@ApiTags('Daily close')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'daily-close',
  version: '1',
})
export class DailyClosePreviewController {
  constructor(private readonly dailyClose: DailyCloseService) {}

  @Get('preview')
  @ApiOkResponse({ type: DailyClosePreviewResponseDto })
  preview(
    @Request() request,
    @Query('businessDate') businessDate?: string,
  ): Promise<DailyClosePreviewResponseDto> {
    return this.dailyClose.preview(String(request.user.id), businessDate);
  }
}

@ApiTags('Daily close')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'daily-closes',
  version: '1',
})
export class DailyCloseController {
  constructor(private readonly dailyClose: DailyCloseService) {}

  @Get()
  @ApiOkResponse({ type: DailyCloseListResponseDto })
  list(
    @Request() request,
    @Query() query: ListDailyClosesQueryDto,
  ): Promise<DailyCloseListResponseDto> {
    return this.dailyClose.list(String(request.user.id), query);
  }

  @Get(':id')
  @ApiOkResponse({ type: DailyCloseResponseDto })
  getOne(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DailyCloseResponseDto> {
    return this.dailyClose.getOne(String(request.user.id), id);
  }

  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: DailyCloseResponseDto })
  @HttpCode(HttpStatus.OK)
  create(
    @Request() request,
    @Body() dto: CreateDailyCloseDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<DailyCloseResponseDto> {
    return this.dailyClose.create(String(request.user.id), dto, idempotencyKey);
  }

  @Post(':id/refresh')
  @ApiOkResponse({ type: DailyCloseResponseDto })
  @HttpCode(HttpStatus.OK)
  refresh(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DailyCloseResponseDto> {
    return this.dailyClose.refresh(String(request.user.id), id);
  }

  @Post(':id/approve')
  @ApiOkResponse({ type: DailyCloseResponseDto })
  @HttpCode(HttpStatus.OK)
  approve(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionedDailyCloseDto,
  ): Promise<DailyCloseResponseDto> {
    return this.dailyClose.approve(String(request.user.id), id, dto);
  }

  @Post(':id/lock')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: DailyCloseLockResponseDto })
  @HttpCode(HttpStatus.OK)
  lock(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionedDailyCloseDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<DailyCloseLockResponseDto> {
    return this.dailyClose.lock(
      String(request.user.id),
      id,
      dto,
      idempotencyKey,
    );
  }
}
