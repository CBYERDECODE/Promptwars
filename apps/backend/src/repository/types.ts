import { IncidentRecord, IncidentStatus, IncidentType, PriorityLevel } from '@resq-ai/shared';

export interface IncidentFilterOptions {
  status?: IncidentStatus;
  incident_type?: IncidentType;
  priority?: PriorityLevel;
  searchQuery?: string;
  is_simulated?: boolean;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: 'created_at' | 'priority';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface IIncidentRepository {
  findById(id: string): Promise<IncidentRecord | null>;
  find(filter: IncidentFilterOptions, pagination: PaginationOptions): Promise<PaginatedResult<IncidentRecord>>;
  create(incident: IncidentRecord): Promise<IncidentRecord>;
  update(id: string, updates: Partial<IncidentRecord>): Promise<IncidentRecord | null>;
  delete(id: string): Promise<boolean>;
  resetDemoData(): Promise<void>;
  count(): Promise<number>;
}
