import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OPS_NOTIFY_EVENT, OpsNotifyPayload } from './ops-events';
import { OpsGateway } from './ops.gateway';

@Injectable()
export class OpsEventsListener {
  constructor(private readonly gateway: OpsGateway) {}

  @OnEvent(OPS_NOTIFY_EVENT)
  handleNotify(event: OpsNotifyPayload) {
    this.gateway.dispatch(event);
  }
}
