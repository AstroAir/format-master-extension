import * as vscode from "vscode";

/**
 * **Core formatting configuration interface**
 */
export interface FormatConfig {
  indentSize: number;
  useTabs: boolean;
  maxLineLength: number;
  insertFinalNewline: boolean;
  trimTrailingWhitespace: boolean;
  enabledLanguages: string[];
  customRules: Record<string, any>;
}

/**
 * **Formatting options for specific operations**
 */
export interface FormatOptions extends Partial<FormatConfig> {
  languageId: string;
  tabSize?: number;
  insertSpaces?: boolean;
}

/**
 * **Result of a formatting operation**
 */
export interface FormatResult {
  success: boolean;
  text?: string;
  error?: Error;
  changes?: number;
}

/**
 * **File encoding information**
 */
export interface EncodingInfo {
  encoding: string;
  hasBOM: boolean;
  confident: boolean;
}

/**
 * **Base interface for all formatters**
 */
export interface IFormatter {
  readonly supportedLanguages: string[];
  canFormat(languageId: string): boolean;
  formatText(text: string, options: FormatOptions): Promise<FormatResult>;
}

/**
 * **Configuration service interface**
 */
export interface IConfigurationService {
  getConfig(): FormatConfig;
  getLanguageConfig(languageId: string): Partial<FormatConfig>;
  onConfigurationChanged: vscode.Event<void>;
}

/**
 * **Logging service interface**
 */
export interface ILoggingService {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string | Error, ...args: any[]): void;
  show(): void;
}

/**
 * **Format service interface**
 */
export interface IFormatService {
  formatDocument(
    document: vscode.TextDocument,
    options?: FormatOptions
  ): Promise<vscode.TextEdit[]>;
  formatRange(
    document: vscode.TextDocument,
    range: vscode.Range,
    options?: FormatOptions
  ): Promise<vscode.TextEdit[]>;
  registerFormatter(formatter: IFormatter): void;
  getFormatter(languageId: string): IFormatter | undefined;
}

/**
 * **Custom error types**
 */
export class FormattingError extends Error {
  constructor(
    message: string,
    public readonly languageId: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = "FormattingError";
  }
}

export class UnsupportedLanguageError extends FormattingError {
  constructor(languageId: string) {
    super(`Formatting not supported for language: ${languageId}`, languageId);
    this.name = "UnsupportedLanguageError";
  }
}

/**
 * **VSCode formatter integration options**
 */
export interface FormatterIntegrationOptions {
  useBuiltInFormatter: boolean;
  fallbackToBuiltIn: boolean;
  preferredFormatter: "formatMaster" | "builtin" | "auto";
  chainFormatters: boolean;
  retryOnFailure: boolean;
}

/**
 * **Formatter priority levels**
 */
export enum FormatterPriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  CRITICAL = 4,
}

/**
 * **Built-in formatter detection result**
 */
export interface BuiltInFormatterInfo {
  available: boolean;
  extension?: string;
  name?: string;
  version?: string;
  supportsRange: boolean;
}

/**
 * **Enhanced format options with integration settings**
 */
export interface ExtendedFormatOptions extends FormatOptions {
  integration?: FormatterIntegrationOptions;
  priority?: FormatterPriority;
  timeout?: number;
  retryCount?: number;
}

/**
 * **Formatter execution result with metadata**
 */
export interface FormatterExecutionResult extends FormatResult {
  formatterUsed: "formatMaster" | "builtin" | "chained";
  executionTime: number;
  retryCount?: number;
  builtInFormatterInfo?: BuiltInFormatterInfo;
}

/**
 * **Formatter chain configuration**
 */
export interface FormatterChain {
  primary: string;
  fallback: string[];
  postProcessors: string[];
}
