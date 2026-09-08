import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class RefreshResponseDto {
  @ApiProperty()
  @Expose()
  token: string;

  @ApiProperty()
  @Expose()
  tokenExpires: number;
}

export type RefreshSessionResult = RefreshResponseDto & {
  refreshToken: string;
  remember: boolean;
};
