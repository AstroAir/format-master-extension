import * as vscode from "vscode";

/**
 * **File encoding information**
 * Contains details about a file's encoding
 */
export interface EncodingInfo {
  encoding: string;
  hasBOM: boolean;
  confident: boolean;
}

/**
 * **Text diff interface**
 * Represents a single change in a diff
 */
export interface TextDiffItem {
  type: "add" | "remove" | "modify" | "equal";
  lineNumber?: number;
  originalText?: string;
  newText?: string;
  range?: vscode.Range;
}

/**
 * **Text diff type**
 * Represents a set of changes between two texts
 */
export type TextDiff = TextDiffItem[];
/**
 * **Format configuration interface**
 * Defines the structure for formatting configuration settings
 */
export interface FormatConfig {
  // Basic formatting settings
  indentSize: number;
  useTabs: boolean;
  maxLineLength: number;
  insertFinalNewline: boolean;
  trimTrailingWhitespace: boolean;
  preserveLineEndings: boolean;
  normalizeLineEndings: LineEndingType;

  // Language and formatting behavior
  enabledLanguages: string[];
  customRules: Record<string, any>;
  formatOnSave: boolean;
  formatOnSaveTimeout: number;
  formatOnPaste: boolean;
  formatOnType: boolean;
  formatOnTypeDelay: number;

  // Advanced features
  enablePreview: boolean;
  enableFormatHistory: boolean;
  maxHistoryEntries: number;
  validateBeforeFormat: boolean;
  enableCodeAnalysis: boolean;
  enableStyleSuggestions: boolean;

  // Performance settings
  performanceMonitoring: boolean;
  maxFileSizeKB: number;
  incrementalFormatting: boolean;
  backgroundProcessing: boolean;
  enableCaching: boolean;
  cacheExpirationMinutes: number;

  // Profile and configuration management
  configurationProfiles: Record<string, Partial<FormatConfig>>;
  activeProfile: string;
  respectEditorConfig: boolean;
  respectPrettierConfig: boolean;
  respectESLintConfig: boolean;
  enableWorkspaceInheritance: boolean;

  // UI and UX settings
  statusBarIntegration: boolean;
  showProgressNotifications: boolean;
  enableQuickActions: boolean;
  diagnosticsLevel: DiagnosticLevel;

  // Language-specific configurations
  languageSpecific: Record<string, LanguageConfig>;

  // Formatter discovery and integration
  formatterScanOnStartup: boolean;
  formatterScanCacheTimeout: number;
  showFormatterSuggestions: boolean;
  autoRefreshLanguageSupport: boolean;
  enableExternalFormatterIntegration: boolean;

  // Git integration
  formatOnlyChangedFiles: boolean;
  enableGitHooks: boolean;
  formatBeforeCommit: boolean;

  // Batch processing
  enableBatchFormatting: boolean;
  batchProcessingChunkSize: number;
  batchProcessingDelay: number;

  // Accessibility and internationalization
  enableAccessibilityFeatures: boolean;
  language: string;
  enableScreenReaderSupport: boolean;

  // Additional required properties
  enableCodeLens: boolean;
  enableInlayHints: boolean;
  cacheFormattingResults: boolean;
  parallelFormatting: boolean;
  maxConcurrentFormats: number;
  enableSemanticFormatting: boolean;
  enableAutofixOnFormat: boolean;
  excludePatterns: string[];
  includePatterns: string[];
  enableAutoFormatterDiscovery: boolean;
  customFormatterPaths: string[];
  formatterTimeout: number;
  enableProgressReporting: boolean;
}

/**
 * **Logging service interface**
 */
