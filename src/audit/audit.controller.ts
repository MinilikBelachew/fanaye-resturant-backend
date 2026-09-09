import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { AuditListResponseDto } from './dto/audit-response.dto';

@ApiTags('Audit')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'audit',
  version: '1',
})
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('events')
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOkResponse({ type: AuditListResponseDto })
  list(
    @Request() request,
    @Query('category') category?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ): Promise<AuditListResponseDto> {
    return this.audit.list(String(request.user.id), {
      category,
      q,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
