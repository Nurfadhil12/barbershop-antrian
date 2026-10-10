// Tipe yang mencerminkan bentuk respons API (lihat api/src/queues/queues.service.ts)

export type QueueStatus = 'WAITING' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';

export interface ServiceCount {
  _count?: { queues: number };
}

export interface ServiceView extends ServiceCount {
  id: number;
  name: string;
  durationMin: number;
  price: number;
  active: boolean;
}

export interface BarberView extends ServiceCount {
  id: number;
  name: string;
  phone: string | null;
  active: boolean;
}

export interface QueueBarberRef {
  id: number;
  name: string;
}

export interface QueueView {
  id: number;
  number: number;
  code: string;
  queueDate: string;
  customerName: string;
  customerPhone: string | null;
  status: QueueStatus;
  note: string | null;
  serviceId: number;
  barberId: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  service: { id: number; name: string; durationMin: number; price: number };
  barber: QueueBarberRef | null;
}

export interface QueueSummary {
  total: number;
  waiting: number;
  inProgress: number;
  done: number;
  cancelled: number;
  lastNumber: number;
  serving: { id: number; code: string; customerName: string } | null;
  next: { id: number; code: string; customerName: string } | null;
  avgServiceMinutes: number | null;
}

export interface QueueListResponse {
  date: string;
  items: QueueView[];
  summary: QueueSummary;
}
