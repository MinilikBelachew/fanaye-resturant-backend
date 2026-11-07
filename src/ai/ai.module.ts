import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../database/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { TextToSqlService } from './text-to-sql.service';
import { SqlValidatorService } from './sql-validator.service';
import { VoiceService } from './voice.service';

@Module({
  imports: [ConfigModule, PrismaModule, IdentityModule],
  controllers: [AiController],
  providers: [AiService, TextToSqlService, SqlValidatorService, VoiceService],
  exports: [AiService, TextToSqlService, VoiceService],
})
export class AiModule {}
