import crypto from 'crypto';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class HashCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private ttlMs: number;

  constructor(ttlMinutes: number = 30) {
    this.ttlMs = ttlMinutes * 60 * 1000;
  }

  public computeKey(text: string, fileBuffer?: Buffer): string {
    const hash = crypto.createHash('sha256');
    hash.update(text || '');
    if (fileBuffer) {
      hash.update(fileBuffer);
    }
    return hash.digest('hex');
  }

  public get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  public set(key: string, value: T): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs
    });
  }

  public clear(): void {
    this.cache.clear();
  }
}
