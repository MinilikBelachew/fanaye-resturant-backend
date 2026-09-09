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
import {
  CancelOrderItemDto,
  CreateChangeRequestDto,
  DecideCancellationDto,
  DecideChangeDto,
} from './dto/order-item-mutation.dto';
import {
  ApprovalQueueResponseDto,
  MutationDataResponseDto,
  OrderItemMutationResultDto,
} from './dto/order-item-mutation-response.dto';

const DIRECT_CANCEL_STATES = ['CONFIRMED', 'QUEUED', 'ACKNOWLEDGED'];
const PROTECTED_CANCEL_STATES = ['IN_PREPARATION', 'READY'];
const DIRECT_CHANGE_STATES = ['QUEUED', 'ACKNOWLEDGED'];
const PROTECTED_CHANGE_STATES = ['IN_PREPARATION', 'READY'];
const WAITER_ROLES = ['WAITER', 'MANAGER', 'OWNER_ADMIN'];
const APPROVER_ROLES = ['MANAGER', 'OWNER_ADMIN'];

@Injectable()
export class OrderItemMutationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityContextService,
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

    const updated = await this.prisma.orderItem.update({
      where: { id: item.id },
      data: {
        state: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledByMembershipId: context.staffMembershipId!,
        cancellationReason: dto.reason.trim(),
        version: { increment: 1 },
      },
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
        include: {
          requestedBy: true,
          orderItem: {
            include: {
              tableSession: { include: { table: true } },
            },
          },
        },
        orderBy: { requestedAt: 'asc' },
        take: 50,
      }),
      this.prisma.orderChangeRequest.findMany({
        where: { branchId: context.branchId!, status: 'PENDING' },
        include: {
          requestedBy: true,
          orderItem: {
            include: {
              tableSession: { include: { table: true } },
            },
          },
        },
        orderBy: { requestedAt: 'asc' },
        take: 50,
      }),
    ]);

    const cancelRows = cancellations.map((row) => ({
      type: 'CANCELLATION' as const,
      requestId: row.id,
      orderItemId: row.orderItemId,
      itemName: row.orderItem.itemNameSnapshot,
      tableDisplayName: row.orderItem.tableSession.table.displayName,
      stationName: row.orderItem.stationNameSnapshot,
      itemState: row.orderItem.state,
      itemVersion: row.orderItem.version,
      reason: row.reason,
      requestedChange: null,
      requestedByName: row.requestedBy.employeeDisplayName,
      requestedAt: row.requestedAt,
    }));

    const changeRows = changes.map((row) => ({
      type: 'CHANGE' as const,
      requestId: row.id,
      orderItemId: row.orderItemId,
      itemName: row.orderItem.itemNameSnapshot,
      tableDisplayName: row.orderItem.tableSession.table.displayName,
      stationName: row.orderItem.stationNameSnapshot,
      itemState: row.orderItem.state,
      itemVersion: row.orderItem.version,
      reason: row.reason,
      requestedChange:
        (row.requestedChangeJson as Record<string, unknown> | null) ?? null,
      requestedByName: row.requestedBy.employeeDisplayName,
      requestedAt: row.requestedAt,
    }));

    return {
      data: [...cancelRows, ...changeRows].sort(
        (a, b) => a.requestedAt.getTime() - b.requestedAt.getTime(),
      ),
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
      context.roleCode === 'WAITER' &&
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
    if (context.roleCode === 'WAITER' && !context.shiftSessionId) {
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
}
