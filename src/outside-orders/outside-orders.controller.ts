import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OutsideOrdersService } from './outside-orders.service';
import {
  CreateOutsideOrderDto,
  UpdateOutsideOrderDto,
} from './dto/create-outside-order.dto';
import {
  AuditMaterialIssueDto,
  IssueOrderMaterialsDto,
  ReturnOrderMaterialsDto,
} from './dto/material-workflow.dto';

@ApiTags('Outside Orders & Materials')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'outside-orders',
  version: '1',
})
export class OutsideOrdersController {
  constructor(private readonly outsideOrders: OutsideOrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Open a new outside order without table session' })
  createOutsideOrder(@Request() req, @Body() dto: CreateOutsideOrderDto) {
    return this.outsideOrders.createOutsideOrder(String(req.user.id), dto);
  }

  @Get()
  @ApiOperation({ summary: 'List outside orders for the active branch' })
  listOutsideOrders(
    @Request() req,
    @Query('status') status?: string,
    @Query('businessDate') businessDate?: string,
    @Query('limit') limit?: number,
  ) {
    return this.outsideOrders.listOutsideOrders(String(req.user.id), {
      status,
      businessDate,
      limit,
    });
  }

  @Get('materials/active')
  @ApiOperation({
    summary: 'List all currently issued / active returnable materials',
  })
  listActiveMaterialIssues(@Request() req) {
    return this.outsideOrders.listActiveMaterialIssues(String(req.user.id));
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get outside order details with orders and materials',
  })
  getOutsideOrder(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.outsideOrders.getOutsideOrder(String(req.user.id), id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update destination or customer details on outside order',
  })
  updateOutsideOrder(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOutsideOrderDto,
  ) {
    return this.outsideOrders.updateOutsideOrder(String(req.user.id), id, dto);
  }

  @Post(':id/close')
  @ApiOperation({
    summary: 'Close outside order after delivery and materials return',
  })
  closeOutsideOrder(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.outsideOrders.closeOutsideOrder(String(req.user.id), id);
  }

  @Post(':id/request-materials')
  @ApiOperation({
    summary: 'Waiter sends tableware/equipment request note to kitchen',
  })
  requestMaterials(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { note: string },
  ) {
    return this.outsideOrders.requestMaterials(
      String(req.user.id),
      id,
      dto.note,
    );
  }

  // ─── Returnable Materials Workflow ─────────────────────────────────────────

  @Post('materials/issue')
  @ApiOperation({ summary: 'Chef checks out returnable materials to waiter' })
  issueMaterials(@Request() req, @Body() dto: IssueOrderMaterialsDto) {
    return this.outsideOrders.issueMaterials(String(req.user.id), dto);
  }

  @Post('materials/:issueId/return')
  @ApiOperation({
    summary: 'Waiter marks materials returned from outside destination',
  })
  returnMaterials(
    @Request() req,
    @Param('issueId', ParseUUIDPipe) issueId: string,
    @Body() dto: ReturnOrderMaterialsDto,
  ) {
    return this.outsideOrders.returnMaterials(
      String(req.user.id),
      issueId,
      dto,
    );
  }

  @Post('materials/:issueId/audit')
  @ApiOperation({
    summary: 'Chef verifies returned materials count & condition',
  })
  auditMaterialIssue(
    @Request() req,
    @Param('issueId', ParseUUIDPipe) issueId: string,
    @Body() dto: AuditMaterialIssueDto,
  ) {
    return this.outsideOrders.auditMaterialIssue(
      String(req.user.id),
      issueId,
      dto,
    );
  }
}
