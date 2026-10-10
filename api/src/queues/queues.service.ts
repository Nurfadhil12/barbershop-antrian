import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { formatQueueCode, parseDateOnly, toDateOnlyString, todayInShopTz } from '../common/date.util';
import { Prisma, QueueStatus } from '../prisma/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQueueDto, ListQueuesQueryDto, StartQueueDto, UpdateQueueDto } from './dto/queue.dto';

const QUEUE_INCLUDE: Prisma.QueueInclude = {
  service: { select: { id: true, name: true, durationMin: true, price: true } },
  barber: { select: { id: true, name: true } },
};

const STATUS_LABEL: Record<QueueStatus, string> = {
  WAITING: 'menunggu',
  IN_PROGRESS: 'sedang dilayani',
  DONE: 'selesai',
  CANCELLED: 'dibatalkan',
};

@Injectable()
export class QueuesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Daftar antrian satu hari + ringkasannya — satu round-trip untuk UI papan antrian. */
  async list(query: ListQueuesQueryDto) {
    const queueDate = parseDateOnly(query.date ?? todayInShopTz());
    const where: Prisma.QueueWhereInput = { queueDate };

    if (query.status) where.status = query.status;
    if (query.serviceId) where.serviceId = query.serviceId;
    if (query.barberId) where.barberId = query.barberId;
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { customerName: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
        { customerPhone: { contains: q } },
      ];
    }

    const [items, summary] = await Promise.all([
      this.prisma.queue.findMany({ where, include: QUEUE_INCLUDE, orderBy: [{ number: 'asc' }] }),
      this.summaryFor(queueDate),
    ]);

    return { date: toDateOnlyString(queueDate), items, summary };
  }

  async summary(query: ListQueuesQueryDto) {
    const queueDate = parseDateOnly(query.date ?? todayInShopTz());
    return { date: toDateOnlyString(queueDate), summary: await this.summaryFor(queueDate) };
  }

  async findOne(id: number) {
    const queue = await this.prisma.queue.findUnique({ where: { id }, include: QUEUE_INCLUDE });
    if (!queue) {
      throw new NotFoundException(`Antrian #${id} tidak ditemukan`);
    }
    return queue;
  }

  async create(dto: CreateQueueDto) {
    const dateStr = dto.queueDate ?? todayInShopTz();
    const queueDate = parseDateOnly(dateStr);

    const service = await this.requireActiveService(dto.serviceId);
    if (dto.barberId) await this.requireActiveBarber(dto.barberId);

    // Nomor urut direset per hari. Kunci advisory per tanggal membuat dua kasir
    // yang menekan "Tambah" bersamaan tidak mendapat nomor yang sama.
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`queue:${dateStr}`}))`;

      const last = await tx.queue.findFirst({
        where: { queueDate },
        orderBy: { number: 'desc' },
        select: { number: true },
      });
      const number = (last?.number ?? 0) + 1;

      return tx.queue.create({
        data: {
          number,
          code: formatQueueCode(number),
          queueDate,
          customerName: dto.customerName.trim(),
          customerPhone: dto.customerPhone?.trim() || null,
          note: dto.note?.trim() || null,
          serviceId: service.id,
          barberId: dto.barberId ?? null,
        },
        include: QUEUE_INCLUDE,
      });
    });
  }

  async update(id: number, dto: UpdateQueueDto) {
    const queue = await this.findOne(id);
    if (queue.status !== 'WAITING') {
      throw new ConflictException(
        `Antrian ${queue.code} berstatus ${STATUS_LABEL[queue.status]}, jadi datanya tidak bisa diubah. Batalkan dulu kalau salah input.`,
      );
    }

    if (dto.serviceId !== undefined) await this.requireActiveService(dto.serviceId);
    if (dto.barberId !== undefined && dto.barberId !== null) await this.requireActiveBarber(dto.barberId);

    return this.prisma.queue.update({
      where: { id },
      data: {
        ...(dto.customerName !== undefined ? { customerName: dto.customerName.trim() } : {}),
        ...(dto.customerPhone !== undefined ? { customerPhone: dto.customerPhone.trim() || null } : {}),
        ...(dto.serviceId !== undefined ? { serviceId: dto.serviceId } : {}),
        ...(dto.barberId !== undefined ? { barberId: dto.barberId } : {}),
        ...(dto.note !== undefined ? { note: dto.note.trim() || null } : {}),
      },
      include: QUEUE_INCLUDE,
    });
  }

  /** Panggil pelanggan: WAITING -> IN_PROGRESS. */
  async start(id: number, dto: StartQueueDto) {
    const queue = await this.findOne(id);
    if (queue.status !== 'WAITING') {
      throw new ConflictException(
        `Antrian ${queue.code} berstatus ${STATUS_LABEL[queue.status]}, tidak bisa dipanggil.`,
      );
    }

    let barberId = dto.barberId ?? queue.barberId ?? null;

    if (barberId) {
      await this.requireActiveBarber(barberId);
      const busy = await this.prisma.queue.findFirst({
        where: { queueDate: queue.queueDate, barberId, status: 'IN_PROGRESS' },
        select: { code: true },
      });
      if (busy) {
        throw new ConflictException(
          `Kapster itu sedang melayani ${busy.code}. Selesaikan dulu sebelum memanggil antrian lain.`,
        );
      }
    } else {
      const activeBarbers = await this.prisma.barber.findMany({
        where: { active: true },
        take: 2,
        select: { id: true },
      });
      if (activeBarbers.length === 1) {
        barberId = activeBarbers[0].id; // cuma satu kapster aktif → otomatis
      } else {
        throw new BadRequestException('Pilih kapster dulu sebelum memanggil antrian ini.');
      }
    }

    return this.prisma.queue.update({
      where: { id },
      data: { status: 'IN_PROGRESS', startedAt: new Date(), barberId },
      include: QUEUE_INCLUDE,
    });
  }

  /** Selesaikan layanan: IN_PROGRESS -> DONE. */
  async finish(id: number) {
    const queue = await this.findOne(id);
    if (queue.status !== 'IN_PROGRESS') {
      throw new ConflictException(
        `Antrian ${queue.code} belum dipanggil (status: ${STATUS_LABEL[queue.status]}), jadi belum bisa diselesaikan.`,
      );
    }
    return this.prisma.queue.update({
      where: { id },
      data: { status: 'DONE', finishedAt: new Date() },
      include: QUEUE_INCLUDE,
    });
  }

  /** Batalkan: WAITING / IN_PROGRESS -> CANCELLED. */
  async cancel(id: number) {
    const queue = await this.findOne(id);
    if (queue.status === 'DONE' || queue.status === 'CANCELLED') {
      throw new ConflictException(
        `Antrian ${queue.code} sudah ${STATUS_LABEL[queue.status]}, tidak bisa dibatalkan.`,
      );
    }
    return this.prisma.queue.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: QUEUE_INCLUDE,
    });
  }

  /** Hapus permanen (koreksi salah input). */
  async remove(id: number) {
    const queue = await this.findOne(id);
    await this.prisma.queue.delete({ where: { id } });
    return { deleted: true, id, code: queue.code };
  }

  // ─────────────────────────── internal ───────────────────────────

  private async summaryFor(queueDate: Date) {
    const rows = await this.prisma.queue.findMany({
      where: { queueDate },
      select: {
        id: true,
        number: true,
        code: true,
        status: true,
        customerName: true,
        startedAt: true,
        finishedAt: true,
      },
      orderBy: { number: 'asc' },
    });

    const count = (status: QueueStatus) => rows.filter((r) => r.status === status).length;
    const durations = rows
      .filter((r) => r.status === 'DONE' && r.startedAt && r.finishedAt)
      .map((r) => (r.finishedAt as Date).getTime() - (r.startedAt as Date).getTime());

    const serving = rows.find((r) => r.status === 'IN_PROGRESS') ?? null;
    const next = rows.find((r) => r.status === 'WAITING') ?? null;

    return {
      total: rows.length,
      waiting: count('WAITING'),
      inProgress: count('IN_PROGRESS'),
      done: count('DONE'),
      cancelled: count('CANCELLED'),
      lastNumber: rows.length ? rows[rows.length - 1].number : 0,
      serving: serving
        ? { id: serving.id, code: serving.code, customerName: serving.customerName }
        : null,
      next: next ? { id: next.id, code: next.code, customerName: next.customerName } : null,
      avgServiceMinutes: durations.length
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60000)
        : null,
    };
  }

  private async requireActiveService(id: number) {
    const service = await this.prisma.service.findUnique({ where: { id } });
    if (!service) throw new NotFoundException(`Layanan #${id} tidak ditemukan`);
    if (!service.active) throw new BadRequestException(`Layanan "${service.name}" sedang nonaktif`);
    return service;
  }

  private async requireActiveBarber(id: number) {
    const barber = await this.prisma.barber.findUnique({ where: { id } });
    if (!barber) throw new NotFoundException(`Kapster #${id} tidak ditemukan`);
    if (!barber.active) throw new BadRequestException(`Kapster "${barber.name}" sedang nonaktif`);
    return barber;
  }
}
