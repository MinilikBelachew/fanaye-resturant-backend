import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { User } from '../../users/domain/user';
import { AuthContextDto } from '../../identity/dto/auth-context.dto';

export class LoginResponseDto {
  @ApiProperty()
  @Expose()
  token: string;

  @ApiProperty()
  @Expose()
  tokenExpires: number;

  @ApiProperty({
    type: () => User,
  })
  @Expose()
  @Type(() => User)
  user: User;

  @ApiProperty({ type: () => AuthContextDto })
  @Expose()
  @Type(() => AuthContextDto)
  context: AuthContextDto;
}

export type LoginSessionResult = LoginResponseDto & {
  refreshToken: string;
};
