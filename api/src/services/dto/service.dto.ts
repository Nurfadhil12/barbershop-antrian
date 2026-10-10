import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateServiceDto {
  @IsString({ message: 'Nama layanan wajib diisi' })
  @MinLength(2, { message: 'Nama layanan minimal 2 karakter' })
  @MaxLength(80, { message: 'Nama layanan maksimal 80 karakter' })
  name!: string;

  @IsOptional()
  @IsInt({ message: 'Durasi harus berupa angka menit' })
  @Min(5, { message: 'Durasi minimal 5 menit' })
  @Max(480, { message: 'Durasi maksimal 480 menit' })
  durationMin?: number;

  @IsOptional()
  @IsInt({ message: 'Harga harus berupa angka (rupiah)' })
  @Min(0, { message: 'Harga tidak boleh negatif' })
  @Max(100_000_000, { message: 'Harga terlalu besar' })
  price?: number;

  @IsOptional()
  @IsBoolean({ message: 'Status aktif harus true/false' })
  active?: boolean;
}

export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Nama layanan minimal 2 karakter' })
  @MaxLength(80, { message: 'Nama layanan maksimal 80 karakter' })
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(480)
  durationMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  price?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
