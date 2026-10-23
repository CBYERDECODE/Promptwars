import { IncidentRecord } from '@resq-ai/shared';

interface IdempotencyRecord {
  incident: IncidentRecord;
  createdAt: number;
}

export class IdempotencyManager {
  private records = new Map<string, IdempotencyRecord>();
  private ttlMs = 15 * 60 * 1000; // 15 minutes

  public get(key: string): IncidentRecord | null {
    const entry = this.records.get(key);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.records.delete(key);
      return null;
    }
    return entry.incident;
  }

  public set(key: string, incident: IncidentRecord): void {
    this.records.set(key, {
      incident,
      createdAt: Date.now()
    });
  }
}
