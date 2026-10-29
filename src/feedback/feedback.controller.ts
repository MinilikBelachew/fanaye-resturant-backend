import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { FeedbackService } from './feedback.service';
import {
  FeedbackItemDto,
  FeedbackListQueryDto,
  FeedbackListResponseDto,
  FeedbackSummaryDto,
  PublicFeedbackSummaryDto,
  SubmitFeedbackDto,
  SubmitFeedbackResponseDto,
  SubmitTableFeedbackDto,
  UpdateFeedbackStatusDto,
} from './dto/feedback.dto';

@ApiTags('Public Feedback')
@Controller({
  path: 'public/r',
  version: '1',
})
export class PublicFeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Get(':slug/feedback/summary')
  @ApiOkResponse({ type: PublicFeedbackSummaryDto })
  getSummary(@Param('slug') slug: string): Promise<PublicFeedbackSummaryDto> {
    return this.feedbackService.getPublicSummary(slug);
  }

  @Post(':slug/tables/:tableId/feedback')
  @ApiOkResponse({ type: SubmitFeedbackResponseDto })
  submitTableFeedback(
    @Param('slug') slug: string,
    @Param('tableId') tableId: string,
    @Body() dto: SubmitTableFeedbackDto,
  ): Promise<SubmitFeedbackResponseDto> {
    return this.feedbackService.submitTableFeedback(slug, tableId, dto);
  }

  @Post(':slug/feedback')
  @ApiOkResponse({ type: SubmitFeedbackResponseDto })
  submitWebsiteFeedback(
    @Param('slug') slug: string,
    @Body() dto: SubmitFeedbackDto,
  ): Promise<SubmitFeedbackResponseDto> {
    return this.feedbackService.submitWebsiteFeedback(slug, dto);
  }
}

@ApiTags('Admin Feedback')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'admin/feedback',
  version: '1',
})
export class AdminFeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Get()
  @ApiOkResponse({ type: FeedbackListResponseDto })
  list(
    @Request() request,
    @Query() query: FeedbackListQueryDto,
  ): Promise<FeedbackListResponseDto> {
    return this.feedbackService.list(String(request.user.id), query);
  }

  @Get('summary')
  @ApiOkResponse({ type: FeedbackSummaryDto })
  summary(@Request() request): Promise<FeedbackSummaryDto> {
    return this.feedbackService.summary(String(request.user.id));
  }

  @Patch(':id')
  @ApiOkResponse({ type: FeedbackItemDto })
  updateStatus(
    @Request() request,
    @Param('id') id: string,
    @Body() dto: UpdateFeedbackStatusDto,
  ): Promise<FeedbackItemDto> {
    return this.feedbackService.updateStatus(
      String(request.user.id),
      id,
      dto.status,
    );
  }
}
