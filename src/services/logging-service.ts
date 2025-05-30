import * as vscode from "vscode";
import {
  ILoggingService,
  DiagnosticLevel,
  LogMessage,
  LogFormat,
} from "../types";

/**
 * **Enhanced logging service options**
 */
export interface LoggingServiceOptions {
  channelName?: string;
  enableTimestamps?: boolean;
  enableColors?: boolean;
  initialLevel?: DiagnosticLevel;
  loadFromConfig?: boolean;
}

/**
 * **Enhanced logging service with VS Code integration**
 */
export class LoggingService implements ILoggingService {
  private readonly _onLogMessage = new vscode.EventEmitter<LogMessage>();
  readonly onLogMessage = this._onLogMessage.event;

  private outputChannel: vscode.OutputChannel;
  private logLevel: DiagnosticLevel;
  private readonly enableTimestamps: boolean;
  private readonly enableColors: boolean;
  private timers: Map<string, number> = new Map();
  private context: Record<string, any> = {};
  private readonly source: string = "Format Master";

  constructor(options: LoggingServiceOptions = {}) {
    const channelName = options.channelName ?? "Format Master";
    this.enableTimestamps = options.enableTimestamps ?? true;
    this.enableColors = options.enableColors ?? true;
    this.logLevel = options.initialLevel ?? DiagnosticLevel.INFO;

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
        this.logLevel = DiagnosticLevel.DEBUG;
        break;
      case "info":
        this.logLevel = DiagnosticLevel.INFO;
        break;
      case "warn":
        this.logLevel = DiagnosticLevel.WARNING;
        break;
      case "error":
        this.logLevel = DiagnosticLevel.ERROR;
        break;
      default:
        this.logLevel = DiagnosticLevel.INFO;
    }
  }

  /**
   * **Set the log level programmatically**
   */
  setLogLevel(level: DiagnosticLevel): void {
    this.logLevel = level;
  }

  /**
   * **Get the current log level**
   */
  getLogLevel(): DiagnosticLevel {
    return this.logLevel;
  }

  /**
   * **Log debug message**
   */
  debug(message: string, ...args: any[]): void {
    this.log(DiagnosticLevel.DEBUG, message, ...args);
    this._onLogMessage.fire({
      level: DiagnosticLevel.DEBUG,
      message: this.formatMessage(message, args),
      timestamp: new Date(),
      source: this.source,
      context: this.context,
    });
  }

  /**
   * **Log info message**
   */
  info(message: string, ...args: any[]): void {
    this.log(DiagnosticLevel.INFO, message, ...args);
    this._onLogMessage.fire({
      level: DiagnosticLevel.INFO,
      message: this.formatMessage(message, args),
      timestamp: new Date(),
      source: this.source,
      context: this.context,
    });
  }

  /**
   * **Log warning message**
   */
  warn(message: string, ...args: any[]): void {
    this.log(DiagnosticLevel.WARNING, message, ...args);
    this._onLogMessage.fire({
      level: DiagnosticLevel.WARNING,
      message: this.formatMessage(message, args),
      timestamp: new Date(),
      source: this.source,
      context: this.context,
    });
  }

  /**
   * **Log error message**
   */
  error(message: string | Error, ...args: any[]): void {
    if (message instanceof Error) {
      const formattedMessage = this.formatMessage(message.message, [
        { stack: message.stack },
        ...args,
      ]);
      this.log(DiagnosticLevel.ERROR, formattedMessage);
      this._onLogMessage.fire({
        level: DiagnosticLevel.ERROR,
        message: formattedMessage,
        timestamp: new Date(),
        source: this.source,
        context: this.context,
        error: message,
      });
    } else {
      this.log(DiagnosticLevel.ERROR, message, ...args);
      this._onLogMessage.fire({
        level: DiagnosticLevel.ERROR,
        message: this.formatMessage(message, args),
        timestamp: new Date(),
        source: this.source,
        context: this.context,
      });
    }
  }

  private formatMessage(message: string, args: any[]): string {
    let formatted = message;
    if (args.length > 0) {
      args.forEach((arg) => {
        if (arg instanceof Error) {
          formatted += `\n${arg.stack || arg.message}`;
        } else if (typeof arg === "object") {
          try {
            formatted += `\n${JSON.stringify(arg, null, 2)}`;
          } catch (e) {
            formatted += `\n[Object that could not be stringified]`;
          }
        } else {
          formatted += ` ${arg}`;
        }
      });
    }
    return formatted;
  }

  /**
   * **Internal logging implementation**
   */
  private log(level: DiagnosticLevel, message: string, ...args: any[]): void {
    if (level < this.logLevel) {
      return;
    }

    const timestamp = this.enableTimestamps
      ? `[${new Date().toISOString()}] `
      : "";

    const levelName = level.toUpperCase();
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
      if (level === DiagnosticLevel.ERROR) {
        console.error(logMessage);
      } else if (level === DiagnosticLevel.WARNING) {
        console.warn(logMessage);
      } else {
        console.log(logMessage);
      }
    }
  }

  /**
   * **Apply visual indicators for log levels**
   */
  private colorizeLevel(levelName: string, level: DiagnosticLevel): string {
    if (!this.enableColors) {
      return levelName;
    }

    // VS Code output panel doesn't support ANSI colors,
    // but we can add emoji indicators for visual distinction
    const indicators = new Map<DiagnosticLevel, string>([
      [DiagnosticLevel.DEBUG, "🔍 "], // Magnifying glass
      [DiagnosticLevel.INFO, "ℹ️ "], // Information
      [DiagnosticLevel.WARNING, "⚠️ "], // Warning
      [DiagnosticLevel.ERROR, "❌ "], // Error
      [DiagnosticLevel.OFF, "⭕ "], // Off
    ]);

    return `${indicators.get(level) || ""}${levelName}`;
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
  clearLogs(): void {
    this.outputChannel.clear();
  }

  startTimer(label: string): void {
    this.timers.set(label, Date.now());
  }

  endTimer(label: string): void {
    const startTime = this.timers.get(label);
    if (startTime) {
      const duration = Date.now() - startTime;
      this.logPerformance(label, duration);
      this.timers.delete(label);
    }
  }

  logPerformance(
    operation: string,
    duration: number,
    metadata?: Record<string, any>
  ): void {
    const perfData = {
      operation,
      duration,
      timestamp: new Date(),
      ...metadata,
    };
    this.info(`Performance: ${operation} took ${duration}ms`, perfData);
  }

  exportLogs(format?: LogFormat): Promise<string> {
    return new Promise((resolve) => {
      // For now, just return the raw content
      const content = this.outputChannel.toString();
      resolve(content);
    });
  }

  withContext(context: Record<string, any>): ILoggingService {
    const newLogger = new LoggingService({
      channelName: this.outputChannel.name,
      enableTimestamps: this.enableTimestamps,
      enableColors: this.enableColors,
      initialLevel: this.logLevel,
    });
    newLogger.context = { ...this.context, ...context };
    return newLogger;
  }

  /**
   * **Dispose the output channel and event emitter**
   */
  dispose(): void {
    this._onLogMessage.dispose();
    this.outputChannel.dispose();
  }
}
