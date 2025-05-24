import * as vscode from "vscode";
import { ILoggingService } from "../types";

/**
 * **Logging levels**
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * **Enhanced logging service options**
 */
export interface LoggingServiceOptions {
  channelName?: string;
  enableTimestamps?: boolean;
  enableColors?: boolean;
  initialLevel?: LogLevel;
  loadFromConfig?: boolean;
}

/**
 * **Enhanced logging service with VS Code integration**
 */
export class LoggingService implements ILoggingService {
  private outputChannel: vscode.OutputChannel;
  private logLevel: LogLevel;
  private readonly enableTimestamps: boolean;
  private readonly enableColors: boolean;

  constructor(options: LoggingServiceOptions = {}) {
    const channelName = options.channelName ?? "Format Master";
    this.enableTimestamps = options.enableTimestamps ?? true;
    this.enableColors = options.enableColors ?? true;
    this.logLevel = options.initialLevel ?? LogLevel.INFO;

    this.outputChannel = vscode.window.createOutputChannel(channelName);

    // Load config if requested
    if (options.loadFromConfig ?? true) {
      this.loadLogLevel();

      // Watch for configuration changes
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("formatMaster")) {
          this.loadLogLevel();
        }
      });
    }
  }

  /**
   * **Load log level from VS Code configuration**
   */
  private loadLogLevel(): void {
    const config = vscode.workspace.getConfiguration("formatMaster");
    const level = config.get<string>("logLevel", "info").toLowerCase();

    switch (level) {
      case "debug":
        this.logLevel = LogLevel.DEBUG;
        break;
      case "info":
        this.logLevel = LogLevel.INFO;
        break;
      case "warn":
        this.logLevel = LogLevel.WARN;
        break;
      case "error":
        this.logLevel = LogLevel.ERROR;
        break;
      default:
        this.logLevel = LogLevel.INFO;
    }
  }

  /**
   * **Set the log level programmatically**
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * **Get the current log level**
   */
  getLogLevel(): LogLevel {
    return this.logLevel;
  }

  /**
   * **Log debug message**
   */
  debug(message: string, ...args: any[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }

  /**
   * **Log info message**
   */
  info(message: string, ...args: any[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }

  /**
   * **Log warning message**
   */
  warn(message: string, ...args: any[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }

  /**
   * **Log error message**
   */
  error(message: string | Error, ...args: any[]): void {
    if (message instanceof Error) {
      this.log(
        LogLevel.ERROR,
        message.message,
        ...[{ stack: message.stack }, ...args]
      );
    } else {
      this.log(LogLevel.ERROR, message, ...args);
    }
  }

  /**
   * **Internal logging implementation**
   */
  private log(level: LogLevel, message: string, ...args: any[]): void {
    if (level < this.logLevel) {
      return;
    }

    const timestamp = this.enableTimestamps
      ? `[${new Date().toISOString()}] `
      : "";

    const levelName = LogLevel[level];
    const coloredLevel = this.enableColors
      ? this.colorizeLevel(levelName, level)
      : levelName;

    let logMessage = `${timestamp}${coloredLevel}: ${message}`;

    // Format additional arguments
    if (args.length > 0) {
      args.forEach((arg) => {
        if (arg instanceof Error) {
          logMessage += `\n${arg.stack || arg.message}`;
        } else if (typeof arg === "object") {
          try {
            logMessage += `\n${JSON.stringify(arg, null, 2)}`;
          } catch (e) {
            logMessage += `\n[Object that could not be stringified]`;
          }
        } else {
          logMessage += ` ${arg}`;
        }
      });
    }

    // Write to VS Code output channel
    this.outputChannel.appendLine(logMessage);

    // Also log to console in development mode
    if (process.env.NODE_ENV === "development") {
      if (level >= LogLevel.ERROR) {
        console.error(logMessage);
      } else if (level >= LogLevel.WARN) {
        console.warn(logMessage);
      } else {
        console.log(logMessage);
      }
    }
  }

  /**
   * **Apply visual indicators for log levels**
   */
  private colorizeLevel(levelName: string, level: LogLevel): string {
    if (!this.enableColors) {
      return levelName;
    }

    // VS Code output panel doesn't support ANSI colors,
    // but we can add emoji indicators for visual distinction
    const indicators = {
      [LogLevel.DEBUG]: "🔍 ", // Magnifying glass
      [LogLevel.INFO]: "ℹ️ ", // Information
      [LogLevel.WARN]: "⚠️ ", // Warning
      [LogLevel.ERROR]: "❌ ", // Error
    };

    return `${indicators[level]}${levelName}`;
  }

  /**
   * **Show the output channel**
   */
  show(): void {
    this.outputChannel.show();
  }

  /**
   * **Clear the output channel**
   */
  clear(): void {
    this.outputChannel.clear();
  }

  /**
   * **Dispose the output channel**
   */
  dispose(): void {
    this.outputChannel.dispose();
  }
}
