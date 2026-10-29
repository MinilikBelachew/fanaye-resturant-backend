import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const EMPLOYMENT_TYPES = [
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'CASUAL',
] as const;
const PAY_TYPES = ['SALARY', 'HOURLY'] as const;

const WORKING_DAY_CODES = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
] as const;

export class CreateShiftDefinitionDto {
  @ApiProperty({ example: 'Brunch' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: '10:00', description: 'HH:mm local time' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  startLocalTime: string;

  @ApiProperty({ example: '16:00', description: 'HH:mm local time' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  endLocalTime: string;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  graceMinutes?: number;
}

export class UpdateShiftDefinitionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: '10:00' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  startLocalTime?: string;

  @ApiPropertyOptional({ example: '16:00' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  endLocalTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  graceMinutes?: number;
}

export class SetWaiterTableCoverageDto {
  @ApiProperty()
  @IsUUID()
  shiftDefinitionId: string;

  @ApiPropertyOptional({ example: 'Mon', enum: WORKING_DAY_CODES })
  @IsOptional()
  @IsIn(WORKING_DAY_CODES)
  dayCode?: string;

  @ApiPropertyOptional({
    description:
      'If true or dayCode omitted, applies this table selection across all days this waiter is scheduled for this shift',
  })
  @IsOptional()
  @IsBoolean()
  applyToAllDays?: boolean;

  @ApiProperty({
    type: [String],
    description: 'Dining table ids for this shift',
  })
  @IsArray()
  @IsUUID('4', { each: true })
  tableIds: string[];
}

export class StaffDayShiftInputDto {
  @ApiProperty({ example: 'Mon', enum: WORKING_DAY_CODES })
  @IsIn(WORKING_DAY_CODES)
  dayCode: string;

  @ApiProperty({ description: 'Shift definition for this weekday' })
  @IsUUID()
  shiftDefinitionId: string;
}

export class StaffShiftTableCoverageInputDto {
  @ApiProperty()
  @IsUUID()
  shiftDefinitionId: string;

  @ApiPropertyOptional({ example: 'Mon', enum: WORKING_DAY_CODES })
  @IsOptional()
  @IsIn(WORKING_DAY_CODES)
  dayCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  applyToAllDays?: boolean;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  tableIds: string[];
}

export class CreateAdminStaffDto {
  @ApiProperty({ example: 'Karim Tesfaye' })
  @IsString()
  @MaxLength(160)
  name: string;

  @ApiProperty({
    example: 'WAITER',
    description:
      'WAITER | DISPATCHER | MANAGER | CASHIER | OWNER_ADMIN | STATION_OPERATOR | or UI codes kitchen/barista/cakes/soft_drinks/dispatcher',
  })
  @IsString()
  @MaxLength(40)
  role: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    description: 'Login password (minimum 6 characters)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(72)
  password?: string;

  @ApiPropertyOptional({
    description: 'Login PIN (4-6 numeric digits)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(72)
  pin?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    type: [String],
    example: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    description:
      'Legacy: scheduled working days. Prefer dayShifts for per-day windows.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(WORKING_DAY_CODES, { each: true })
  workingDays?: string[];

  @ApiPropertyOptional({
    type: [StaffDayShiftInputDto],
    description:
      'Per-day shift plan (e.g. Mon→Morning, Thu→Afternoon). Syncs workingDays.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StaffDayShiftInputDto)
  dayShifts?: StaffDayShiftInputDto[];

  @ApiPropertyOptional({
    description: 'Preparation station id when role is a station operator',
  })
  @IsOptional()
  @IsUUID()
  preparationStationId?: string;

  @ApiPropertyOptional({
    description: 'Station code: KITCHEN | BARISTA | CAKES | SOFT_DRINKS',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  stationCode?: string;

  @ApiPropertyOptional({
    description:
      'Legacy single shift. Used when dayShifts omitted (applies to all workingDays).',
  })
  @IsOptional()
  @IsUUID()
  shiftDefinitionId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  tableIds?: string[];

  @ApiPropertyOptional({
    type: [StaffShiftTableCoverageInputDto],
    description: 'Waiter table coverage per shift window used in dayShifts',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StaffShiftTableCoverageInputDto)
  tableCoverages?: StaffShiftTableCoverageInputDto[];

  @ApiPropertyOptional({
    description:
      'Owner can create staff into a specific branch (defaults to session branch)',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ example: '2026-01-15' })
  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @ApiPropertyOptional({
    description: 'Uploaded file id from /files/upload (staff photo)',
  })
  @IsOptional()
  @IsUUID()
  photoId?: string;

  @ApiPropertyOptional({ example: '3-12345 AA' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  licencePlate?: string;

  @ApiPropertyOptional({ example: 'White Toyota Hiace' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  vehicleDesc?: string;
}

export class UpdateAdminStaffDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  role?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    description: 'Login password (minimum 6 characters)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(72)
  password?: string;

  @ApiPropertyOptional({
    description: 'Login PIN (4-6 numeric digits)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(72)
  pin?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    type: [String],
    example: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    description:
      'Legacy: scheduled working days. Prefer dayShifts for per-day windows.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(WORKING_DAY_CODES, { each: true })
  workingDays?: string[];

  @ApiPropertyOptional({
    type: [StaffDayShiftInputDto],
    description:
      'Per-day shift plan (e.g. Mon→Morning, Thu→Afternoon). Syncs workingDays.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StaffDayShiftInputDto)
  dayShifts?: StaffDayShiftInputDto[];

  @ApiPropertyOptional({
    description: 'Preparation station id when role is a station operator',
  })
  @IsOptional()
  @IsUUID()
  preparationStationId?: string;

  @ApiPropertyOptional({
    description: 'Station code: KITCHEN | BARISTA | CAKES | SOFT_DRINKS',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  stationCode?: string;

  @ApiPropertyOptional({
    description:
      'Legacy single shift. Used when dayShifts omitted (applies to all workingDays).',
  })
  @IsOptional()
  @IsUUID()
  shiftDefinitionId?: string;

  @ApiPropertyOptional({
    type: [StaffShiftTableCoverageInputDto],
    description: 'Waiter table coverage per shift window used in dayShifts',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StaffShiftTableCoverageInputDto)
  tableCoverages?: StaffShiftTableCoverageInputDto[];

  @ApiPropertyOptional({ example: 'EMP-012' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  employeeCode?: string;

  @ApiPropertyOptional({ example: 'Head Waiter' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;

  @ApiPropertyOptional({ enum: EMPLOYMENT_TYPES })
  @IsOptional()
  @IsIn([...EMPLOYMENT_TYPES])
  employmentType?: (typeof EMPLOYMENT_TYPES)[number];

  @ApiPropertyOptional({ enum: PAY_TYPES })
  @IsOptional()
  @IsIn([...PAY_TYPES])
  payType?: (typeof PAY_TYPES)[number];

  @ApiPropertyOptional({ example: 15000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  basePay?: number;

  @ApiPropertyOptional({ example: '2026-01-15' })
  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @ApiPropertyOptional({ example: '2026-04-15' })
  @IsOptional()
  @IsDateString()
  probationEndDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  emergencyContactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  emergencyContactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  hrNotes?: string;

  @ApiPropertyOptional({ example: 18 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  annualLeaveBalanceDays?: number;

  @ApiPropertyOptional({ example: '3-12345 AA' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  licencePlate?: string;

  @ApiPropertyOptional({ example: 'White Toyota Hiace' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  vehicleDesc?: string;

  @ApiPropertyOptional({
    description: 'Uploaded file id from /files/upload (staff photo)',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsUUID()
  photoId?: string | null;
}

export class ResetAdminStaffPinDto {
  @ApiProperty({ example: '1234', description: 'Exactly 4 numeric digits' })
  @IsString()
  @Matches(/^\d{4}$/, { message: 'PIN must be exactly 4 numeric digits.' })
  pin: string;
}

export class ResetAdminStaffPasswordDto {
  @ApiProperty({ example: 'Password123!', description: 'Minimum 6 characters' })
  @IsString()
  @MaxLength(72)
  password: string;
}
