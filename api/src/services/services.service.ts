import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(onlyActive = false) {
    return this.prisma.service.findMany({
      where: onlyActive ? { active: true } : {},
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { queues: true } } },
    });
  }

  async findOne(id: number) {
    const service = await this.prisma.service.findUnique({ where: { id } });
    if (!service) {
      throw new NotFoundException(`Layanan #${id} tidak ditemukan`);
    }
    return service;
  }

  create(dto: CreateServiceDto) {
    return this.prisma.service.create({
      data: {
        name: dto.name.trim(),
        durationMin: dto.durationMin ?? 30,
        price: dto.price ?? 0,
        active: dto.active ?? true,
      },
    });
  }

  async update(id: number, dto: UpdateServiceDto) {
    await this.findOne(id);
    return this.prisma.service.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.durationMin !== undefined ? { durationMin: dto.durationMin } : {}),
        ...(dto.price !== undefined ? { price: dto.price } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  // Layanan yang sudah pernah dipakai tidak boleh hilang dari riwayat:
  // nonaktifkan saja (active=false).
  async remove(id: number) {
    const service = await this.findOne(id);
    const used = await this.prisma.queue.count({ where: { serviceId: id } });
    if (used > 0) {
      throw new ConflictException(
        `Layanan "${service.name}" sudah dipakai pada ${used} antrian, jadi tidak bisa dihapus. Nonaktifkan saja.`,
      );
    }
    await this.prisma.service.delete({ where: { id } });
    return { deleted: true, id };
  }
}
