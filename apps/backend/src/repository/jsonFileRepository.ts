import fs from 'fs';
import path from 'path';
import { IncidentRecord } from '@resq-ai/shared';
import { IIncidentRepository, IncidentFilterOptions, PaginatedResult, PaginationOptions } from './types.js';
import { InMemoryIncidentRepository } from './inMemoryRepository.js';

export class JsonFileIncidentRepository implements IIncidentRepository {
  private inMemory: InMemoryIncidentRepository;
  private realDataPath: string;
  private demoDataPath: string;

  constructor(realDataPath: string, demoDataPath: string) {
    this.realDataPath = realDataPath;
    this.demoDataPath = demoDataPath;
    this.inMemory = new InMemoryIncidentRepository();
    this.loadFromDisk();
  }

  private ensureDir(filePath: string): void {
    const dirname = path.dirname(filePath);
    if (!fs.existsSync(dirname)) {
      fs.mkdirSync(dirname, { recursive: true });
    }
  }

  private loadFromDisk(): void {
    try {
      this.ensureDir(this.realDataPath);
      this.ensureDir(this.demoDataPath);

      if (fs.existsSync(this.realDataPath)) {
        const raw = fs.readFileSync(this.realDataPath, 'utf-8');
        if (raw.trim()) {
          const items: IncidentRecord[] = JSON.parse(raw);
          for (const item of items) {
            this.inMemory.create(item);
          }
        }
      }

      if (fs.existsSync(this.demoDataPath)) {
        const raw = fs.readFileSync(this.demoDataPath, 'utf-8');
        if (raw.trim()) {
          const items: IncidentRecord[] = JSON.parse(raw);
          for (const item of items) {
            this.inMemory.create(item);
          }
        }
      } else {
        // Persist initial demo data
        this.saveDemoToDisk();
      }
    } catch (err) {
      console.warn('Could not load existing incident files from disk, using fresh memory state:', err);
    }
  }

  private async saveRealToDisk(): Promise<void> {
    try {
      this.ensureDir(this.realDataPath);
      const res = await this.inMemory.find({ is_simulated: false }, { limit: 10000 });
      fs.writeFileSync(this.realDataPath, JSON.stringify(res.items, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to write real incidents to disk:', err);
    }
  }

  private async saveDemoToDisk(): Promise<void> {
    try {
      this.ensureDir(this.demoDataPath);
      const res = await this.inMemory.find({ is_simulated: true }, { limit: 10000 });
      fs.writeFileSync(this.demoDataPath, JSON.stringify(res.items, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to write demo incidents to disk:', err);
    }
  }

  public async findById(id: string): Promise<IncidentRecord | null> {
    return this.inMemory.findById(id);
  }

  public async find(filter: IncidentFilterOptions, pagination: PaginationOptions): Promise<PaginatedResult<IncidentRecord>> {
    return this.inMemory.find(filter, pagination);
  }

  public async create(incident: IncidentRecord): Promise<IncidentRecord> {
    const created = await this.inMemory.create(incident);
    if (created.is_simulated) {
      await this.saveDemoToDisk();
    } else {
      await this.saveRealToDisk();
    }
    return created;
  }

  public async update(id: string, updates: Partial<IncidentRecord>): Promise<IncidentRecord | null> {
    const updated = await this.inMemory.update(id, updates);
    if (updated) {
      if (updated.is_simulated) {
        await this.saveDemoToDisk();
      } else {
        await this.saveRealToDisk();
      }
    }
    return updated;
  }

  public async delete(id: string): Promise<boolean> {
    const deleted = await this.inMemory.delete(id);
    if (deleted) {
      await this.saveRealToDisk();
      await this.saveDemoToDisk();
    }
    return deleted;
  }

  public async resetDemoData(): Promise<void> {
    await this.inMemory.resetDemoData();
    await this.saveDemoToDisk();
  }

  public async count(): Promise<number> {
    return this.inMemory.count();
  }
}
