import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';
import { AuthContextDto } from '../identity/dto/auth-context.dto';
import { InventoryService } from '../inventory/inventory.service';
import { OpsEventType } from '../realtime/ops-events';
import { OpsNotifyService } from '../realtime/ops-notify.service';
import { managerRoom } from '../realtime/ops-rooms';
import {
  CancelOrderItemDto,
  CreateChangeRequestDto,
  DecideCancellationDto,
  DecideChangeDto,
} from './dto/order-item-mutation.dto';
import {
  ApprovalDetailResponseDto,
  ApprovalHistoryResponseDto,
  ApprovalQueueItemDto,
  ApprovalQueueResponseDto,
  MutationDataResponseDto,
  OrderItemMutationResultDto,
} from './dto/order-item-mutation-response.dto';

const DIRECT_CANCEL_STATES = ['CONFIRMED', 'QUEUED', 'ACKNOWLEDGED'];
const PROTECTED_CANCEL_STATES = ['IN_PREPARATION', 'READY'];
const DIRECT_CHANGE_STATES = ['QUEUED', 'ACKNOWLEDGED'];
const PROTECTED_CHANGE_STATES = ['IN_PREPARATION', 'READY'];
const WAITER_ROLES = ['WAITER', 'DISPATCHER', 'MANAGER', 'OWNER_ADMIN'];
const SHIFT_OWNER_ROLES = ['WAITER', 'DISPATCHER'];
const APPROVER_ROLES = ['MANAGER', 'OWNER_ADMIN'];

type ApprovalPeriod = 'day' | 'week' | 'month';

const approvalItemInclude = {
  requestedBy: true,
  decidedBy: true,
  orderItem: {
    include: {
      tableSession: { include: { table: true } },
    },
  },
} as const;

