import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateQueueDto, ListQueuesQueryDto, StartQueueDto, UpdateQueueDto } from './dto/queue.dto';
import { QueuesService } from './queues.service';

@Controller('queues')
export class QueuesController {
  constructor(private readonly queues: QueuesService) {}

  // GET /api/queues?date=YYYY-MM-DD&status=WAITING&q=budi
  @Get()
  list(@Query() query: ListQueuesQueryDto) {
    return this.queues.list(query);
  }

  // Didaftarkan sebelum ':id' supaya tidak dianggap sebagai id
  @Get('summary')
  summary(@Query() query: ListQueuesQueryDto) {
    return this.queues.summary(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.queues.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateQueueDto) {
    return this.queues.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateQueueDto) {
    return this.queues.update(id, dto);
  }

  // POST /api/queues/:id/start  — panggil pelanggan
  @Post(':id/start')
  start(@Param('id', ParseIntPipe) id: number, @Body() dto: StartQueueDto) {
    return this.queues.start(id, dto);
  }

  // POST /api/queues/:id/finish — tandai selesai
  @Post(':id/finish')
  finish(@Param('id', ParseIntPipe) id: number) {
    return this.queues.finish(id);
  }

  // POST /api/queues/:id/cancel — batalkan
  @Post(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.queues.cancel(id);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.queues.remove(id);
  }
}
