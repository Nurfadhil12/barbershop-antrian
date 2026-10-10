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
import { BarbersService } from './barbers.service';
import { CreateBarberDto, UpdateBarberDto } from './dto/barber.dto';

@Controller('barbers')
export class BarbersController {
  constructor(private readonly barbers: BarbersService) {}

  // GET /api/barbers?activeOnly=true
  @Get()
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.barbers.findAll(activeOnly === 'true' || activeOnly === '1');
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.barbers.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateBarberDto) {
    return this.barbers.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBarberDto) {
    return this.barbers.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.barbers.remove(id);
  }
}
