export interface FileEvent {
  type: "create" | "modify" | "delete" | "rename";
  path: string;
  previousPath?: string; // For rename events
  stats?: import("fs").Stats;
  timestamp: Date;
}

export interface WatchOptions {
  recursive?: boolean;
  maxDepth?: number;
  debounceMs?: number;
  includePattern?: RegExp;
  excludePattern?: RegExp;
  ignoreInitial?: boolean;
  followSymlinks?: boolean;
}

export type EventHandler = (event: FileEvent) => void | Promise<void>;

export interface WatchDescriptor {
  id: string;
  path: string;
  options: Required<WatchOptions>;
  handlers: Set<EventHandler>;
  watcher?: import("fs").FSWatcher;
  isActive: boolean;
}
