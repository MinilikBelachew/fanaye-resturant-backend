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
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ReconciliationService } from './reconciliation.service';
import {
  ReviewReconciliationDto,
  SubmitReconciliationDto,
} from './dto/reconciliation.dto';
import {
  ReconciliationListResponseDto,
  ReconciliationPreviewResponseDto,
  ReconciliationSubmitResponseDto,
} from './dto/reconciliation-response.dto';

@ApiTags('Reconciliation')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'cashier',
  version: '1',
})
export class CashierReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Get('reconciliation/preview')
  @ApiOkResponse({ type: ReconciliationPreviewResponseDto })
  preview(@Request() request): Promise<ReconciliationPreviewResponseDto> {
    return this.reconciliation.preview(String(request.user.id));
  }

  @Post('reconciliations')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: ReconciliationSubmitResponseDto })
  @HttpCode(HttpStatus.OK)
  submit(
    @Request() request,
    @Body() dto: SubmitReconciliationDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ReconciliationSubmitResponseDto> {
    return this.reconciliation.submit(
      String(request.user.id),
      dto,
      idempotencyKey,
    );
  }
}

@ApiTags('Reconciliation')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'approvals',
  version: '1',
})
export class ManagerReconciliationReviewController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Get('reconciliations')
  @ApiOkResponse({ type: ReconciliationListResponseDto })
  list(@Request() request): Promise<ReconciliationListResponseDto> {
    return this.reconciliation.listForReview(String(request.user.id));
  }
}

@ApiTags('Reconciliation')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'reconciliations',
  version: '1',
})
export class ReconciliationsController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Post(':id/approve')
  @ApiOkResponse({ type: ReconciliationSubmitResponseDto })
  @HttpCode(HttpStatus.OK)
  approve(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewReconciliationDto,
  ): Promise<ReconciliationSubmitResponseDto> {
    return this.reconciliation.approve(String(request.user.id), id, dto);
  }

  @Post(':id/flag')
  @ApiOkResponse({ type: ReconciliationSubmitResponseDto })
  @HttpCode(HttpStatus.OK)
  flag(
    @Request() request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewReconciliationDto,
  ): Promise<ReconciliationSubmitResponseDto> {
    return this.reconciliation.flag(String(request.user.id), id, dto);
  }
}
