import { STATUS_LABEL } from '@/lib/format';
import type { QueueStatus } from '@/lib/types';

export function StatusBadge({ status }: { status: QueueStatus }) {
  return <span className={`badge ${status}`}>{STATUS_LABEL[status]}</span>;
}
