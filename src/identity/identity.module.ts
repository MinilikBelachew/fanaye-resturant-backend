import { Module } from '@nestjs/common';
import { IdentityContextService } from './identity-context.service';

@Module({
  providers: [IdentityContextService],
  exports: [IdentityContextService],
})
export class IdentityModule {}
