import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBarberDto, UpdateBarberDto } from './dto/barber.dto';

@Injectable()
export class BarbersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(onlyActive = false) {
    return this.prisma.barber.findMany({
      where: onlyActive ? { active: true } : {},
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { queues: true } } },
    });
  }

  async findOne(id: number) {
    const barber = await this.prisma.barber.findUnique({ where: { id } });
    if (!barber) {
      throw new NotFoundException(`Kapster #${id} tidak ditemukan`);
    }
    return barber;
  }

  create(dto: CreateBarberDto) {
    return this.prisma.barber.create({
      data: {
        name: dto.name.trim(),
        phone: dto.phone?.trim() || null,
        active: dto.active ?? true,
      },
    });
  }

  async update(id: number, dto: UpdateBarberDto) {
    await this.findOne(id);
    return this.prisma.barber.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  async remove(id: number) {
    const barber = await this.findOne(id);
    const used = await this.prisma.queue.count({ where: { barberId: id } });
    if (used > 0) {
      throw new ConflictException(
        `Kapster "${barber.name}" sudah menangani ${used} antrian, jadi tidak bisa dihapus. Nonaktifkan saja.`,
      );
    }
    await this.prisma.barber.delete({ where: { id } });
    return { deleted: true, id };
  }
}
