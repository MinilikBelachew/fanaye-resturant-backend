import { Injectable } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@Injectable()
@WebSocketGateway({
  namespace: '/public',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class PublicFeedGateway {
  @WebSocketServer()
  server!: Server;

  broadcast(event: string, payload?: Record<string, unknown>) {
    try {
      this.server?.emit(event, {
        ...(payload ?? {}),
        createdAt: new Date().toISOString(),
      });
    } catch {
      // Best-effort public broadcast
    }
  }
}

