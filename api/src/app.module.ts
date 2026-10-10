import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { BarbersModule } from './barbers/barbers.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueuesModule } from './queues/queues.module';
import { ServicesModule } from './services/services.module';

@Module({
  imports: [PrismaModule, ServicesModule, BarbersModule, QueuesModule],
  controllers: [AppController],
})
export class AppModule {}
