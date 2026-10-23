export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  action_type: 
    | 'INCIDENT_ANALYZED'
    | 'INCIDENT_CREATED'
    | 'STATUS_UPDATED'
    | 'VERIFICATION_ATTEMPTED'
    | 'FUSION_PREVIEWED'
    | 'FUSION_CONFIRMED'
    | 'REPORT_EXPORTED'
    | 'DEMO_RESET';
  incident_id?: string;
  summary: string; // sanitized summary, strictly free of personal data or raw upload bytes
}

export class ActivityLogService {
  private logs: ActivityLogEntry[] = [];
  private maxEntries = 100;

  public log(action_type: ActivityLogEntry['action_type'], summary: string, incident_id?: string): void {
    const entry: ActivityLogEntry = {
      id: 'log-' + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      action_type,
      incident_id,
      summary
    };
    this.logs.unshift(entry);
    if (this.logs.length > this.maxEntries) {
      this.logs.pop();
    }
  }

  public getRecentLogs(): ActivityLogEntry[] {
    return [...this.logs];
  }

  public clear(): void {
    this.logs = [];
  }
}
