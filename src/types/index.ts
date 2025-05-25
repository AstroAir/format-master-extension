import * as vscode from "vscode";

/**
 * **Enhanced formatting configuration interface**
 */
export interface FormatConfig {
  indentSize: number;
  useTabs: boolean;
  maxLineLength: number;
  insertFinalNewline: boolean;
  trimTrailingWhitespace: boolean;
  enabledLanguages: string[];
  customRules: Record<string, any>;
  formatOnSave: boolean;
  enablePreview: boolean;
  validateBeforeFormat: boolean;
  performanceMonitoring: boolean;
  maxFileSizeKB: number;
  incrementalFormatting: boolean;
  formatOnPaste: boolean;
  formatOnType: boolean;
  configurationProfiles: Record<string, Partial<FormatConfig>>;
  activeProfile: string;
  respectEditorConfig: boolean;
  respectPrettierConfig: boolean;
  statusBarIntegration: boolean;
  diagnosticsLevel: DiagnosticLevel;
  languageSpecific: Record<string, LanguageConfig>;
  
  // **Universal formatter scanning options**
  enableAutoFormatterDiscovery: boolean;
  formatterScanOnStartup: boolean;
  formatterScanCacheTimeout: number; // minutes
  showFormatterSuggestions: boolean;
  autoRefreshLanguageSupport: boolean;
}

/**
 * **Language-specific configuration**
 */
export interface LanguageConfig {
  enabled: boolean;
  formatter: FormatterType;
  rules: Record<string, any>;
  priority?: FormatterPriority;
  timeout?: number;
  customFormatter?: string;
}

/**
 * **Diagnostic levels**
 */
export enum DiagnosticLevel {
  OFF = "off",
  ERROR = "error", 
  WARNING = "warning",
  INFO = "info",
  DEBUG = "debug"
}

/**
 * **Formatter types**
 */
export enum FormatterType {
  BUILTIN = "builtin",
  FORMAT_MASTER = "formatMaster",
  AUTO = "auto",
  CUSTOM = "custom"
}

/**
 * **Performance metrics interface**
 */
export interface PerformanceMetrics {
  totalFormatOperations: number;
  averageFormatTime: number;
  lastFormatTime: number;
  successRate: number;
  errorCount: number;
  cacheHitRate: number;
  memoryUsage: number;
  languageBreakdown: Record<string, LanguageMetrics>;
}

/**
 * **Language-specific metrics**
 */
export interface LanguageMetrics {
  operationCount: number;
  averageTime: number;
  errorCount: number;
  lastUsed: Date;
}

/**
 * **Configuration profile interface**
 */
export interface ConfigurationProfile {
  name: string;
  description?: string;
  config: Partial<FormatConfig>;
  tags?: string[];
  created: Date;
  lastUsed?: Date;
}

/**
 * **Validation result interface**
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  suggestions?: string[];
}

/**
 * **Validation error interface**
 */
export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  suggestedFix?: any;
}

/**
 * **Enhanced formatting options for specific operations**
 */
export interface FormatOptions extends Partial<FormatConfig> {
  languageId: string;
  tabSize?: number;
  insertSpaces?: boolean;
  fileName?: string;
  workspaceFolder?: string;
  profile?: string;
  
  // YAML specific options
  alignComments?: boolean;
  spaceAfterDash?: boolean;
  spaceAfterColon?: boolean;
  quoteKeys?: boolean;
  normalizeBooleans?: boolean;
  normalizeNulls?: boolean;
}

/**
 * **Enhanced result of a formatting operation**
 */
export interface FormatResult {
  success: boolean;
  text?: string;
  error?: Error;
  changes?: number;
  formatterUsed?: string;
  executionTime?: number;
  originalLength?: number;
  newLength?: number;
  linesChanged?: number;
  warnings?: string[];
}

/**
 * **Preview result interface**
 */
export interface PreviewResult extends FormatResult {
  diff?: TextDiff[];
  previewText?: string;
  canApply: boolean;
}

/**
 * **Text diff interface**
 */
export interface TextDiff {
  type: 'add' | 'remove' | 'modify';
  lineNumber: number;
  originalText?: string;
  newText?: string;
  range?: vscode.Range;
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
  validateConfiguration(): Promise<ValidationResult>;
  exportConfiguration(filePath: string): Promise<void>;
  importConfiguration(filePath: string): Promise<void>;
  createProfile(name: string, config: Partial<FormatConfig>): Promise<void>;
  getProfiles(): Promise<ConfigurationProfile[]>;
  switchProfile(profileName: string): Promise<void>;
  deleteProfile(profileName: string): Promise<void>;
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
    // **Enhanced formatting methods**
  smartFormatDocument(
    document: vscode.TextDocument,
    options?: FormatOptions
  ): Promise<vscode.TextEdit[]>;
  getSupportedLanguages(): string[];
  getIntegrationService(): any; // FormatterIntegrationService type would be circular
  
  // **Dynamic language support methods**
  refreshLanguageSupport(): Promise<void>;
  getDiscoveredLanguages(): Promise<string[]>;
  checkLanguageSupport(languageId: string): Promise<boolean>;
}

/**
 * **Performance monitoring service interface**
 */
export interface IPerformanceMonitoringService {
  recordFormatOperation(languageId: string, duration: number, success: boolean): void;
  getMetrics(): PerformanceMetrics;
  getLanguageMetrics(languageId: string): LanguageMetrics | undefined;
  clearMetrics(): void;
  generateReport(): string;
  setMemoryUsage(usage: number): void;
}

/**
 * **Preview service interface**
 */
export interface IPreviewService {
  previewFormat(document: vscode.TextDocument, options?: FormatOptions): Promise<PreviewResult>;
  showPreview(previewResult: PreviewResult): Promise<boolean>;
  generateDiff(original: string, formatted: string): TextDiff[];
  disposePreview(): void;
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
