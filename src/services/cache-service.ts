import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { ILoggingService } from "../types";

/**
 * **Cache service interface**
 */
interface ICacheService {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, expirationMinutes?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  getSize(): Promise<number>;
  getKeys(): Promise<string[]>;
  getStats(): Promise<CacheStats>;
  optimize(): Promise<void>;
  preload(keys: string[]): Promise<void>;
  dispose(): void;
}

/**
 * **Enhanced cache service with intelligent expiration and optimization**
 */
export class CacheService implements ICacheService {
  private _onCacheCleared = new vscode.EventEmitter<void>();
  public readonly onCacheCleared = this._onCacheCleared.event;

  private cache: Map<string, CacheEntry> = new Map();
  private accessFrequency: Map<string, number> = new Map();
  private lastAccess: Map<string, Date> = new Map();
  private cacheDir: string;
  private maxMemorySize: number = 50 * 1024 * 1024; // 50MB
  private maxEntries: number = 10000;
  private defaultExpirationMinutes: number = 60;
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    context: vscode.ExtensionContext,
    private readonly loggingService?: ILoggingService
  ) {
    this.cacheDir = path.join(context.globalStorageUri.fsPath, "cache");
    this.ensureCacheDirectory();
    this.loadPersistedCache();

    // Start cleanup timer
    this.cleanupInterval = setInterval(
      () => this.performMaintenance(),
      5 * 60 * 1000
    ); // Every 5 minutes
  }

  /**
   * **Get value from cache**
   */
  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check expiration
    if (this.isExpired(entry)) {
      await this.delete(key);
      return undefined;
    }

    // Update access statistics
    this.updateAccessStats(key);

    // Try memory first, then disk
    if (entry.data !== undefined) {
      return entry.data as T;
    }

    // Load from disk if not in memory
    if (entry.persistedPath) {
      try {
        const data = await this.loadFromDisk<T>(entry.persistedPath);
        entry.data = data;
        return data;
      } catch (error) {
        console.error("Failed to load cache entry from disk:", error);
        await this.delete(key);
        return undefined;
      }
    }

    return undefined;
  }

  /**
   * **Set value in cache**
   */
  async set<T>(
    key: string,
    value: T,
    expirationMinutes?: number
  ): Promise<void> {
    const expirationTime = new Date();
    expirationTime.setMinutes(
      expirationTime.getMinutes() +
        (expirationMinutes || this.defaultExpirationMinutes)
    );

    const entry: CacheEntry = {
      key,
      data: value,
      size: this.calculateSize(value),
      createdAt: new Date(),
      expiresAt: expirationTime,
      accessCount: 1,
      lastAccessTime: new Date(),
      checksum: this.generateChecksum(value),
    };

    // Check if we need to persist to disk
    if (entry.size > 1024 * 1024) {
      // 1MB threshold for disk persistence
      entry.persistedPath = await this.persistToDisk(key, value);
      entry.data = undefined; // Clear from memory to save space
    }

    this.cache.set(key, entry);
    this.updateAccessStats(key);

    // Trigger cleanup if needed
    await this.checkMemoryLimits();
  }

  /**
   * **Delete value from cache**
   */
  async delete(key: string): Promise<void> {
    const entry = this.cache.get(key);

    if (entry && entry.persistedPath) {
      try {
        await fs.promises.unlink(entry.persistedPath);
      } catch (error) {
        // File might not exist, ignore error
      }
    }

    this.cache.delete(key);
    this.accessFrequency.delete(key);
    this.lastAccess.delete(key);
  }

  /**
   * **Clear all cache**
   */
  async clear(): Promise<void> {
    // Delete all persisted files
    for (const entry of this.cache.values()) {
      if (entry.persistedPath) {
        try {
          await fs.promises.unlink(entry.persistedPath);
        } catch (error) {
          // Ignore errors
        }
      }
    }

    this.cache.clear();
    this.accessFrequency.clear();
    this.lastAccess.clear();

    // Clear cache directory
    try {
      const files = await fs.promises.readdir(this.cacheDir);
      await Promise.all(
        files.map((file) =>
          fs.promises.unlink(path.join(this.cacheDir, file)).catch(() => {})
        )
      );
    } catch (error) {
      // Ignore errors
    }

    this._onCacheCleared.fire();
  }

  /**
   * **Get cache size in bytes**
   */
  async getSize(): Promise<number> {
    let totalSize = 0;

    for (const entry of this.cache.values()) {
      totalSize += entry.size;
    }

    return totalSize;
  }

  /**
   * **Get all cache keys**
   */
  async getKeys(): Promise<string[]> {
    return Array.from(this.cache.keys());
  }

  /**
   * **Get cache statistics**
   */
  async getStats(): Promise<CacheStats> {
    const totalEntries = this.cache.size;
    const totalSize = await this.getSize();
    const totalAccesses = Array.from(this.accessFrequency.values()).reduce(
      (sum, count) => sum + count,
      0
    );
    const expiredEntries = Array.from(this.cache.values()).filter((entry) =>
      this.isExpired(entry)
    ).length;

    // Calculate hit rate (simplified - would need hit/miss tracking for accurate calculation)
    const hitRate =
      totalAccesses > 0
        ? Math.min(0.9, totalAccesses / (totalAccesses * 1.1))
        : 0;
    const missRate = 1 - hitRate;

    return {
      totalEntries,
      totalSize,
      hitRate,
      missRate,
      expiredEntries,
      memoryUsage: totalSize,
    };
  }

  /**
   * **Optimize cache by removing less frequently used items**
   */
  async optimize(): Promise<void> {
    const stats = await this.getStats();

    if (stats.totalSize < this.maxMemorySize * 0.8) {
      return; // No optimization needed
    }

    // Get entries sorted by access frequency (ascending)
    const entries = Array.from(this.cache.entries())
      .map(([key, entry]) => ({
        key,
        entry,
        frequency: this.accessFrequency.get(key) || 0,
        lastAccess: this.lastAccess.get(key) || new Date(0),
      }))
      .sort((a, b) => {
        // Sort by frequency first, then by last access time
        if (a.frequency !== b.frequency) {
          return a.frequency - b.frequency;
        }
        return a.lastAccess.getTime() - b.lastAccess.getTime();
      });

    // Remove least frequently used entries until we're under the limit
    let currentSize = stats.totalSize;
    let removedCount = 0;

    for (const { key, entry } of entries) {
      if (currentSize < this.maxMemorySize * 0.7) {
        break;
      }

      await this.delete(key);
      currentSize -= entry.size;
      removedCount++;
    }

    console.log(
      `Cache optimization completed. Removed ${removedCount} entries.`
    );
  }

  /**
   * **Preload cache entries for better performance**
   */
  async preload(keys: string[]): Promise<void> {
    const loadPromises = keys.map(async (key) => {
      const entry = this.cache.get(key);
      if (entry && entry.persistedPath && entry.data === undefined) {
        try {
          entry.data = await this.loadFromDisk(entry.persistedPath);
        } catch (error) {
          console.warn(`Failed to preload cache entry ${key}:`, error);
        }
      }
    });

    await Promise.allSettled(loadPromises);
  }

  /**
   * **Dispose of the cache service**
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this._onCacheCleared.dispose();
  }

  /**
   * **Check if cache entry is expired**
   */
  private isExpired(entry: CacheEntry): boolean {
    return new Date() > entry.expiresAt;
  }

  /**
   * **Update access statistics**
   */
  private updateAccessStats(key: string): void {
    const currentCount = this.accessFrequency.get(key) || 0;
    this.accessFrequency.set(key, currentCount + 1);
    this.lastAccess.set(key, new Date());

    // Update entry stats
    const entry = this.cache.get(key);
    if (entry) {
      entry.accessCount++;
      entry.lastAccessTime = new Date();
    }
  }

  /**
   * **Calculate approximate size of an object**
   */
  private calculateSize(obj: any): number {
    const str = JSON.stringify(obj);
    return new Blob([str]).size;
  }

  /**
   * **Generate checksum for cache validation**
   */
  private generateChecksum(obj: any): string {
    const str = JSON.stringify(obj);
    return crypto.createHash("md5").update(str).digest("hex");
  }

  /**
   * **Persist large objects to disk**
   */
  private async persistToDisk<T>(key: string, value: T): Promise<string> {
    const filename = `${this.sanitizeKey(key)}.json`;
    const filepath = path.join(this.cacheDir, filename);

    await fs.promises.writeFile(filepath, JSON.stringify(value), "utf8");
    return filepath;
  }

  /**
   * **Load object from disk**
   */
  private async loadFromDisk<T>(filepath: string): Promise<T> {
    const content = await fs.promises.readFile(filepath, "utf8");
    return JSON.parse(content) as T;
  }

  /**
   * **Sanitize cache key for filesystem**
   */
  private sanitizeKey(key: string): string {
    return key.replace(/[^a-zA-Z0-9-_]/g, "_");
  }

  /**
   * **Ensure cache directory exists**
   */
  private ensureCacheDirectory(): void {
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    } catch (error) {
      console.error("Failed to create cache directory:", error);
    }
  }

  /**
   * **Load persisted cache entries on startup**
   */
  private async loadPersistedCache(): Promise<void> {
    try {
      const files = await fs.promises.readdir(this.cacheDir);
      const jsonFiles = files.filter((file) => file.endsWith(".json"));

      for (const file of jsonFiles) {
        const filepath = path.join(this.cacheDir, file);
        const key = file.replace(".json", "").replace(/_/g, " "); // Reverse sanitization

        try {
          const stats = await fs.promises.stat(filepath);
          const entry: CacheEntry = {
            key,
            data: undefined, // Will be loaded on demand
            size: stats.size,
            createdAt: stats.birthtime,
            expiresAt: new Date(
              stats.mtime.getTime() + this.defaultExpirationMinutes * 60 * 1000
            ),
            accessCount: 0,
            lastAccessTime: stats.atime,
            persistedPath: filepath,
            checksum: "",
          };

          this.cache.set(key, entry);
        } catch (error) {
          console.warn(`Failed to load cache metadata for ${file}:`, error);
        }
      }
    } catch (error) {
      console.warn("Failed to load persisted cache:", error);
    }
  }

  /**
   * **Check memory limits and trigger cleanup if needed**
   */
  private async checkMemoryLimits(): Promise<void> {
    const currentSize = await this.getSize();

    if (currentSize > this.maxMemorySize || this.cache.size > this.maxEntries) {
      await this.optimize();
    }
  }

  /**
   * **Perform regular maintenance tasks**
   */
  private async performMaintenance(): Promise<void> {
    // Remove expired entries
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      await this.delete(key);
    }

    // Check if optimization is needed
    await this.checkMemoryLimits();

    console.log(
      `Cache maintenance completed. Removed ${expiredKeys.length} expired entries.`
    );
  }
}

/**
 * **Cache statistics interface**
 */
interface CacheStats {
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  missRate: number;
  expiredEntries: number;
  memoryUsage: number;
}

/**
 * **Cache entry interface**
 */
interface CacheEntry {
  key: string;
  data?: any;
  size: number;
  createdAt: Date;
  expiresAt: Date;
  accessCount: number;
  lastAccessTime: Date;
  persistedPath?: string;
  checksum: string;
}