export interface ILoggingService {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

/**
 * **Log format types**
 */
export type LogFormat = "text" | "json" | "html";

/**
 * **Log message interface**
 */
export interface LogMessage {
  level: DiagnosticLevel;
  message: string;
  timestamp: Date;
  source: string;
  context: Record<string, any>;
  error?: Error;
}

/**
 * **Line ending types**
 */
export enum LineEndingType {
  LF = "lf",
  CRLF = "crlf",
  CR = "cr",
  AUTO = "auto",
}

/**
 * **Diagnostic levels**
 */
export enum DiagnosticLevel {
  OFF = "off",
  ERROR = "error",
  WARNING = "warning",
  INFO = "info",
  DEBUG = "debug",
}

/**
 * **Formatter priority levels**
 */
export enum FormatterPriority {
  HIGHEST = 0,
  HIGH = 1,
  NORMAL = 2,
  LOW = 3,
  LOWEST = 4,
}

/**
 * **Suggestion types**
 */
export enum SuggestionType {
  FORMATTING = "formatting",
  STYLE = "style",
  CONVENTION = "convention",
  PERFORMANCE = "performance",
  ACCESSIBILITY = "accessibility",
  SECURITY = "security",
}

/**
 * **Formatter types**
 */
export enum FormatterType {
  BUILTIN = "builtin",
  FORMAT_MASTER = "formatMaster",
  AUTO = "auto",
  CUSTOM = "custom",
}

/**
 * **Batch job status**
 */
export enum BatchJobStatus {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
  PAUSED = "paused",
}

/**
 * **Formatter integration options**
 */
export interface FormatterIntegrationOptions {
  preferredFormatter?: "builtin" | "formatMaster" | "auto";
  fallbackToBuiltIn?: boolean;
  chainFormatters?: boolean;
  useBuiltInFormatter?: boolean;
  retryOnFailure?: boolean;
}

/**
 * **Code fix interface**
 */
export interface CodeFix {
  title: string;
  edit: vscode.WorkspaceEdit;
  kind: vscode.CodeActionKind;
  isPreferred?: boolean;
}

/**
 * **Style suggestion interface**
 */
export interface StyleSuggestion {
  type: SuggestionType;
  message: string;
  range: vscode.Range;
  severity: DiagnosticLevel;
  fix?: CodeFix;
  confidence: number;
}

/**
 * **Progress information**
 */
export interface ProgressInfo {
  message: string;
  percentage?: number;
  increment?: number;
  total?: number;
  current?: number;
}

/**
 * **External tool configuration**
 */
export interface ExternalToolConfig {
  name: string;
  enabled: boolean;
  command: string;
  args: string[];
  workingDirectory?: string;
  environment?: Record<string, string>;
  timeout: number;
  runBefore: boolean;
  runAfter: boolean;
  errorHandling: string;
}

/**
 * **External tool result**
 */
export interface ExternalToolResult {
  toolName: string;
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  executionTime: number;
  edits?: vscode.TextEdit[];
}

/**
 * **Git integration configuration**
 */
export interface GitIntegrationConfig {
  enabled: boolean;
  formatOnlyChangedFiles: boolean;
  formatBeforeCommit: boolean;
  enablePreCommitHook: boolean;
  enablePrePushHook: boolean;
  respectGitignore: boolean;
  excludePatterns: string[];
  includePatterns: string[];
}

/**
 * **Language configuration**
 */
export interface LanguageConfig {
  enabled: boolean;
  formatter: FormatterType;
  rules: Record<string, any>;
  priority: FormatterPriority;
  timeout: number;
  customFormatter?: string;
  enableCodeAnalysis: boolean;
  enableStyleValidation: boolean;
  customValidationRules: Record<string, any>;
  externalToolsIntegration: ExternalToolConfig[];
  inheritFromGlobal: boolean;
}

/**
 * **Format options**
 */
export interface FormatOptions {
  // Basic options
  range?: vscode.Range;
  insertSpaces: boolean;
  tabSize: number;
  indentSize?: number;
  useTabs?: boolean;

  // Enhanced options
  preserveLineEndings?: boolean;
  trimTrailingWhitespace?: boolean;
  insertFinalNewline?: boolean;
  maxLineLength?: number;

  // Context information
  languageId: string;
  fileName: string;
  workspaceFolder?: string;

  // Processing options
  enableCache?: boolean;
  enableValidation?: boolean;
  enableAnalysis?: boolean;
  timeout?: number;

  // Performance options
  enableProgressReporting?: boolean;
  chunkSize?: number;

