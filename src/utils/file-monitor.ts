import { watch, FSWatcher, Stats, existsSync, statSync, readdir } from "fs";
import { readdir as readdirAsync, stat as statAsync } from "fs/promises";
import { join, resolve, relative, basename } from "path";
import { EventEmitter } from "events";
import { promisify } from "util";
import {
  FileEvent,
  WatchOptions,
  EventHandler,
  WatchDescriptor,
} from "../types/file-monitor";
import { LoggingService } from "../services/logging-service";
import { ILoggingService } from "../types";

/**
 * **Robust File Monitoring System**
 *
 * Features:
 * - Real-time file system monitoring with debouncing
 * - Recursive directory watching with configurable depth
 * - Regex-based file filtering
 * - Dynamic path management
 * - Memory-safe cleanup and error handling
 */
export class FileMonitor extends EventEmitter {
  private readonly watchers: Map<string, WatchDescriptor> = new Map();
  private readonly debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly logger: ILoggingService;
  private isShuttingDown: boolean = false;
  private readonly cleanupHandlers: Set<() => void> = new Set();

  constructor(logger?: ILoggingService) {
    super();
    this.logger = logger || new LoggingService({ channelName: "File Monitor" });
    this.setupGracefulShutdown();
  }

  /**
   * **Add a new path to monitor**
   * Supports both files and directories with comprehensive options
   */
  async addWatch(
    path: string,
    options: WatchOptions = {},
    handler?: EventHandler
  ): Promise<string> {
    if (this.isShuttingDown) {
      throw new Error("FileMonitor is shutting down, cannot add new watchers");
    }

    const normalizedPath = resolve(path);

    if (!existsSync(normalizedPath)) {
      throw new Error(`Path does not exist: ${normalizedPath}`);
    }

    // **Generate unique ID for this watcher**
    const watchId = this.generateWatchId(normalizedPath, options);

    if (this.watchers.has(watchId)) {
      const existing = this.watchers.get(watchId)!;
      if (handler) {
        existing.handlers.add(handler);
      }
      return watchId;
    }

    // **Configure default options**
    const watchOptions: Required<WatchOptions> = {
      recursive: options.recursive ?? false,
      maxDepth: options.maxDepth ?? Infinity,
      debounceMs: options.debounceMs ?? 100,
      includePattern: options.includePattern ?? /.*/,
      excludePattern: options.excludePattern ?? /^$/,
      ignoreInitial: options.ignoreInitial ?? true,
      followSymlinks: options.followSymlinks ?? false,
      ...options,
    };

    const descriptor: WatchDescriptor = {
      id: watchId,
      path: normalizedPath,
      options: watchOptions,
      handlers: new Set(handler ? [handler] : []),
      isActive: false,
    };

    try {
      await this.createWatcher(descriptor);
      this.watchers.set(watchId, descriptor);

      this.logger.info(`Started watching: ${normalizedPath} (ID: ${watchId})`);
      return watchId;
    } catch (error) {
      this.logger.error(
        `Failed to create watcher for ${normalizedPath}:`,
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * **Remove a watcher by ID**
   * Properly cleans up resources and timers
   */
  removeWatch(watchId: string): boolean {
    const descriptor = this.watchers.get(watchId);
    if (!descriptor) {
      return false;
    }

    this.cleanupWatcher(descriptor);
    this.watchers.delete(watchId);

    this.logger.info(`Stopped watching: ${descriptor.path} (ID: ${watchId})`);
    return true;
  }

  /**
   * **Add event handler to existing watcher**
   */
  addHandler(watchId: string, handler: EventHandler): boolean {
    const descriptor = this.watchers.get(watchId);
    if (!descriptor) {
      return false;
    }

    descriptor.handlers.add(handler);
    return true;
  }

  /**
   * **Remove event handler from watcher**
   */
  removeHandler(watchId: string, handler: EventHandler): boolean {
    const descriptor = this.watchers.get(watchId);
    if (!descriptor) {
      return false;
    }

    return descriptor.handlers.delete(handler);
  }

  /**
   * **Get all active watchers**
   */
  getActiveWatchers(): Array<{
    id: string;
    path: string;
    options: WatchOptions;
  }> {
    return Array.from(this.watchers.values())
      .filter((w) => w.isActive)
      .map((w) => ({
        id: w.id,
        path: w.path,
        options: w.options,
      }));
  }

  /**
   * **Create FSWatcher with comprehensive error handling**
   */
  private async createWatcher(descriptor: WatchDescriptor): Promise<void> {
    const { path: watchPath, options } = descriptor;

    try {
      const stats = await statAsync(watchPath);

      if (stats.isDirectory() && options.recursive) {
        // **For recursive directory watching, use manual traversal**
        await this.createRecursiveWatcher(descriptor, stats);
      } else {
        // **Single file or non-recursive directory watch**
        descriptor.watcher = this.createSingleWatcher(descriptor);
      }

      descriptor.isActive = true;
    } catch (error) {
      throw new Error(
        `Failed to create watcher: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * **Create recursive directory watcher with depth control**
   */
  private async createRecursiveWatcher(
    descriptor: WatchDescriptor,
    stats: Stats
  ): Promise<void> {
    if (!stats.isDirectory()) {
      descriptor.watcher = this.createSingleWatcher(descriptor);
      return;
    }

    // **Native recursive watching (Node.js 15.9+)**
    try {
      descriptor.watcher = watch(
        descriptor.path,
        { recursive: true },
        (eventType, filename) => {
          if (filename) {
            this.handleFSEvent(
              descriptor,
              eventType,
              join(descriptor.path, filename)
            );
          }
        }
      );

      this.setupWatcherErrorHandling(descriptor.watcher, descriptor.path);
    } catch (error) {
      // **Fallback to manual recursive watching**
      this.logger.warn(
        `Native recursive watching failed, using manual approach: ${error}`
      );
      await this.createManualRecursiveWatcher(descriptor);
    }
  }

  /**
   * **Manual recursive watcher for environments without native support**
   */
  private async createManualRecursiveWatcher(
    descriptor: WatchDescriptor
  ): Promise<void> {
    const watchedDirs = new Set<string>();

    const addDirectoryWatch = async (
      dirPath: string,
      currentDepth: number = 0
    ): Promise<void> => {
      if (
        currentDepth > descriptor.options.maxDepth ||
        watchedDirs.has(dirPath)
      ) {
        return;
      }

      try {
        const watcher = watch(dirPath, (eventType, filename) => {
          if (filename) {
            this.handleFSEvent(descriptor, eventType, join(dirPath, filename));
          }
        });

        this.setupWatcherErrorHandling(watcher, dirPath);
        watchedDirs.add(dirPath);

        // **Recursively watch subdirectories**
        if (currentDepth < descriptor.options.maxDepth) {
          const entries = await readdirAsync(dirPath, { withFileTypes: true });

          for (const entry of entries) {
            if (entry.isDirectory()) {
              const subDir = join(dirPath, entry.name);
              if (this.shouldIncludePath(subDir, descriptor.options)) {
                await addDirectoryWatch(subDir, currentDepth + 1);
              }
            }
          }
        }
      } catch (error) {
        this.logger.error(`Failed to watch directory ${dirPath}:`, error);
      }
    };

    await addDirectoryWatch(descriptor.path);
  }

  /**
   * **Create single file/directory watcher**
   */
  private createSingleWatcher(descriptor: WatchDescriptor): FSWatcher {
    const watcher = watch(descriptor.path, (eventType, filename) => {
      const fullPath = filename
        ? join(descriptor.path, filename)
        : descriptor.path;
      this.handleFSEvent(descriptor, eventType, fullPath);
    });

    this.setupWatcherErrorHandling(watcher, descriptor.path);
    return watcher;
  }

  /**
   * **Setup error handling for FSWatcher**
   */
  private setupWatcherErrorHandling(watcher: FSWatcher, path: string): void {
    watcher.on("error", (error) => {
      this.logger.error(
        `Watcher error for ${path}:`,
        error instanceof Error ? error : new Error(String(error))
      );
      this.emit("error", error, path);
    });

    watcher.on("close", () => {
      this.logger.debug(`Watcher closed for ${path}`);
    });
  }

  /**
   * **Handle file system events with debouncing and filtering**
   */
  private handleFSEvent(
    descriptor: WatchDescriptor,
    eventType: string,
    filePath: string
  ): void {
    if (!this.shouldIncludePath(filePath, descriptor.options)) {
      return;
    }

    // **Debounce rapid events for the same file**
    const debounceKey = `${descriptor.id}:${filePath}`;

    if (this.debounceTimers.has(debounceKey)) {
      clearTimeout(this.debounceTimers.get(debounceKey)!);
    }

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(debounceKey);
      await this.processFileEvent(descriptor, eventType, filePath);
    }, descriptor.options.debounceMs);

    this.debounceTimers.set(debounceKey, timer);
  }

  /**
   * **Process debounced file events**
   */
  private async processFileEvent(
    descriptor: WatchDescriptor,
    eventType: string,
    filePath: string
  ): Promise<void> {
    try {
      const event = await this.createFileEvent(eventType, filePath);
      if (event) {
        await this.dispatchEvent(descriptor, event);
      }
    } catch (error) {
      this.logger.error(
        `Error processing event for ${filePath}:`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * **Create FileEvent from fs event**
   */
  private async createFileEvent(
    eventType: string,
    filePath: string
  ): Promise<FileEvent | null> {
    const timestamp = new Date();

    try {
      // **Check if file exists to determine event type**
      const exists = existsSync(filePath);
      let stats: Stats | undefined;

      if (exists) {
        stats = await statAsync(filePath);
      }

      // **Map fs events to our event types**
      let type: FileEvent["type"];

      switch (eventType) {
        case "rename":
          type = exists ? "create" : "delete";
          break;
        case "change":
          type = "modify";
          break;
        default:
          type = exists ? "modify" : "delete";
      }

      return {
        type,
        path: filePath,
        stats,
        timestamp,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create file event for ${filePath}:`,
        error instanceof Error ? error : new Error(String(error))
      );
      return null;
    }
  }

  /**
   * **Dispatch event to all handlers**
   */
  private async dispatchEvent(
    descriptor: WatchDescriptor,
    event: FileEvent
  ): Promise<void> {
    // **Emit global event**
    this.emit("fileEvent", event);

    // **Call descriptor-specific handlers**
    const promises: Promise<void>[] = [];

    for (const handler of descriptor.handlers) {
      try {
        const result = handler(event);
        if (result instanceof Promise) {
          promises.push(result);
        }
      } catch (error) {
        this.logger.error(
          `Synchronous handler error:`,
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }

    // **Wait for async handlers**
    if (promises.length > 0) {
      const results = await Promise.allSettled(promises);

      for (const result of results) {
        if (result.status === "rejected") {
          this.logger.error(
            `Async handler error:`,
            result.reason instanceof Error
              ? result.reason
              : new Error(String(result.reason))
          );
        }
      }
    }
  }

  /**
   * **Check if path should be included based on filters**
   */
  private shouldIncludePath(
    filePath: string,
    options: Required<WatchOptions>
  ): boolean {
    const fileName = basename(filePath);

    // **Apply include pattern**
    if (!options.includePattern.test(fileName)) {
      return false;
    }

    // **Apply exclude pattern**
    if (options.excludePattern.test(fileName)) {
      return false;
    }

    // **Skip temporary files and system files**
    if (this.isTemporaryFile(fileName)) {
      return false;
    }

    return true;
  }

  /**
   * **Check if file is temporary or should be ignored**
   */
  private isTemporaryFile(fileName: string): boolean {
    const tempPatterns = [
      /^\.#/, // Emacs temp files
      /~$/, // Backup files
      /^#.*#$/, // Emacs autosave files
      /^\..+\.swp$/, // Vim swap files
      /^\..+\.tmp$/, // Temporary files
      /^\.DS_Store$/, // macOS system files
      /^Thumbs\.db$/, // Windows system files
    ];

    return tempPatterns.some((pattern) => pattern.test(fileName));
  }

  /**
   * **Generate unique watcher ID**
   */
  private generateWatchId(path: string, options: WatchOptions): string {
    const optionsHash = JSON.stringify(options);
    return `watch_${Buffer.from(path + optionsHash)
      .toString("base64")
      .substring(0, 16)}`;
  }

  /**
   * **Clean up individual watcher**
   */
  private cleanupWatcher(descriptor: WatchDescriptor): void {
    if (descriptor.watcher) {
      try {
        descriptor.watcher.close();
      } catch (error) {
        this.logger.error(
          `Error closing watcher for ${descriptor.path}:`,
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }

    // **Clear any pending debounce timers**
    for (const [key, timer] of this.debounceTimers) {
      if (key.startsWith(`${descriptor.id}:`)) {
        clearTimeout(timer);
        this.debounceTimers.delete(key);
      }
    }

    descriptor.isActive = false;
  }

  /**
   * **Setup graceful shutdown handling**
   */
  private setupGracefulShutdown(): void {
    const cleanup = () => {
      if (!this.isShuttingDown) {
        this.shutdown();
      }
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    process.on("beforeExit", cleanup);

    this.cleanupHandlers.add(() => {
      process.off("SIGINT", cleanup);
      process.off("SIGTERM", cleanup);
      process.off("beforeExit", cleanup);
    });
  }

  /**
   * **Graceful shutdown with resource cleanup**
   */
  shutdown(): void {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.logger.info("FileMonitor shutting down...");

    // **Stop all watchers**
    for (const descriptor of this.watchers.values()) {
      this.cleanupWatcher(descriptor);
    }

    // **Clear all timers**
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }

    // **Run cleanup handlers**
    for (const handler of this.cleanupHandlers) {
      try {
        handler();
      } catch (error) {
        this.logger.error(
          "Cleanup handler error:",
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }

    this.watchers.clear();
    this.debounceTimers.clear();
    this.cleanupHandlers.clear();
    this.removeAllListeners();

    this.logger.info("FileMonitor shutdown complete");
  }
}
