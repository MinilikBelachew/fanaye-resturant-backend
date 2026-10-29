import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import { OpsGateway } from '../realtime/ops.gateway';
import { OpsEventType } from '../realtime/ops-events';
import {
  CreateOutsideOrderDto,
  UpdateOutsideOrderDto,
} from './dto/create-outside-order.dto';
import {
  AuditMaterialIssueDto,
  IssueOrderMaterialsDto,
  ReturnOrderMaterialsDto,
} from './dto/material-workflow.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class OutsideOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identityContext: IdentityContextService,
    private readonly realtime: OpsGateway,
  ) {}

  private async requireStaffContext(userId: string) {
    const ctx = await this.identityContext.getByUserId(userId);
    if (!ctx.tenantId || !ctx.branchId) {
      throw new ForbiddenException('Branch access required.');
    }
    return ctx;
  }

  private async requireWaiterShift(userId: string) {
    const ctx = await this.requireStaffContext(userId);
    if (!ctx.staffMembershipId || !ctx.shiftSessionId) {
      throw new ForbiddenException({
        status: 403,
        code: 'SHIFT_REQUIRED',
        message: 'You must be on an active shift to manage outside orders.',
      });
    }
    return ctx;
  }

  // ─── OUTSIDE ORDERS CRUD ──────────────────────────────────────────────────

  async createOutsideOrder(userId: string, dto: CreateOutsideOrderDto) {
    const ctx = await this.requireWaiterShift(userId);

    const shift = await this.prisma.shiftSession.findUnique({
      where: { id: ctx.shiftSessionId! },
    });
    if (!shift) {
      throw new NotFoundException('Shift session not found.');
    }

    const businessDate = shift.businessDate;

    const outsideOrder = await this.prisma.outsideOrder.create({
      data: {
        tenantId: ctx.tenantId!,
        branchId: ctx.branchId!,
        businessDate,
        destinationType: dto.destinationType,
        destinationName: dto.destinationName.trim(),
        destinationNote: dto.destinationNote?.trim() || null,
        customerName: dto.customerName?.trim() || null,
        customerPhone: dto.customerPhone?.trim() || null,
        createdByMembershipId: ctx.staffMembershipId!,
        waiterShiftSessionId: ctx.shiftSessionId!,
        requiresMaterialReturn: dto.requiresMaterialReturn ?? true,
        status: 'OPEN',
      },
      include: {
        createdBy: { select: { id: true, employeeDisplayName: true } },
      },
    });

    this.realtime.dispatch({
      type: OpsEventType.OUTSIDE_ORDER_OPENED,
      tenantId: ctx.tenantId!,
      branchId: ctx.branchId!,
      severity: 'INFO',
      title: `Outside order opened: ${outsideOrder.destinationName}`,
      payload: {
        outsideOrderId: outsideOrder.id,
        destinationName: outsideOrder.destinationName,
        customerName: outsideOrder.customerName,
        waiterName: outsideOrder.createdBy.employeeDisplayName,
      },
    });

    return { data: outsideOrder };
  }

  async listOutsideOrders(
    userId: string,
    query: { status?: string; businessDate?: string; limit?: number },
  ) {
    const ctx = await this.requireStaffContext(userId);

    const where: Prisma.OutsideOrderWhereInput = {
      tenantId: ctx.tenantId!,
      branchId: ctx.branchId!,
      ...(query.status ? { status: query.status } : {}),
      ...(query.businessDate
        ? { businessDate: new Date(query.businessDate) }
        : {}),
    };

    const rows = await this.prisma.outsideOrder.findMany({
      where,
      orderBy: { openedAt: 'desc' },
      take: query.limit ? Math.min(100, query.limit) : 50,
      include: {
        createdBy: { select: { id: true, employeeDisplayName: true } },
        orders: {
          select: {
            id: true,
            status: true,
            items: {
              select: {
                id: true,
                itemNameSnapshot: true,
                quantity: true,
                state: true,
              },
            },
          },
        },
        bills: {
          select: {
            id: true,
            status: true,
            totalAmount: true,
            subtotalAmount: true,
          },
        },
      },
    });

    // Also fetch material issues for these orders
    const orderIds = rows.flatMap((r) => r.orders.map((o) => o.id));
    const materialIssues = orderIds.length
      ? await this.prisma.orderMaterialIssue.findMany({
          where: { orderId: { in: orderIds } },
          include: { lines: true },
        })
      : [];

    const issuesByOrder = new Map<string, typeof materialIssues>();
    for (const issue of materialIssues) {
      const list = issuesByOrder.get(issue.orderId) ?? [];
      list.push(issue);
      issuesByOrder.set(issue.orderId, list);
    }

    const data = rows.map((row) => {
      const issues = row.orders.flatMap((o) => issuesByOrder.get(o.id) ?? []);
      let totalIssued = 0;
      let totalReturned = 0;
      let totalShortfall = 0;
      let hasDispute = false;

      for (const issue of issues) {
        if (issue.status === 'DISPUTED') hasDispute = true;
        for (const line of issue.lines) {
          totalIssued += Number(line.qtyIssued);
          totalReturned += Number(line.qtyReturned);
          totalShortfall += Number(line.qtyShortfall);
        }
      }

      return {
        id: row.id,
        destinationType: row.destinationType,
        destinationName: row.destinationName,
        destinationNote: row.destinationNote,
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        status: row.status,
        requiresMaterialReturn: row.requiresMaterialReturn,
        openedAt: row.openedAt,
        closedAt: row.closedAt,
        version: row.version,
        waiter: {
          id: row.createdBy.id,
          name: row.createdBy.employeeDisplayName,
        },
        ordersCount: row.orders.length,
        itemsCount: row.orders.reduce((sum, o) => sum + o.items.length, 0),
        bill: row.bills[0] ?? null,
        materialsSummary: {
          totalIssued,
          totalReturned,
          totalShortfall,
          hasDispute,
          issuesCount: issues.length,
          allReturned:
            totalIssued > 0 && totalReturned + totalShortfall >= totalIssued,
        },
      };
    });

    return { data };
  }

  async getOutsideOrder(userId: string, id: string) {
    const ctx = await this.requireStaffContext(userId);

    const row = await this.prisma.outsideOrder.findFirst({
      where: { id, tenantId: ctx.tenantId!, branchId: ctx.branchId! },
      include: {
        createdBy: { select: { id: true, employeeDisplayName: true } },
        closedBy: { select: { id: true, employeeDisplayName: true } },
        orders: {
          include: {
            items: {
              include: { modifiers: true },
              orderBy: { confirmedAt: 'asc' },
            },
          },
          orderBy: { confirmedAt: 'asc' },
        },
        bills: true,
        billRequests: true,
      },
    });

    if (!row) {
      throw new NotFoundException('Outside order not found.');
    }

    const orderIds = row.orders.map((o) => o.id);
    const materialIssues = orderIds.length
      ? await this.prisma.orderMaterialIssue.findMany({
          where: { orderId: { in: orderIds } },
          include: {
            lines: { include: { material: true } },
            issuedBy: { select: { id: true, employeeDisplayName: true } },
            approvedBy: { select: { id: true, employeeDisplayName: true } },
          },
          orderBy: { issuedAt: 'desc' },
        })
      : [];

    return {
      data: {
        ...row,
        materialIssues,
      },
    };
  }

  async updateOutsideOrder(
    userId: string,
    id: string,
    dto: UpdateOutsideOrderDto,
  ) {
    const ctx = await this.requireStaffContext(userId);

    const existing = await this.prisma.outsideOrder.findFirst({
      where: { id, tenantId: ctx.tenantId!, branchId: ctx.branchId! },
    });
    if (!existing) {
      throw new NotFoundException('Outside order not found.');
    }
    if (existing.status === 'CLOSED') {
      throw new BadRequestException('Cannot modify closed outside orders.');
    }

    const updated = await this.prisma.outsideOrder.update({
      where: { id },
      data: {
        ...(dto.destinationType
          ? { destinationType: dto.destinationType }
          : {}),
        ...(dto.destinationName
          ? { destinationName: dto.destinationName.trim() }
          : {}),
        ...(dto.destinationNote !== undefined
          ? { destinationNote: dto.destinationNote?.trim() || null }
          : {}),
        ...(dto.customerName !== undefined
          ? { customerName: dto.customerName?.trim() || null }
          : {}),
        ...(dto.customerPhone !== undefined
          ? { customerPhone: dto.customerPhone?.trim() || null }
          : {}),
        ...(dto.status ? { status: dto.status } : {}),
        version: { increment: 1 },
      },
    });

    return { data: updated };
  }

  async closeOutsideOrder(userId: string, id: string) {
    const ctx = await this.requireStaffContext(userId);

    const existing = await this.prisma.outsideOrder.findFirst({
      where: { id, tenantId: ctx.tenantId!, branchId: ctx.branchId! },
      include: {
        orders: { select: { id: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException('Outside order not found.');
    }
    if (existing.status === 'CLOSED') {
      return { data: existing };
    }

    // Check material custody if required
    if (existing.requiresMaterialReturn) {
      const orderIds = existing.orders.map((o) => o.id);
      if (orderIds.length) {
        const pendingIssues = await this.prisma.orderMaterialIssue.count({
          where: {
            orderId: { in: orderIds },
            status: { in: ['PENDING', 'ISSUED', 'RETURNED', 'DISPUTED'] },
          },
        });
        if (pendingIssues > 0) {
          throw new BadRequestException({
            status: 400,
            code: 'MATERIALS_OUTSTANDING',
            message:
              'Cannot close outside order: Returnable materials are still out or awaiting chef verification.',
          });
        }
      }
    }

    const closed = await this.prisma.outsideOrder.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closedByMembershipId: ctx.staffMembershipId,
        version: { increment: 1 },
      },
    });

    return { data: closed };
  }

  async requestMaterials(userId: string, outsideOrderId: string, note: string) {
    const ctx = await this.requireStaffContext(userId);

    const outsideOrder = await this.prisma.outsideOrder.findFirst({
      where: {
        id: outsideOrderId,
        tenantId: ctx.tenantId!,
        branchId: ctx.branchId!,
      },
      include: {
        createdBy: { select: { employeeDisplayName: true } },
      },
    });
    if (!outsideOrder) {
      throw new NotFoundException('Outside order not found.');
    }

    const waiterName = outsideOrder.createdBy?.employeeDisplayName || 'Waiter';
    const destName = outsideOrder.destinationName;

    try {
      const stationStaff = await this.prisma.staffRoleAssignment.findMany({
        where: {
          branchId: ctx.branchId!,
          status: 'ACTIVE',
          role: {
            code: { in: ['STATION_OPERATOR', 'MANAGER', 'HEAD_CHEF', 'CHEF'] },
          },
        },
        select: { staffMembershipId: true },
      });

      for (const staff of stationStaff) {
        await this.prisma.notification.create({
          data: {
            tenantId: ctx.tenantId!,
            branchId: ctx.branchId!,
            recipientStaffMembershipId: staff.staffMembershipId,
            type: 'MATERIAL_ISSUE_REQUESTED',
            severity: 'INFO',
            title: `Material Request · ${destName}`,
            body: `${waiterName} requested: "${note}"`,
            payloadJson: {
              outsideOrderId,
              destinationName: destName,
              note,
            },
          },
        });
      }
    } catch {
      // Continue
    }

    this.realtime.dispatch({
      type: 'material.issue.requested' as any,
      tenantId: ctx.tenantId!,
      branchId: ctx.branchId!,
      severity: 'INFO',
      title: `Material Request · ${destName}`,
      body: `${waiterName} requested: ${note}`,
      payload: {
        outsideOrderId,
        destinationName: destName,
        note,
      },
    });

    return {
      data: { success: true, message: 'Request sent to kitchen station.' },
    };
  }

  // ─── MATERIALS ISSUE & RETURN WORKFLOW ────────────────────────────────────

  async issueMaterials(userId: string, dto: IssueOrderMaterialsDto) {
    const ctx = await this.requireStaffContext(userId);

    // Order must exist
    let orderId = dto.orderId;
    if (!orderId && dto.outsideOrderId) {
      const latestOrder = await this.prisma.order.findFirst({
        where: { outsideOrderId: dto.outsideOrderId, branchId: ctx.branchId! },
        orderBy: { confirmedAt: 'desc' },
      });
      if (!latestOrder) {
        throw new NotFoundException(
          'No active order found for this outside order container.',
        );
      }
      orderId = latestOrder.id;
    }

    if (!orderId) {
      throw new BadRequestException(
        'Either orderId or outsideOrderId is required.',
      );
    }

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId: ctx.tenantId!, branchId: ctx.branchId! },
      include: { outsideOrder: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    const materialIds = dto.lines.map((l) => l.materialId);
    const materials = await this.prisma.inventoryMaterial.findMany({
      where: { id: { in: materialIds }, tenantId: ctx.tenantId! },
    });
    const materialMap = new Map(materials.map((m) => [m.id, m]));

    for (const line of dto.lines) {
      if (!materialMap.has(line.materialId)) {
        throw new NotFoundException(`Material ${line.materialId} not found.`);
      }
    }

    // Run issue in a transaction: creates OrderMaterialIssue + updates InventoryMaterialBalance
    const issue = await this.prisma.$transaction(async (tx) => {
      const createdIssue = await tx.orderMaterialIssue.create({
        data: {
          tenantId: ctx.tenantId!,
          branchId: ctx.branchId!,
          businessDate: order.businessDate,
          orderId: order.id,
          issuedByChefMembershipId: ctx.staffMembershipId!,
          waiterMembershipId: order.createdByWaiterMembershipId,
          waiterShiftSessionId: order.waiterShiftSessionId,
          status: 'ISSUED',
          note: dto.note?.trim() || null,
          lines: {
            create: dto.lines.map((line) => {
              const mat = materialMap.get(line.materialId)!;
              return {
                tenantId: ctx.tenantId!,
                materialId: line.materialId,
                materialNameSnapshot: mat.name,
                qtyIssued: line.quantity,
                qtyReturned: 0,
                qtyShortfall: 0,
                condition: 'OK',
                note: line.note?.trim() || null,
              };
            }),
          },
        },
        include: {
          lines: true,
        },
      });

      // Update Inventory balances: decrement onHandQty, increment issuedQty
      for (const line of dto.lines) {
        const bal = await tx.inventoryMaterialBalance.findFirst({
          where: {
            tenantId: ctx.tenantId!,
            branchId: ctx.branchId!,
            materialId: line.materialId,
          },
        });
        if (bal) {
          await tx.inventoryMaterialBalance.update({
            where: { id: bal.id },
            data: {
              onHandQty: { decrement: line.quantity },
              issuedQty: { increment: line.quantity },
              version: { increment: 1 },
            },
          });
        }
      }

      return createdIssue;
    });

    this.realtime.dispatch({
      type: OpsEventType.MATERIAL_ISSUE_ISSUED,
      tenantId: ctx.tenantId!,
      branchId: ctx.branchId!,
      severity: 'INFO',
      title: `Materials issued for order ${order.id.slice(0, 8)}`,
      payload: {
        issueId: issue.id,
        orderId: order.id,
        waiterMembershipId: order.createdByWaiterMembershipId,
        itemsCount: dto.lines.length,
      },
    });

    return { data: issue };
  }

  async returnMaterials(
    userId: string,
    issueId: string,
    dto: ReturnOrderMaterialsDto,
  ) {
    const ctx = await this.requireStaffContext(userId);

    const issue = await this.prisma.orderMaterialIssue.findFirst({
      where: { id: issueId, tenantId: ctx.tenantId!, branchId: ctx.branchId! },
      include: {
        lines: true,
        order: {
          include: {
            outsideOrder: true,
          },
        },
        waiter: {
          select: { employeeDisplayName: true },
        },
      },
    });
    if (!issue) {
      throw new NotFoundException('Material issue record not found.');
    }
    if (['APPROVED', 'CANCELLED'].includes(issue.status)) {
      throw new BadRequestException(
        'This material issue is already completed or cancelled.',
      );
    }

    const lineMap = new Map(issue.lines.map((l) => [l.id, l]));

    await this.prisma.$transaction(async (tx) => {
      for (const ret of dto.lines) {
        const line = lineMap.get(ret.lineId);
        if (!line) continue;

        const qtyIssued = Number(line.qtyIssued);
        const qtyReturned = Math.min(qtyIssued, ret.qtyReturned);
        const qtyShortfall = Math.max(0, qtyIssued - qtyReturned);

        await tx.orderMaterialIssueLine.update({
          where: { id: ret.lineId },
          data: {
            qtyReturned,
            qtyShortfall,
            condition: ret.condition || 'OK',
            note: ret.note?.trim() || line.note,
          },
        });
      }

      await tx.orderMaterialIssue.update({
        where: { id: issueId },
        data: {
          status: 'RETURNED',
          returnedAt: new Date(),
          note: dto.note
            ? `${issue.note ? issue.note + ' | ' : ''}Return: ${dto.note}`
            : issue.note,
          version: { increment: 1 },
        },
      });
    });

    const destinationLabel =
      (issue.order as any)?.outsideOrder?.destinationName || 'Outside Order';
    const waiterName = (issue.waiter as any)?.employeeDisplayName || 'Waiter';

    const recipientIds = new Set<string>();
    if (issue.issuedByChefMembershipId) {
      recipientIds.add(issue.issuedByChefMembershipId);
    }

    try {
      const stationStaff = await this.prisma.staffRoleAssignment.findMany({
        where: {
          branchId: ctx.branchId!,
          status: 'ACTIVE',
          role: {
            code: { in: ['STATION_OPERATOR', 'MANAGER', 'OWNER_ADMIN'] },
          },
        },
        select: { staffMembershipId: true },
      });
      for (const s of stationStaff) {
        recipientIds.add(s.staffMembershipId);
      }

      for (const recipientId of recipientIds) {
        await this.prisma.notification.create({
          data: {
            tenantId: ctx.tenantId!,
            branchId: ctx.branchId!,
            recipientStaffMembershipId: recipientId,
            type: 'MATERIAL_ISSUE_RETURNED',
            severity: 'INFO',
            title: `Materials Returned · ${destinationLabel}`,
            body: `${waiterName} returned tableware for ${destinationLabel}. Ready for kitchen audit.`,
            payloadJson: {
              issueId,
              orderId: issue.orderId,
              destinationName: destinationLabel,
            },
          },
        });
      }
    } catch {
      // Continue without failing return transaction
    }

    this.realtime.dispatch({
      type: OpsEventType.MATERIAL_ISSUE_RETURNED,
      tenantId: ctx.tenantId!,
      branchId: ctx.branchId!,
      severity: 'INFO',
      title: `Materials returned · ${destinationLabel}`,
      body: `${waiterName} returned tableware for ${destinationLabel}. Ready for kitchen audit.`,
      payload: {
        issueId,
        orderId: issue.orderId,
        destinationName: destinationLabel,
      },
    });

    return {
      data: {
        success: true,
        message: 'Return recorded, awaiting chef verification.',
      },
    };
  }

  async auditMaterialIssue(
    userId: string,
    issueId: string,
    dto: AuditMaterialIssueDto,
  ) {
    const ctx = await this.requireStaffContext(userId);

    const issue = await this.prisma.orderMaterialIssue.findFirst({
      where: { id: issueId, tenantId: ctx.tenantId!, branchId: ctx.branchId! },
      include: {
        lines: true,
        order: {
          include: {
            outsideOrder: true,
          },
        },
        waiter: {
          select: { employeeDisplayName: true },
        },
      },
    });
    if (!issue) {
      throw new NotFoundException('Material issue not found.');
    }

    if (dto.action === 'DISPUTE') {
      const disputed = await this.prisma.orderMaterialIssue.update({
        where: { id: issueId },
        data: {
          status: 'DISPUTED',
          disputeReason:
            dto.disputeReason || 'Items missing or damaged upon inspection.',
          version: { increment: 1 },
        },
      });

      const destinationLabel =
        (issue.order as any)?.outsideOrder?.destinationName || 'Outside Order';
      const waiterName = (issue.waiter as any)?.employeeDisplayName || 'Waiter';

      try {
        const managerStaff = await this.prisma.staffRoleAssignment.findMany({
          where: {
            branchId: ctx.branchId!,
            status: 'ACTIVE',
            role: { code: { in: ['MANAGER', 'OWNER_ADMIN'] } },
          },
          select: { staffMembershipId: true },
        });

        const notifyRecipients = new Set<string>();
        if (issue.waiterMembershipId)
          notifyRecipients.add(issue.waiterMembershipId);
        for (const m of managerStaff) notifyRecipients.add(m.staffMembershipId);

        for (const recipientId of notifyRecipients) {
          await this.prisma.notification.create({
            data: {
              tenantId: ctx.tenantId!,
              branchId: ctx.branchId!,
              recipientStaffMembershipId: recipientId,
              type: 'MATERIAL_ISSUE_DISPUTED',
              severity: 'ATTENTION',
              title: `Tableware Shortfall Disputed · ${destinationLabel}`,
              body: `Chef flagged missing/damaged tableware for ${waiterName} (${destinationLabel}): ${dto.disputeReason || 'Disputed'}`,
              payloadJson: {
                issueId,
                orderId: issue.orderId,
                destinationName: destinationLabel,
                disputeReason: dto.disputeReason,
              },
            },
          });
        }
      } catch {
        // ignore notification persistence error
      }

      this.realtime.dispatch({
        type: OpsEventType.MATERIAL_ISSUE_DISPUTED,
        tenantId: ctx.tenantId!,
        branchId: ctx.branchId!,
        severity: 'ATTENTION',
        title: `Tableware Shortfall Disputed · ${destinationLabel}`,
        body: `Chef flagged missing/damaged tableware for ${waiterName} (${destinationLabel}): ${dto.disputeReason || 'Disputed'}`,
        payload: {
          issueId,
          orderId: issue.orderId,
          destinationName: destinationLabel,
          disputeReason: dto.disputeReason,
        },
      });

      return { data: disputed };
    }

    // ACTION === 'APPROVE'
    const approved = await this.prisma.$transaction(async (tx) => {
      const updatedIssue = await tx.orderMaterialIssue.update({
        where: { id: issueId },
        data: {
          status: 'APPROVED',
          approvedByChefMembershipId: ctx.staffMembershipId,
          approvedAt: new Date(),
          version: { increment: 1 },
        },
      });

      // Update balances: decrement issuedQty, and if shortfall > 0, increment lostQty
      for (const line of issue.lines) {
        const qtyIssued = Number(line.qtyIssued);
        const qtyReturned = Number(line.qtyReturned);
        const qtyShortfall = Number(line.qtyShortfall);

        const bal = await tx.inventoryMaterialBalance.findFirst({
          where: {
            tenantId: ctx.tenantId!,
            branchId: ctx.branchId!,
            materialId: line.materialId,
          },
        });

        if (bal) {
          await tx.inventoryMaterialBalance.update({
            where: { id: bal.id },
            data: {
              issuedQty: { decrement: qtyIssued },
              onHandQty: { increment: qtyReturned },
              lostQty: { increment: qtyShortfall },
              version: { increment: 1 },
            },
          });
        }
      }

      return updatedIssue;
    });

    this.realtime.dispatch({
      type: OpsEventType.MATERIAL_ISSUE_APPROVED,
      tenantId: ctx.tenantId!,
      branchId: ctx.branchId!,
      severity: 'INFO',
      title: `Material return approved for order ${issue.orderId.slice(0, 8)}`,
      payload: {
        issueId,
        orderId: issue.orderId,
        status: 'APPROVED',
      },
    });

    return { data: approved };
  }

  async listActiveMaterialIssues(userId: string) {
    const ctx = await this.requireStaffContext(userId);

    const issues = await this.prisma.orderMaterialIssue.findMany({
      where: {
        tenantId: ctx.tenantId!,
        branchId: ctx.branchId!,
        status: { in: ['PENDING', 'ISSUED', 'RETURNED', 'DISPUTED'] },
      },
      include: {
        lines: { include: { material: true } },
        issuedBy: { select: { id: true, employeeDisplayName: true } },
        waiter: { select: { id: true, employeeDisplayName: true } },
        order: {
          select: {
            id: true,
            outsideOrder: {
              select: {
                id: true,
                destinationName: true,
                customerName: true,
              },
            },
          },
        },
      },
      orderBy: { issuedAt: 'desc' },
    });

    return { data: issues };
  }
}
