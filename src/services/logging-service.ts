import * as vscode from "vscode";
import { ILoggingService } from "../types";

/**
 * **Logging levels**
 */
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * **Service for logging and output management**
 */
export class LoggingService implements ILoggingService {
  private outputChannel: vscode.OutputChannel;
  private logLevel: LogLevel = LogLevel.INFO;

  constructor(channelName: string) {
    this.outputChannel = vscode.window.createOutputChannel(channelName);

    // **Get log level from configuration**
    this.loadLogLevel();

    // **Watch for configuration changes**
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("formatMaster")) {
        this.loadLogLevel();
      }
    });
  }

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

  private log(
    level: LogLevel,
    levelName: string,
    message: string,
    ...args: any[]
  ): void {
    if (level < this.logLevel) {
      return;
    }

    const timestamp = new Date().toISOString();
    const formattedMessage =
      args.length > 0
        ? `${message} ${args.map((arg) => JSON.stringify(arg)).join(" ")}`
        : message;

    this.outputChannel.appendLine(
      `[${timestamp}] [${levelName}] ${formattedMessage}`
    );
  }

  /**
   * **Log debug message**
   */
  debug(message: string, ...args: any[]): void {
    this.log(LogLevel.DEBUG, "DEBUG", message, ...args);
  }

  /**
   * **Log info message**
   */
  info(message: string, ...args: any[]): void {
    this.log(LogLevel.INFO, "INFO", message, ...args);
  }

  /**
   * **Log warning message**
   */
  warn(message: string, ...args: any[]): void {
    this.log(LogLevel.WARN, "WARN", message, ...args);
  }

  /**
   * **Log error message**
   */
  error(message: string | Error, ...args: any[]): void {
    const errorMessage =
      message instanceof Error
        ? `${message.message}\n${message.stack}`
        : message;

    this.log(LogLevel.ERROR, "ERROR", errorMessage, ...args);
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