  // User preferences
  profile?: string;
  customRules?: Record<string, any>;
  priority?: FormatterPriority;
}

/**
 * **Extended format options**
 */
export interface ExtendedFormatOptions extends FormatOptions {
  integration?: FormatterIntegrationOptions;
}

/**
 * **Format option descriptor**
 */
export interface FormatOptionDescriptor {
  name: string;
  description: string;
  type: string;
  required: boolean;
  default?: any;
  options?: any[];
}

/**
 * **Validation error interface**
 */
export interface ValidationError {
  code: string;
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  severity: DiagnosticLevel;
  source: string;
  fix?: CodeFix;
  relatedInformation?: vscode.DiagnosticRelatedInformation[];
}

/**
 * **Validation warning interface**
 */
export interface ValidationWarning {
  code: string;
  message: string;
  line: number;
  column: number;
  severity: DiagnosticLevel;
  source: string;
  fix?: CodeFix;
}

/**
 * **Validation result interface**
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: StyleSuggestion[];
  score?: number;
  executionTime: number;
}

/**
 * **Format result interface**
 */
export interface FormatResult {
  success: boolean;
  edits: vscode.TextEdit[];
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: StyleSuggestion[];
  formatterUsed: string;
  executionTime: number;
  linesProcessed: number;
  charactersProcessed: number;
  fromCache: boolean;
  cacheKey?: string;
  codeQualityScore?: number;
  styleCompliance?: number;
  externalToolResults?: ExternalToolResult[];
  error?: Error;
  text?: string;
}

/**
 * **Information about built-in formatter capabilities**
 */
export interface BuiltInFormatterInfo {
  available: boolean;
  supportsRange: boolean;
  extension?: string;
}

/**
 * **Batch formatting result interface**
 */
export interface BatchFormattingResult {
  filePath: string;
  success: boolean;
  error?: Error;
  executionTime: number;
  changes: number;
}

/**
 * **Formatter interface**
 */
export interface IFormatter {
  name: string;
  supportedLanguages: string[];
  priority: FormatterPriority;
  canFormat(languageId: string): boolean;
  format(text: string, options: FormatOptions): Promise<FormatResult>;
  formatText(text: string, options: FormatOptions): Promise<FormatResult>;
  validateSyntax(
    content: string,
    languageId: string
  ): Promise<ValidationResult>;
  getSupportedOptions(): FormatOptionDescriptor[];
  getVersion(): string;
}

/**
 * **Format service interface**
 */
export interface IFormatService {
  formatDocument(
    document: vscode.TextDocument,
    options?: FormatOptions
  ): Promise<FormatResult>;
  formatRange(
    document: vscode.TextDocument,
    range: vscode.Range,
    options?: FormatOptions
  ): Promise<FormatResult>;
  formatFiles(files: vscode.Uri[]): Promise<BatchFormattingResult[]>;
}

/**
 * **Configuration Profile interface**
 */
export interface ConfigurationProfile {
  name: string;
  description?: string;
  config: Partial<FormatConfig>;
  createdAt: Date;
  lastModified: Date;
  version: string;
  tags: string[];
  isReadOnly: boolean;
  isDefault: boolean;
}

/**
 * **Git service interface**
 */
export interface IGitService {
  onRepositoryChanged: vscode.Event<string>;
  getChangedFiles(repository?: string): Promise<string[]>;
  getStagedFiles(repository?: string): Promise<string[]>;
  getUnstagedFiles(repository?: string): Promise<string[]>;
  formatChangedFiles(options?: FormatOptions): Promise<FormatResult[]>;
  formatStagedFiles(options?: FormatOptions): Promise<FormatResult[]>;
  installPreCommitHook(): Promise<void>;
  uninstallPreCommitHook(): Promise<void>;
  isPreCommitHookInstalled(): Promise<boolean>;
  getGitIntegrationConfig(): Promise<GitIntegrationConfig>;
  updateGitIntegrationConfig(
    config: Partial<GitIntegrationConfig>
  ): Promise<void>;
  getDiff(files: string[], repository?: string): Promise<Map<string, string>>;
  stageFiles(files: string[], repository?: string): Promise<void>;
  hasUncommittedChanges(repository?: string): Promise<boolean>;
  getCurrentBranch(repository?: string): Promise<string | null>;
  dispose(): void;
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
 * **Language-specific metrics interface**
 */
export interface LanguageMetrics {
  operationCount: number;
  averageTime: number;
  errorCount: number;
  lastUsed: Date;
}

export interface IConfigurationService {
  onConfigurationChanged: vscode.Event<void>;
  getConfig(workspaceFolder?: string): FormatConfig;
  getLanguageConfig(
    languageId: string,
    workspaceFolder?: string
  ): Partial<FormatConfig> & LanguageConfig;
  validateConfig(config?: Partial<FormatConfig>): ValidationResult;
  listProfiles(): ConfigurationProfile[];
  createProfile(
    name: string,
    config: Partial<FormatConfig>,
    description?: string
  ): Promise<void>;
  switchProfile(profileName: string): Promise<void>;
  exportProfile(name: string): Promise<string>;
  importProfile(profileData: string): Promise<void>;
  exportConfiguration(filePath: string): Promise<void>;
  importConfiguration(filePath: string): Promise<void>;
  deleteProfile(profileName: string): Promise<void>;
  resetConfig(): Promise<void>;
  isLanguageEnabled(languageId: string): boolean;
  dispose(): void;
}

export * from "./file-monitor";
export { FormatError, UnsupportedLanguageError } from "../errors/format-error";

/**
 * **Preview result interface**
 * Represents the result of a formatting preview operation
 */
export interface PreviewResult {
  success: boolean;
  text: string;
  diff: TextDiff;
  previewText: string;
  canApply: boolean;
  changes: number;
  linesChanged?: number;
  originalLength?: number;
  newLength?: number;
  formatterUsed?: string;
  error?: string;
}

/**
 * **Preview service interface**
 */
export interface IPreviewService {
  showPreview(document: vscode.TextDocument): Promise<void>;
  dispose(): void;
}
