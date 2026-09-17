import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class AuditLogsInterceptor implements NestInterceptor {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const url = request.url || '';

    // Skip read-only and preflight requests
    if (method === 'GET' || method === 'OPTIONS' || method === 'HEAD') {
      return next.handle();
    }

    // Skip internal health checks or ping endpoints
    if (url.includes('/health') || url.includes('/metrics')) {
      return next.handle();
    }

    return next.handle().pipe(
      tap((responseData) => {
        try {
          const user = request.user;
          // Format entity from URL: /api/v1/manager/staff/123 -> Staff
          const cleanPath = url.split('?')[0].replace(/^\/api\/v\d+\//, '');
          const urlParts = cleanPath.split('/').filter(Boolean);

          let entity = 'System';
          let entityId: string | null = null;

          if (urlParts.length > 0) {
            // Check if last segment is a UUID or ID
            const lastSegment = urlParts[urlParts.length - 1];
            const isId =
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                lastSegment,
              ) || /^\d+$/.test(lastSegment);

            if (isId) {
              entityId = lastSegment;
              const entitySegment =
                urlParts.length > 1
                  ? urlParts[urlParts.length - 2]
                  : urlParts[0];
              entity = formatEntityFromSegment(entitySegment);
            } else {
              entity = formatEntityFromSegment(urlParts[urlParts.length - 1]);
              if (
                responseData &&
                typeof responseData === 'object' &&
                responseData.id
              ) {
                entityId = String(responseData.id);
              } else if (
                responseData &&
                responseData.data &&
                typeof responseData.data === 'object' &&
                responseData.data.id
              ) {
                entityId = String(responseData.data.id);
              }
            }
          }

          let action = method;
          if (method === 'POST') action = 'CREATE';
          if (method === 'PATCH' || method === 'PUT') action = 'UPDATE';
          if (method === 'DELETE') action = 'DELETE';

          if (url.includes('login') || url.includes('sign-in'))
            action = 'LOGIN';
          if (url.includes('logout') || url.includes('sign-out'))
            action = 'LOGOUT';
          if (url.includes('reset-pin') || url.includes('pin'))
            action = 'UPDATE_PIN';
          if (url.includes('coverage')) action = 'ASSIGN_TABLE_COVERAGE';
          if (url.includes('cash-drop')) action = 'CONFIRM_CASH_DROP_RECEIPT';

          // Deep clone and mask sensitive information
          const sanitizedBody = sanitizePayload(request.body);
          const sanitizedResponse = sanitizePayload(responseData);

          this.eventEmitter.emit('audit.log', {
            action,
            entity,
            entityId,
            userId: user?.id,
            tenantId: user?.tenantId ?? request['tenantId'] ?? null,
            branchId: user?.branchId ?? request['branchId'] ?? null,
            staffMembershipId: user?.staffMembershipId ?? null,
            role: normalizeAuditRole(user?.role ?? user?.roleCode ?? null),
            ip:
              request.ip ||
              request.headers['x-forwarded-for'] ||
              request.socket?.remoteAddress,
            method,
            path: url,
            details: sanitizedBody,
            newState: sanitizedResponse,
          });
        } catch (err) {
          // Never fail the request if audit emission encounters an issue
          console.error(
            '[AuditLogsInterceptor] Error capturing audit event:',
            err,
          );
        }
      }),
    );
  }
}

function formatEntityFromSegment(segment: string): string {
  if (!segment) return 'System';
  return segment
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

function sanitizePayload(data: any): any {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitizePayload);

  const clone: Record<string, any> = {};
  const sensitiveKeys = new Set([
    'password',
    'pin',
    'token',
    'accessToken',
    'refreshToken',
    'secret',
    'authorization',
  ]);

  for (const [key, value] of Object.entries(data)) {
    if (sensitiveKeys.has(key.toLowerCase())) {
      clone[key] = '***';
    } else if (typeof value === 'object' && value !== null) {
      clone[key] = sanitizePayload(value);
    } else {
      clone[key] = value;
    }
  }

  return clone;
}

function normalizeAuditRole(role: unknown): string | null {
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
