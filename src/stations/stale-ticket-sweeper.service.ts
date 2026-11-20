import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

/** READY items older than this are assumed handed over and marked served. */
export const READY_AUTO_SERVE_HOURS = 6;

/**
 * Keeps station queues clean. READY food is cooked — once its seating is
 * closed (or it has sat for READY_AUTO_SERVE_HOURS) it was handed over, the
 * waiter just never tapped "served". Only READY items are touched; uncooked
 * stale tickets stay in Exceptions for a manager to resolve.
 */
@Injectable()
export class StaleTicketSweeperService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(StaleTicketSweeperService.name);
  private timer: NodeJS.Timeout | null = null;
  private isSweeping = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    setTimeout(() => void this.sweepSafely(), 30_000);
    this.timer = setInterval(() => void this.sweepSafely(), 5 * 60_000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async sweepSafely(): Promise<void> {
    if (this.isSweeping) return;
    this.isSweeping = true;
    try {
      await this.sweep();
    } catch (error) {
      this.logger.error('Error during stale ticket sweep:', error);
    } finally {
      this.isSweeping = false;
    }
  }

  async sweep(now = new Date()): Promise<number> {
    const cutoff = new Date(
      now.getTime() - READY_AUTO_SERVE_HOURS * 60 * 60_000,
    );
    const result = await this.prisma.orderItem.updateMany({
      where: {
        state: 'READY',
        cancelledAt: null,
        servedAt: null,
        OR: [
          { tableSession: { closedAt: { not: null } } },
          { roomSession: { closedAt: { not: null } } },
          { outsideOrder: { closedAt: { not: null } } },
          { readyAt: { lt: cutoff } },
          { readyAt: null, queuedAt: { lt: cutoff } },
        ],
      },
      data: {
        state: 'SERVED',
        servedAt: now,
        version: { increment: 1 },
      },
    });
    if (result.count > 0) {
      this.logger.log(`Auto-served ${result.count} stale READY ticket(s).`);
    }
    return result.count;
  }
}
