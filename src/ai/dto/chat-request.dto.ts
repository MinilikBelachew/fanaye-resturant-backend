import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ChatMessageDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsString()
  role: 'user' | 'assistant';

  @ApiProperty()
  @IsString()
  content: string;
}

export class ChatRequestDto {
  @ApiProperty({
    example: 'What was our total revenue today and what are the top 3 items sold?',
  })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({ type: [ChatMessageDto] })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  history?: ChatMessageDto[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ enum: ['sql', 'tools'], default: 'sql' })
  @IsString()
  @IsOptional()
  engine?: 'sql' | 'tools';

  @ApiPropertyOptional({ default: true, description: 'Whether to return synthesized spoken audio' })
  @IsOptional()
  voiceResponse?: boolean;
}

export class ChatResponseDto {
  @ApiProperty()
  reply: string;

  @ApiPropertyOptional()
  sqlQuery?: string;

  @ApiPropertyOptional()
  rowCount?: number;

  @ApiPropertyOptional({ description: 'Base64 encoded MP3 audio of the spoken response' })
  audioBase64?: string;
}

export class TranscribeRequestDto {
  @ApiProperty({ description: 'Base64-encoded audio bytes recorded from browser' })
  @IsString()
  @IsNotEmpty()
  audioBase64: string;

  @ApiPropertyOptional({ default: 'audio/webm' })
  @IsString()
  @IsOptional()
  mimeType?: string;
}

export class TranscribeResponseDto {
  @ApiProperty({ description: 'Transcribed text from speech' })
  text: string;
}

export class SpeakRequestDto {
  @ApiProperty({ description: 'Text to synthesize into speech' })
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiPropertyOptional({ default: 'alloy' })
  @IsString()
  @IsOptional()
  voice?: string;
}

export class SpeakResponseDto {
  @ApiProperty({ description: 'Base64 MP3 audio' })
  audioBase64: string;
}

