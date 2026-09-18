import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AllConfigType } from '../config/config.type';
import { IdentityContextService } from '../identity/identity-context.service';
import { JwtPayloadType } from '../auth/strategies/types/jwt-payload.type';
import { OpsNotifyPayload } from './ops-events';
import {
  branchRoom,
  cashierRoom,
  managerRoom,
  staffRoom,
  stationRoom,
} from './ops-rooms';

type OpsSocketData = {
  userId: string;
  tenantId: string | null;
  branchId: string | null;
  staffMembershipId: string | null;
  roleCode: string;
  stationId: string | null;
};

@Injectable()
@WebSocketGateway({
  namespace: '/ops',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class OpsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(OpsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AllConfigType>,
    private readonly identity: IdentityContextService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        client.disconnect(true);
        return;
      }

      const secret = this.configService.getOrThrow('auth.secret', {
        infer: true,
      });
      const payload = await this.jwtService.verifyAsync<JwtPayloadType>(token, {
        secret,
      });
      if (!payload?.id) {
        client.disconnect(true);
        return;
      }

      const context = await this.identity.getByUserId(String(payload.id));
      const data: OpsSocketData = {
        userId: context.userId,
        tenantId: context.tenantId,
        branchId: context.branchId,
        staffMembershipId: context.staffMembershipId,
        roleCode: context.roleCode,
        stationId: context.stationId,
      };
      client.data = data;

      if (context.branchId) {
        // Managers/cashiers/waiters + station tablets all need live board events.
        await client.join(branchRoom(context.branchId));
      }
      if (context.staffMembershipId) {
        await client.join(staffRoom(context.staffMembershipId));
      }
      if (context.branchId && context.roleCode === 'CASHIER') {
        await client.join(cashierRoom(context.branchId));
      }
      if (
        context.branchId &&
        (context.roleCode === 'MANAGER' || context.roleCode === 'OWNER_ADMIN')
      ) {
        await client.join(managerRoom(context.branchId));
        await client.join(cashierRoom(context.branchId));
      }
      if (context.stationId) {
        await client.join(stationRoom(context.stationId));
      }

      client.emit('ops.connected', {
        ok: true,
        roleCode: context.roleCode,
        branchId: context.branchId,
        stationId: context.stationId,
      });
    } catch (error) {
      this.logger.warn(
        `Socket auth failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const data = client.data as OpsSocketData | undefined;
    if (data?.userId) {
      this.logger.debug(`ops disconnect user=${data.userId}`);
    }
  }

  @SubscribeMessage('ops.ping')
  handlePing(@ConnectedSocket() client: Socket, @MessageBody() body?: unknown) {
    client.emit('ops.pong', {
      at: new Date().toISOString(),
      echo: body ?? null,
    });
  }

  dispatch(event: OpsNotifyPayload) {
    const envelope = {
      id: event.notificationId ?? null,
      type: event.type,
      tenantId: event.tenantId,
      branchId: event.branchId,
      severity: event.severity,
      title: event.title,
      body: event.body ?? null,
      relatedEntityType: event.relatedEntityType ?? null,
      relatedEntityId: event.relatedEntityId ?? null,
      payload: event.payload ?? null,
      createdAt: event.createdAt ?? new Date().toISOString(),
      recipientMembershipId: event.recipientMembershipId ?? null,
    };

    const rooms = event.rooms?.length
      ? event.rooms
      : event.recipientMembershipId
        ? [staffRoom(event.recipientMembershipId)]
        : [];

    if (rooms.length === 0) {
      return;
    }

    for (const room of rooms) {
      this.server.to(room).emit('ops.notification', envelope);
      this.server.to(room).emit(event.type, envelope);
    }
  }

  private extractToken(client: Socket): string | null {
    const authToken = (client.handshake.auth as { token?: string } | undefined)
      ?.token;
    if (authToken?.trim()) return authToken.trim();

    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice(7).trim();
    }

    const queryToken = client.handshake.query.token;
    if (typeof queryToken === 'string' && queryToken.trim()) {
      return queryToken.trim();
    }

    return null;
  }
}
