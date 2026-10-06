import { Module } from '@nestjs/common';
import { VerifyEtService } from './verify-et.service';

@Module({
  providers: [VerifyEtService],
  exports: [VerifyEtService],
})
export class VerifyEtModule {}
