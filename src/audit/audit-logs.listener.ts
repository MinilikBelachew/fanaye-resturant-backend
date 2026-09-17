import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../database/prisma.service';
import { generateAuditDescription } from './audit-description.helper';

@Injectable()
export class AuditLogListener {
  private readonly logger = new Logger(AuditLogListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('audit.log', { async: true })
  async handleAuditLogEvent(payload: {
    action: string;
    entity: string;
    entityId?: string | null;
    userId?: string | null;
    tenantId?: string | null;
    branchId?: string | null;
    staffMembershipId?: string | null;
    role?: string | null;
    ip?: string | null;
    method?: string;
    path?: string;
    details?: any;
    newState?: any;
  }) {
    try {
      if (!payload.tenantId && payload.userId) {
        // Look up user's active tenant if not in request
        const membership = await this.prisma.tenantStaffMembership.findFirst({
          where: { userId: payload.userId, status: 'ACTIVE' },
          select: {
            id: true,
            tenantId: true,
            branchAssignments: { select: { branchId: true }, take: 1 },
          },
        });
        if (membership) {
          payload.tenantId = membership.tenantId;
          payload.branchId =
            payload.branchId || membership.branchAssignments?.[0]?.branchId;
          payload.staffMembershipId =
            payload.staffMembershipId || membership.id;
        }
      }

      if (!payload.tenantId) {
        return;
      }

      const description = generateAuditDescription({
        action: payload.action || 'UNKNOWN',
        entity: payload.entity || 'System',
        entityId: payload.entityId,
        details: payload.details,
        path: payload.path,
      });

      await this.prisma.auditEvent.create({
        data: {
          tenantId: payload.tenantId,
          branchId: payload.branchId || undefined,
          actorUserId: payload.userId || undefined,
          actorStaffMembershipId: payload.staffMembershipId || undefined,
          actorRestaurantRole: normalizeRoleString(payload.role) || 'STAFF',
          entityType: payload.entity || 'System',
          entityId: payload.entityId || undefined,
          action: payload.action || 'MUTATION',
          reason: description,
          previousStateJson: payload.details || undefined,
          newStateJson: payload.newState || undefined,
          metadataJson: {
            ip: payload.ip,
            method: payload.method,
            path: payload.path,
            description,
          },
        },
      });

      this.logger.log(
        `[AuditLog] Logged ${payload.action} on ${payload.entity} (${payload.path})`,
      );
    } catch (error) {
      this.logger.error('Failed to persist audit log event:', error);
    }
  }
}

function normalizeRoleString(role: unknown): string | null {
  if (role == null) return null;
  if (typeof role === 'string') {
    const trimmed = role.trim();
    return trimmed.length > 0 ? trimmed.slice(0, 40) : null;
  }
  if (typeof role === 'object') {
    const record = role as { code?: unknown; name?: unknown; id?: unknown };
    if (typeof record.code === 'string' && record.code.trim()) {
      return record.code.trim().slice(0, 40);
    }
    if (typeof record.name === 'string' && record.name.trim()) {
      return record.name.trim().slice(0, 40);
    }
    if (typeof record.id === 'number' || typeof record.id === 'string') {
      return String(record.id).slice(0, 40);
    }
  }
  return null;
}
