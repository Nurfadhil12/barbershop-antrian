import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { QueueStatus } from '../../prisma/prisma-client';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateQueueDto {
  @IsString({ message: 'Nama pelanggan wajib diisi' })
  @MinLength(2, { message: 'Nama pelanggan minimal 2 karakter' })
  @MaxLength(80, { message: 'Nama pelanggan maksimal 80 karakter' })
  customerName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Nomor telepon maksimal 20 karakter' })
  customerPhone?: string;

  @IsInt({ message: 'Layanan wajib dipilih' })
  @Min(1, { message: 'Layanan wajib dipilih' })
  serviceId!: number;

  @IsOptional()
  @IsInt({ message: 'Kapster tidak valid' })
  @Min(1)
  barberId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Catatan maksimal 200 karakter' })
  note?: string;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'Tanggal harus berformat YYYY-MM-DD' })
  queueDate?: string;
}

export class UpdateQueueDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Nama pelanggan minimal 2 karakter' })
  @MaxLength(80)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  customerPhone?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  serviceId?: number;

  // null = kosongkan kapster
  @IsOptional()
  @IsInt()
  @Min(1)
  barberId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class ListQueuesQueryDto {
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'Tanggal harus berformat YYYY-MM-DD' })
  date?: string;

  @IsOptional()
  @IsEnum(QueueStatus, {
    message: 'Status harus salah satu dari WAITING, IN_PROGRESS, DONE, CANCELLED',
  })
  status?: QueueStatus;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  serviceId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  barberId?: number;
}

export class StartQueueDto {
  @IsOptional()
  @IsInt({ message: 'Kapster tidak valid' })
  @Min(1)
  barberId?: number;
}
