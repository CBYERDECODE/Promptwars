import { IncidentRecord, PriorityLevel } from '@resq-ai/shared';
import { IIncidentRepository, IncidentFilterOptions, PaginatedResult, PaginationOptions } from './types.js';
import { INITIAL_DEMO_INCIDENTS } from '../data/initialDemoIncidents.js';

const PRIORITY_ORDER: Record<PriorityLevel, number> = {
  'Critical': 4,
  'High': 3,
  'Moderate': 2,
  'Low': 1,
  'Needs review': 5 // often sorted to top for triage
};

export class InMemoryIncidentRepository implements IIncidentRepository {
  private realIncidents = new Map<string, IncidentRecord>();
  private demoIncidents = new Map<string, IncidentRecord>();

  constructor() {
    this.resetDemoData();
  }

  public async resetDemoData(): Promise<void> {
    this.demoIncidents.clear();
    for (const incident of INITIAL_DEMO_INCIDENTS) {
      this.demoIncidents.set(incident.id, JSON.parse(JSON.stringify(incident)));
    }
  }

  public async findById(id: string): Promise<IncidentRecord | null> {
    if (this.demoIncidents.has(id)) {
      return JSON.parse(JSON.stringify(this.demoIncidents.get(id)!));
    }
    if (this.realIncidents.has(id)) {
      return JSON.parse(JSON.stringify(this.realIncidents.get(id)!));
    }
    return null;
  }

  public async find(filter: IncidentFilterOptions, pagination: PaginationOptions): Promise<PaginatedResult<IncidentRecord>> {
    const isSimulated = filter.is_simulated;
    let pool: IncidentRecord[] = [];

    if (isSimulated === true) {
      pool = Array.from(this.demoIncidents.values());
    } else if (isSimulated === false) {
      pool = Array.from(this.realIncidents.values());
    } else {
      // Return both if unspecified
      pool = [...Array.from(this.realIncidents.values()), ...Array.from(this.demoIncidents.values())];
    }

    // Apply filters
    if (filter.status) {
      pool = pool.filter(i => i.status === filter.status);
    }
    if (filter.incident_type) {
      pool = pool.filter(i => i.incident_type === filter.incident_type);
    }
    if (filter.priority) {
      pool = pool.filter(i => i.priority.level === filter.priority);
    }
    if (filter.searchQuery && filter.searchQuery.trim().length > 0) {
      const q = filter.searchQuery.toLowerCase();
      pool = pool.filter(i =>
        i.summary.toLowerCase().includes(q) ||
        (i.reported_location && i.reported_location.toLowerCase().includes(q)) ||
        (i.normalized_location && i.normalized_location.formatted_address.toLowerCase().includes(q)) ||
        i.hazard_indicators.some(h => h.toLowerCase().includes(q))
      );
    }

    // Sort
    const sortBy = pagination.sortBy || 'created_at';
    const sortOrder = pagination.sortOrder || 'desc';

    pool.sort((a, b) => {
      if (sortBy === 'priority') {
        const scoreA = PRIORITY_ORDER[a.priority.level] || 0;
        const scoreB = PRIORITY_ORDER[b.priority.level] || 0;
        return sortOrder === 'asc' ? scoreA - scoreB : scoreB - scoreA;
      } else {
        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
      }
    });

    const page = Math.max(1, pagination.page || 1);
    const limit = Math.max(1, pagination.limit || 10);
    const total = pool.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const start = (page - 1) * limit;
    const items = pool.slice(start, start + limit).map(i => JSON.parse(JSON.stringify(i)));

    return {
      items,
      total,
      page,
      limit,
      totalPages
    };
  }

  public async create(incident: IncidentRecord): Promise<IncidentRecord> {
    const copy = JSON.parse(JSON.stringify(incident));
    if (copy.is_simulated) {
      this.demoIncidents.set(copy.id, copy);
    } else {
      this.realIncidents.set(copy.id, copy);
    }
    return JSON.parse(JSON.stringify(copy));
  }

  public async update(id: string, updates: Partial<IncidentRecord>): Promise<IncidentRecord | null> {
    let targetMap = this.realIncidents;
    if (this.demoIncidents.has(id)) {
      targetMap = this.demoIncidents;
    } else if (!this.realIncidents.has(id)) {
      return null;
    }

    const existing = targetMap.get(id)!;
    const updated: IncidentRecord = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString()
    };
    targetMap.set(id, updated);
    return JSON.parse(JSON.stringify(updated));
  }

  public async delete(id: string): Promise<boolean> {
    if (this.demoIncidents.has(id)) {
      return this.demoIncidents.delete(id);
    }
    if (this.realIncidents.has(id)) {
      return this.realIncidents.delete(id);
    }
    return false;
  }

  public async count(): Promise<number> {
    return this.realIncidents.size + this.demoIncidents.size;
  }
}
