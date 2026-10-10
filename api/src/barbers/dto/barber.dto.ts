import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateBarberDto {
  @IsString({ message: 'Nama kapster wajib diisi' })
  @MinLength(2, { message: 'Nama kapster minimal 2 karakter' })
  @MaxLength(80, { message: 'Nama kapster maksimal 80 karakter' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Nomor telepon maksimal 20 karakter' })
  phone?: string;

  @IsOptional()
  @IsBoolean({ message: 'Status aktif harus true/false' })
  active?: boolean;
}

export class UpdateBarberDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Nama kapster minimal 2 karakter' })
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