@Injectable()
export class OrderItemMutationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
    private readonly opsNotify: OpsNotifyService,
    private readonly inventory: InventoryService,
  ) {}

  async directCancel(
    userId: string,
    orderItemId: string,
    dto: CancelOrderItemDto,
  ): Promise<MutationDataResponseDto> {
    const context = await this.requireWaiterOnShift(userId);
    const item = await this.loadOwnedItem(context, orderItemId);
    this.assertVersion(item.version, dto.expectedVersion);

    if (!DIRECT_CANCEL_STATES.includes(item.state)) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'ORDER_ITEM_NOT_CANCELLABLE',
        errors: {
          state: item.state,
          hint: 'Use a cancellation request — item already started.',
        },
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.orderItem.update({
        where: { id: item.id },
        data: {
          state: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledByMembershipId: context.staffMembershipId!,
          cancellationReason: dto.reason.trim(),
          version: { increment: 1 },
        },
      });
      await this.inventory.reverseForOrderItem(
        tx,
        {
          id: cancelled.id,
          tenantId: cancelled.tenantId,
          branchId: cancelled.branchId,
        },
        context.staffMembershipId,
      );
      return cancelled;
    });

    return {
      data: {
        orderItemId: updated.id,
        state: updated.state,
        version: updated.version,
        itemName: updated.itemNameSnapshot,
        cancelledAt: updated.cancelledAt,
      },
    };
  }

  async requestCancellation(
    userId: string,
    orderItemId: string,
    dto: CancelOrderItemDto,
  ): Promise<MutationDataResponseDto> {
    const context = await this.requireWaiterOnShift(userId);
    const item = await this.loadOwnedItem(context, orderItemId);
    this.assertVersion(item.version, dto.expectedVersion);

    if (DIRECT_CANCEL_STATES.includes(item.state)) {
      return this.directCancel(userId, orderItemId, dto);
    }
    if (!PROTECTED_CANCEL_STATES.includes(item.state)) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'ORDER_ITEM_NOT_CANCELLABLE',
        errors: { state: item.state },
      });
    }

    const pending = await this.prisma.cancellationRequest.findFirst({
      where: { orderItemId: item.id, status: 'PENDING' },
    });
    if (pending) {
      throw new ConflictException({
        status: 409,
        code: 'CANCELLATION_ALREADY_PENDING',
        errors: { cancellationRequestId: pending.id },
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const request = await tx.cancellationRequest.create({
        data: {
          tenantId: context.tenantId!,
          branchId: context.branchId!,
          orderItemId: item.id,
          requestedByMembershipId: context.staffMembershipId!,
          reason: dto.reason.trim(),
          stateAtRequest: item.state,
          status: 'PENDING',
        },
      });
      const updated = await tx.orderItem.update({
        where: { id: item.id },
        data: {
          state: 'CANCELLATION_REQUESTED',
          version: { increment: 1 },
        },
      });
      return { request, updated };
    });

    await this.opsNotify.notify({
      type: OpsEventType.APPROVAL_REQUESTED,
      tenantId: context.tenantId!,
      branchId: context.branchId!,
      severity: 'URGENT',
      title: `Cancel approval · ${result.updated.itemNameSnapshot}`,
      body: dto.reason.trim(),
      rooms: [managerRoom(context.branchId!)],
      relatedEntityType: 'CancellationRequest',
      relatedEntityId: result.request.id,
      payload: {
        requestType: 'CANCELLATION',
        requestId: result.request.id,
        orderItemId: result.updated.id,
        itemName: result.updated.itemNameSnapshot,
      },
    });

    return {
      data: {
        orderItemId: result.updated.id,
        state: result.updated.state,
        version: result.updated.version,
        itemName: result.updated.itemNameSnapshot,
        cancellationRequestId: result.request.id,
        status: result.request.status,
      },
    };
  }

  async requestChange(
    userId: string,
    orderItemId: string,
    dto: CreateChangeRequestDto,
  ): Promise<MutationDataResponseDto> {
    const context = await this.requireWaiterOnShift(userId);
    const item = await this.loadOwnedItem(context, orderItemId);
    this.assertVersion(item.version, dto.expectedVersion);

    const change = dto.requestedChange ?? {};
    if (
      change.menuItemId === undefined &&
      change.specialInstruction === undefined
    ) {
      throw new UnprocessableEntityException({
        status: 422,
        errors: { requestedChange: 'empty' },
      });
    }

    if (DIRECT_CHANGE_STATES.includes(item.state)) {
      const updated = await this.applyChange(
        context,
        item,
        change,
        dto.reason?.trim() || null,
        true,
      );
      return { data: updated };
    }

    if (!PROTECTED_CHANGE_STATES.includes(item.state)) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'ORDER_ITEM_NOT_CHANGEABLE',
        errors: { state: item.state },
      });
    }

    const pending = await this.prisma.orderChangeRequest.findFirst({
      where: { orderItemId: item.id, status: 'PENDING' },
    });
    if (pending) {
      throw new ConflictException({
        status: 409,
        code: 'CHANGE_ALREADY_PENDING',
        errors: { changeRequestId: pending.id },
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const request = await tx.orderChangeRequest.create({
        data: {
          tenantId: context.tenantId!,
          branchId: context.branchId!,
          orderItemId: item.id,
          requestedByMembershipId: context.staffMembershipId!,
          reason: dto.reason?.trim() || null,
          requestedChangeJson: change as Prisma.InputJsonValue,
          stateAtRequest: item.state,
          status: 'PENDING',
        },
      });
      const updated = await tx.orderItem.update({
        where: { id: item.id },
        data: {
          state: 'CHANGE_REQUESTED',
          version: { increment: 1 },
        },
      });
      return { request, updated };
    });

    await this.opsNotify.notify({
      type: OpsEventType.APPROVAL_REQUESTED,
      tenantId: context.tenantId!,
      branchId: context.branchId!,
      severity: 'URGENT',
      title: `Change approval · ${result.updated.itemNameSnapshot}`,
      body: dto.reason?.trim() || 'Waiter requested an item change.',
      rooms: [managerRoom(context.branchId!)],
      relatedEntityType: 'OrderChangeRequest',
      relatedEntityId: result.request.id,
      payload: {
        requestType: 'CHANGE',
        requestId: result.request.id,
        orderItemId: result.updated.id,
        itemName: result.updated.itemNameSnapshot,
      },
    });

    return {
      data: {
        orderItemId: result.updated.id,
        state: result.updated.state,
        version: result.updated.version,
        itemName: result.updated.itemNameSnapshot,
        changeRequestId: result.request.id,
        status: result.request.status,
        applied: false,
      },
    };
  }

  async listApprovals(userId: string): Promise<ApprovalQueueResponseDto> {
    const context = await this.requireApprover(userId);
    const [cancellations, changes] = await Promise.all([
      this.prisma.cancellationRequest.findMany({
        where: { branchId: context.branchId!, status: 'PENDING' },
        include: approvalItemInclude,
        orderBy: { requestedAt: 'asc' },
        take: 50,
      }),
      this.prisma.orderChangeRequest.findMany({
        where: { branchId: context.branchId!, status: 'PENDING' },
        include: approvalItemInclude,
        orderBy: { requestedAt: 'asc' },
        take: 50,
      }),
    ]);

    const data = [
      ...cancellations.map((row) => this.mapCancellationApproval(row)),
      ...changes.map((row) => this.mapChangeApproval(row)),
    ].sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime());

    return {
      data,
      summary: {
        pendingCount: data.length,
        cancellationCount: data.filter((r) => r.type === 'CANCELLATION').length,
        changeCount: data.filter((r) => r.type === 'CHANGE').length,
      },
    };
  }

  async getApprovalDetail(
    userId: string,
    typeRaw: string,
    requestId: string,
  ): Promise<ApprovalDetailResponseDto> {
    const context = await this.requireApprover(userId);
    const type = this.parseApprovalType(typeRaw);
    if (type === 'CANCELLATION') {
      const row = await this.prisma.cancellationRequest.findFirst({
        where: { id: requestId, branchId: context.branchId! },
        include: approvalItemInclude,
      });
      if (!row) throw new NotFoundException('Approval request not found.');
      return { data: this.mapCancellationApproval(row) };
    }

    const row = await this.prisma.orderChangeRequest.findFirst({
      where: { id: requestId, branchId: context.branchId! },
      include: approvalItemInclude,
    });
    if (!row) throw new NotFoundException('Approval request not found.');
    return { data: this.mapChangeApproval(row) };
  }

  async listApprovalHistory(
    userId: string,
    opts?: {
      period?: string;
      type?: string;
      q?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<ApprovalHistoryResponseDto> {
    const context = await this.requireApprover(userId);
    const period = this.parseApprovalPeriod(opts?.period);
    const { from, to } = this.approvalRangeFor(period);
    const typeFilter = this.parseApprovalTypeFilter(opts?.type);
    const q = opts?.q?.trim() || '';
    const page = Math.max(1, opts?.page ?? 1);
    const limit = Math.min(50, Math.max(1, opts?.limit ?? 20));

    const baseWhere = {
      branchId: context.branchId!,
      status: { not: 'PENDING' },
      requestedAt: { gte: from, lte: to },
    };

    const [cancellations, changes] = await Promise.all([
      typeFilter === 'CHANGE'
        ? Promise.resolve([])
        : this.prisma.cancellationRequest.findMany({
            where: baseWhere,
            include: approvalItemInclude,
            orderBy: { requestedAt: 'desc' },
          }),
      typeFilter === 'CANCELLATION'
        ? Promise.resolve([])
        : this.prisma.orderChangeRequest.findMany({
            where: baseWhere,
            include: approvalItemInclude,
            orderBy: { requestedAt: 'desc' },
          }),
    ]);

    let data = [
      ...cancellations.map((row) => this.mapCancellationApproval(row)),
      ...changes.map((row) => this.mapChangeApproval(row)),
    ].sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());

    if (q) {
      const needle = q.toLowerCase();
      data = data.filter(
        (row) =>
          row.itemName.toLowerCase().includes(needle) ||
          row.tableDisplayName.toLowerCase().includes(needle) ||
          row.requestedByName.toLowerCase().includes(needle) ||
          (row.stationName || '').toLowerCase().includes(needle) ||
          (row.reason || '').toLowerCase().includes(needle),
      );
    }

    const total = data.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const slice = data.slice((page - 1) * limit, page * limit);

    return {
      period,
      from: this.ymd(from),
      to: this.ymd(to),
      data: slice,
      pagination: { page, limit, total, totalPages },
    };
  }

  async approveCancellation(
    userId: string,
    requestId: string,
    dto: DecideCancellationDto,
  ): Promise<MutationDataResponseDto> {
    return this.decideCancellation(userId, requestId, dto, true);
  }

  async rejectCancellation(
    userId: string,
    requestId: string,
    dto: DecideCancellationDto,
  ): Promise<MutationDataResponseDto> {
    return this.decideCancellation(userId, requestId, dto, false);
  }

  async approveChange(
    userId: string,
    requestId: string,
    dto: DecideChangeDto,
  ): Promise<MutationDataResponseDto> {
    return this.decideChange(userId, requestId, dto, true);
  }

  async rejectChange(
    userId: string,
    requestId: string,
    dto: DecideChangeDto,
  ): Promise<MutationDataResponseDto> {
    return this.decideChange(userId, requestId, dto, false);
  }

  private async decideCancellation(
    userId: string,
    requestId: string,
    dto: DecideCancellationDto,
    approve: boolean,
  ): Promise<MutationDataResponseDto> {
    const context = await this.requireApprover(userId);
    const request = await this.prisma.cancellationRequest.findFirst({
      where: { id: requestId, branchId: context.branchId! },
      include: { orderItem: true },
    });
    if (!request)
      throw new NotFoundException('Cancellation request not found.');
    if (request.status !== 'PENDING') {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'CANCELLATION_NOT_PENDING',
        errors: { status: request.status },
      });
    }
    this.assertVersion(request.orderItem.version, dto.expectedOrderItemVersion);

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.cancellationRequest.update({
        where: { id: request.id },
        data: {
          status: approve ? 'APPROVED' : 'REJECTED',
          decidedByMembershipId: context.staffMembershipId!,
          decidedAt: now,
          decisionReason: dto.decisionReason?.trim() || null,
        },
      });

      if (approve) {
        const updated = await tx.orderItem.update({
          where: { id: request.orderItemId },
          data: {
            state: 'CANCELLED',
            cancelledAt: now,
            cancelledByMembershipId: context.staffMembershipId!,
            cancellationReason: request.reason,
            version: { increment: 1 },
          },
        });
        await this.inventory.reverseForOrderItem(
          tx,
          {
            id: updated.id,
            tenantId: updated.tenantId,
            branchId: updated.branchId,
          },
          context.staffMembershipId,
        );
        return updated;
      }

      return tx.orderItem.update({
        where: { id: request.orderItemId },
        data: {
          state: request.stateAtRequest,
          version: { increment: 1 },
        },
      });
    });

    await this.opsNotify.notify({
      type: OpsEventType.APPROVAL_DECIDED,
      tenantId: context.tenantId!,
      branchId: context.branchId!,
      severity: 'ATTENTION',
      title: approve
        ? `Cancel approved · ${result.itemNameSnapshot}`
        : `Cancel rejected · ${result.itemNameSnapshot}`,
      body: dto.decisionReason?.trim() || null,
      recipientMembershipId: request.requestedByMembershipId,
      relatedEntityType: 'CancellationRequest',
      relatedEntityId: request.id,
      payload: {
        requestType: 'CANCELLATION',
        requestId: request.id,
        orderItemId: result.id,
        status: approve ? 'APPROVED' : 'REJECTED',
      },
    });

    return {
      data: {
        orderItemId: result.id,
        state: result.state,
        version: result.version,
        itemName: result.itemNameSnapshot,
        cancellationRequestId: request.id,
        status: approve ? 'APPROVED' : 'REJECTED',
        cancelledAt: result.cancelledAt,
      },
    };
  }

  private async decideChange(
    userId: string,
    requestId: string,
    dto: DecideChangeDto,
    approve: boolean,
  ): Promise<MutationDataResponseDto> {
    const context = await this.requireApprover(userId);
    const request = await this.prisma.orderChangeRequest.findFirst({
      where: { id: requestId, branchId: context.branchId! },
      include: { orderItem: true },
    });
    if (!request) throw new NotFoundException('Change request not found.');
    if (request.status !== 'PENDING') {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'CHANGE_NOT_PENDING',
        errors: { status: request.status },
      });
    }
    this.assertVersion(request.orderItem.version, dto.expectedOrderItemVersion);

    const now = new Date();
    if (!approve) {
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.orderChangeRequest.update({
          where: { id: request.id },
          data: {
            status: 'REJECTED',
            decidedByMembershipId: context.staffMembershipId!,
            decidedAt: now,
            decisionReason: dto.decisionReason?.trim() || null,
          },
        });
        return tx.orderItem.update({
          where: { id: request.orderItemId },
          data: {
            state: request.stateAtRequest,
            version: { increment: 1 },
          },
        });
      });
      await this.opsNotify.notify({
        type: OpsEventType.APPROVAL_DECIDED,
        tenantId: context.tenantId!,
        branchId: context.branchId!,
        severity: 'ATTENTION',
        title: `Change rejected · ${updated.itemNameSnapshot}`,
        body: dto.decisionReason?.trim() || null,
        recipientMembershipId: request.requestedByMembershipId,
        relatedEntityType: 'OrderChangeRequest',
        relatedEntityId: request.id,
        payload: {
          requestType: 'CHANGE',
          requestId: request.id,
          orderItemId: updated.id,
          status: 'REJECTED',
        },
      });
      return {
        data: {
          orderItemId: updated.id,
          state: updated.state,
          version: updated.version,
          itemName: updated.itemNameSnapshot,
          changeRequestId: request.id,
          status: 'REJECTED',
          applied: false,
        },
      };
    }

    const change = (request.requestedChangeJson ?? {}) as {
      menuItemId?: string;
      specialInstruction?: string | null;
    };
    const applied = await this.applyChange(
      context,
      request.orderItem,
      change,
      request.reason,
      false,
    );

    await this.prisma.orderChangeRequest.update({
      where: { id: request.id },
      data: {
        status: 'APPLIED',
        decidedByMembershipId: context.staffMembershipId!,
        decidedAt: now,
        decisionReason: dto.decisionReason?.trim() || null,
      },
    });

    await this.opsNotify.notify({
      type: OpsEventType.APPROVAL_DECIDED,
      tenantId: context.tenantId!,
      branchId: context.branchId!,
      severity: 'ATTENTION',
      title: `Change approved · ${applied.itemName}`,
      body: dto.decisionReason?.trim() || null,
      recipientMembershipId: request.requestedByMembershipId,
      relatedEntityType: 'OrderChangeRequest',
      relatedEntityId: request.id,
      payload: {
        requestType: 'CHANGE',
        requestId: request.id,
        orderItemId: applied.orderItemId,
        status: 'APPLIED',
      },
    });

    return {
      data: {
        ...applied,
        changeRequestId: request.id,
        status: 'APPLIED',
      },
    };
  }

  private async applyChange(
    context: AuthContextDto,
    item: {
      id: string;
      branchId: string;
      tenantId: string;
      state: string;
      version: number;
      itemNameSnapshot: string;
      specialInstruction: string | null;
    },
    change: {
      menuItemId?: string;
      specialInstruction?: string | null;
    },
    reason: string | null,
    createAppliedRequest: boolean,
  ): Promise<OrderItemMutationResultDto> {
    let menuPatch: Prisma.OrderItemUpdateInput = {};
    if (change.menuItemId) {
      const menuItem = await this.prisma.menuItem.findFirst({
        where: {
          id: change.menuItemId,
          status: 'ACTIVE',
          menu: {
            tenantId: context.tenantId!,
            status: 'ACTIVE',
            OR: [{ branchId: context.branchId! }, { branchId: null }],
          },
        },
        include: { station: true },
      });
      if (
        !menuItem ||
        !menuItem.station ||
        menuItem.station.status !== 'ACTIVE'
      ) {
        throw new UnprocessableEntityException({
          status: 422,
          code: 'MENU_ITEM_UNAVAILABLE',
          errors: { menuItemId: change.menuItemId },
        });
      }
      if (menuItem.soldOut) {
        throw new UnprocessableEntityException({
          status: 422,
          code: 'MENU_ITEM_SOLD_OUT',
          errors: { menuItemId: change.menuItemId },
        });
      }
      menuPatch = {
        menuItem: { connect: { id: menuItem.id } },
        itemNameSnapshot: menuItem.name,
        unitPriceSnapshot: menuItem.currentPrice,
        currencyCode: menuItem.currencyCode,
        originalStation: { connect: { id: menuItem.station.id } },
        currentStation: { connect: { id: menuItem.station.id } },
        stationNameSnapshot: menuItem.station.name,
        expectedPrepMinutesSnapshot: menuItem.expectedPrepMinutes,
        // New dish goes back to queue so kitchen sees burger instead of pizza.
        state: 'QUEUED',
        queuedAt: new Date(),
        acknowledgedAt: null,
        preparationStartedAt: null,
        readyAt: null,
        modifiers: { deleteMany: {} },
      };
    }

    const instructionPatch =
      change.specialInstruction !== undefined
        ? {
            specialInstruction:
              change.specialInstruction === null ||
              change.specialInstruction.trim() === ''
                ? null
                : change.specialInstruction.trim(),
          }
        : {};

    const statePatch = change.menuItemId
      ? {}
      : {
          // Instruction-only change on early items keeps current state.
          state: DIRECT_CHANGE_STATES.includes(item.state)
            ? item.state
            : 'QUEUED',
        };

    const updated = await this.prisma.$transaction(async (tx) => {
      if (createAppliedRequest) {
        await tx.orderChangeRequest.create({
          data: {
            tenantId: context.tenantId!,
            branchId: context.branchId!,
            orderItemId: item.id,
            requestedByMembershipId: context.staffMembershipId!,
            reason,
            requestedChangeJson: change as Prisma.InputJsonValue,
            stateAtRequest: item.state,
            status: 'APPLIED',
            decidedByMembershipId: context.staffMembershipId!,
            decidedAt: new Date(),
            decisionReason: 'Applied while still pre-preparation',
          },
        });
      }

      return tx.orderItem.update({
        where: { id: item.id },
        data: {
          ...menuPatch,
          ...instructionPatch,
          ...statePatch,
          version: { increment: 1 },
        },
      });
    });

    return {
      orderItemId: updated.id,
      state: updated.state,
      version: updated.version,
      itemName: updated.itemNameSnapshot,
      specialInstruction: updated.specialInstruction,
      applied: true,
    };
  }

  private async loadOwnedItem(context: AuthContextDto, orderItemId: string) {
    const item = await this.prisma.orderItem.findFirst({
      where: { id: orderItemId, branchId: context.branchId! },
      include: { tableSession: true },
    });
    if (!item) throw new NotFoundException('Order item not found.');
    if (
      SHIFT_OWNER_ROLES.includes(context.roleCode) &&
      item.tableSession.primaryWaiterMembershipId !== context.staffMembershipId
    ) {
      throw new ForbiddenException('This is not your table.');
    }
    if (['CANCELLED', 'SERVED'].includes(item.state)) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'ORDER_ITEM_NOT_MUTABLE',
        errors: { state: item.state },
      });
    }
    return item;
  }

  private assertVersion(current: number, expected: number) {
    if (current !== expected) {
      throw new ConflictException({
        status: 409,
        errors: { version: 'stale' },
        expectedVersion: current,
      });
    }
  }

  private async requireBranch(userId: string): Promise<AuthContextDto> {
    const context = await this.identity.getByUserId(userId);
    if (!context.tenantId || !context.branchId || !context.staffMembershipId) {
      throw new ForbiddenException('No restaurant branch on this account.');
    }
    return context;
  }

  private async requireWaiterOnShift(userId: string): Promise<AuthContextDto> {
    const context = await this.requireBranch(userId);
    if (!WAITER_ROLES.includes(context.roleCode)) {
      throw new ForbiddenException('Only waiters can change or cancel items.');
    }
    if (
      SHIFT_OWNER_ROLES.includes(context.roleCode) &&
      !context.shiftSessionId
    ) {
      throw new ForbiddenException({
        status: 403,
        code: 'SHIFT_REQUIRED',
        errors: { shift: 'SHIFT_REQUIRED' },
      });
    }
    return context;
  }

  private async requireApprover(userId: string): Promise<AuthContextDto> {
    const context = await this.requireBranch(userId);
    if (!APPROVER_ROLES.includes(context.roleCode)) {
      throw new ForbiddenException('Approvals are for managers.');
    }
    return context;
  }

  private mapCancellationApproval(row: {
    id: string;
    orderItemId: string;
    reason: string;
    stateAtRequest: string;
    status: string;
    requestedAt: Date;
    decidedAt: Date | null;
    decisionReason: string | null;
    requestedBy: { employeeDisplayName: string };
    decidedBy: { employeeDisplayName: string } | null;
    orderItem: {
      orderId: string;
      itemNameSnapshot: string;
      quantity: number;
      unitPriceSnapshot: Prisma.Decimal | number | string;
      currencyCode: string;
      state: string;
      version: number;
      specialInstruction: string | null;
      stationNameSnapshot: string;
      currentPreparationStationId: string;
      tableSession: {
        table: {
          id: string;
          displayName: string;
          displayNumber: string | null;
        };
      };
    };
  }): ApprovalQueueItemDto {
    const unit = new Prisma.Decimal(row.orderItem.unitPriceSnapshot);
    const line = unit.mul(row.orderItem.quantity);
    return {
      type: 'CANCELLATION',
      requestId: row.id,
      orderItemId: row.orderItemId,
      orderId: row.orderItem.orderId,
      tableId: row.orderItem.tableSession.table.id,
      itemName: row.orderItem.itemNameSnapshot,
      quantity: row.orderItem.quantity,
      unitPrice: unit.toFixed(2),
      lineTotal: line.toFixed(2),
      currencyCode: row.orderItem.currencyCode,
      tableDisplayName: row.orderItem.tableSession.table.displayName,
      tableDisplayNumber: row.orderItem.tableSession.table.displayNumber,
      stationName: row.orderItem.stationNameSnapshot,
      stationId: row.orderItem.currentPreparationStationId,
      itemState: row.orderItem.state,
      stateAtRequest: row.stateAtRequest,
      itemVersion: row.orderItem.version,
      status: row.status,
      reason: row.reason,
      specialInstruction: row.orderItem.specialInstruction,
      requestedChange: null,
      requestedByName: row.requestedBy.employeeDisplayName,
      requestedAt: row.requestedAt,
      decidedByName: row.decidedBy?.employeeDisplayName ?? null,
      decidedAt: row.decidedAt,
      decisionReason: row.decisionReason,
    };
  }

  private mapChangeApproval(row: {
    id: string;
    orderItemId: string;
    reason: string | null;
    stateAtRequest: string;
    status: string;
    requestedAt: Date;
    decidedAt: Date | null;
    decisionReason: string | null;
    requestedChangeJson: Prisma.JsonValue;
    requestedBy: { employeeDisplayName: string };
    decidedBy: { employeeDisplayName: string } | null;
    orderItem: {
      orderId: string;
      itemNameSnapshot: string;
      quantity: number;
      unitPriceSnapshot: Prisma.Decimal | number | string;
      currencyCode: string;
      state: string;
      version: number;
      specialInstruction: string | null;
      stationNameSnapshot: string;
      currentPreparationStationId: string;
      tableSession: {
        table: {
          id: string;
          displayName: string;
          displayNumber: string | null;
        };
      };
    };
  }): ApprovalQueueItemDto {
    const unit = new Prisma.Decimal(row.orderItem.unitPriceSnapshot);
    const line = unit.mul(row.orderItem.quantity);
    return {
      type: 'CHANGE',
      requestId: row.id,
      orderItemId: row.orderItemId,
      orderId: row.orderItem.orderId,
      tableId: row.orderItem.tableSession.table.id,
      itemName: row.orderItem.itemNameSnapshot,
      quantity: row.orderItem.quantity,
      unitPrice: unit.toFixed(2),
      lineTotal: line.toFixed(2),
      currencyCode: row.orderItem.currencyCode,
      tableDisplayName: row.orderItem.tableSession.table.displayName,
      tableDisplayNumber: row.orderItem.tableSession.table.displayNumber,
      stationName: row.orderItem.stationNameSnapshot,
      stationId: row.orderItem.currentPreparationStationId,
      itemState: row.orderItem.state,
      stateAtRequest: row.stateAtRequest,
      itemVersion: row.orderItem.version,
      status: row.status,
      reason: row.reason,
      specialInstruction: row.orderItem.specialInstruction,
      requestedChange:
        (row.requestedChangeJson as Record<string, unknown> | null) ?? null,
      requestedByName: row.requestedBy.employeeDisplayName,
      requestedAt: row.requestedAt,
      decidedByName: row.decidedBy?.employeeDisplayName ?? null,
      decidedAt: row.decidedAt,
      decisionReason: row.decisionReason,
    };
  }

  private parseApprovalType(raw: string): 'CANCELLATION' | 'CHANGE' {
    const normalized = raw.trim().toUpperCase();
    if (normalized === 'CANCELLATION' || normalized === 'CANCEL') {
      return 'CANCELLATION';
    }
    if (normalized === 'CHANGE' || normalized === 'CHANGES') {
      return 'CHANGE';
    }
    throw new NotFoundException('Approval request not found.');
  }

  private parseApprovalTypeFilter(
    raw?: string,
  ): 'CANCELLATION' | 'CHANGE' | 'ALL' {
    if (!raw) return 'ALL';
    const normalized = raw.trim().toUpperCase();
    if (normalized === 'CANCELLATION' || normalized === 'CANCEL') {
      return 'CANCELLATION';
    }
    if (normalized === 'CHANGE' || normalized === 'CHANGES') {
      return 'CHANGE';
    }
    return 'ALL';
  }

  private parseApprovalPeriod(raw?: string): ApprovalPeriod {
    if (raw === 'week' || raw === 'month') return raw;
    return 'day';
  }

  private approvalRangeFor(period: ApprovalPeriod): { from: Date; to: Date } {
    const now = new Date();
    const to = new Date(now);
    to.setHours(23, 59, 59, 999);
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    if (period === 'week') {
      from.setDate(from.getDate() - 6);
    } else if (period === 'month') {
      from.setDate(1);
    }
    return { from, to };
  }

  private ymd(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
