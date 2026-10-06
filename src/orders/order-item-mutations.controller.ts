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
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { OrderItemMutationsService } from './order-item-mutations.service';
import {
  CancelOrderItemDto,
  CreateChangeRequestDto,
  DecideCancellationDto,
  DecideChangeDto,
} from './dto/order-item-mutation.dto';
import {
  ApprovalDetailResponseDto,
  ApprovalHistoryResponseDto,
  ApprovalQueueResponseDto,
  MutationDataResponseDto,
} from './dto/order-item-mutation-response.dto';

@ApiTags('Order item mutations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'order-items',
  version: '1',
})
export class OrderItemMutationsController {
  constructor(private readonly mutations: OrderItemMutationsService) {}

  @Post(':id/cancel')
  @ApiOkResponse({ type: MutationDataResponseDto })
  @HttpCode(HttpStatus.OK)
  cancel(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderItemDto,
  ): Promise<MutationDataResponseDto> {
    return this.mutations.directCancel(String(request.user.id), id, dto);
  }

  @Post(':id/cancellation-requests')
  @ApiOkResponse({ type: MutationDataResponseDto })
  @HttpCode(HttpStatus.OK)
  requestCancel(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderItemDto,
  ): Promise<MutationDataResponseDto> {
    return this.mutations.requestCancellation(String(request.user.id), id, dto);
  }

  @Post(':id/change-requests')
  @ApiOkResponse({ type: MutationDataResponseDto })
  @HttpCode(HttpStatus.OK)
  change(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateChangeRequestDto,
  ): Promise<MutationDataResponseDto> {
    return this.mutations.requestChange(String(request.user.id), id, dto);
  }
}

@ApiTags('Order item mutations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'approvals',
  version: '1',
})
export class OrderApprovalsController {
  constructor(private readonly mutations: OrderItemMutationsService) {}

  @Get('order-mutations')
  @ApiOkResponse({ type: ApprovalQueueResponseDto })
  list(@Request() request): Promise<ApprovalQueueResponseDto> {
    return this.mutations.listApprovals(String(request.user.id));
  }

  @Get('order-mutations/history')
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['day', 'week', 'month'],
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['CANCELLATION', 'CHANGE', 'ALL'],
  })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOkResponse({ type: ApprovalHistoryResponseDto })
  history(
    @Request() request,
    @Query('period') period?: string,
    @Query('type') type?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<ApprovalHistoryResponseDto> {
    return this.mutations.listApprovalHistory(String(request.user.id), {
      period,
      type,
      q,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('order-mutations/:type/:requestId')
  @ApiOkResponse({ type: ApprovalDetailResponseDto })
  detail(
    @Request() request,
    @Param('type') type: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ): Promise<ApprovalDetailResponseDto> {
    return this.mutations.getApprovalDetail(
      String(request.user.id),
      type,
      requestId,
    );
  }

  @Get('cancellations')
  @ApiOkResponse({ type: ApprovalQueueResponseDto })
  listCancellations(@Request() request): Promise<ApprovalQueueResponseDto> {
    return this.mutations.listApprovals(String(request.user.id));
  }
}

@ApiTags('Order item mutations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'cancellation-requests',
  version: '1',
})
export class CancellationRequestsController {
  constructor(private readonly mutations: OrderItemMutationsService) {}

  @Post(':id/approve')
  @ApiOkResponse({ type: MutationDataResponseDto })
  @HttpCode(HttpStatus.OK)
  approve(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideCancellationDto,
  ): Promise<MutationDataResponseDto> {
    return this.mutations.approveCancellation(String(request.user.id), id, dto);
  }

  @Post(':id/reject')
  @ApiOkResponse({ type: MutationDataResponseDto })
  @HttpCode(HttpStatus.OK)
  reject(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideCancellationDto,
  ): Promise<MutationDataResponseDto> {
    return this.mutations.rejectCancellation(String(request.user.id), id, dto);
  }
}

@ApiTags('Order item mutations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'change-requests',
  version: '1',
})
export class ChangeRequestsController {
  constructor(private readonly mutations: OrderItemMutationsService) {}

  @Post(':id/approve')
  @ApiOkResponse({ type: MutationDataResponseDto })
  @HttpCode(HttpStatus.OK)
  approve(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideChangeDto,
  ): Promise<MutationDataResponseDto> {
    return this.mutations.approveChange(String(request.user.id), id, dto);
  }

  @Post(':id/reject')
  @ApiOkResponse({ type: MutationDataResponseDto })
  @HttpCode(HttpStatus.OK)
  reject(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideChangeDto,
  ): Promise<MutationDataResponseDto> {
    return this.mutations.rejectChange(String(request.user.id), id, dto);
  }
}
