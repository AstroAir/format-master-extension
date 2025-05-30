import * as vscode from "vscode";
import {
  ValidationResult,
  ValidationError,
  FormatConfig,
  LanguageConfig,
  DiagnosticLevel,
  ILoggingService,
  SuggestionType,
  StyleSuggestion,
} from "../types";

/**
 * **Service for validating configuration and providing suggestions**
 */
export class ValidationService {
  constructor(private loggingService: ILoggingService) {}

  /**
   * **Validate complete configuration**
   */
  async validateConfiguration(config: FormatConfig): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const suggestions: StyleSuggestion[] = [];

    try {
      // **Validate basic configuration**
      this.validateBasicConfig(config, errors, warnings);

      // **Validate language-specific configurations**
      this.validateLanguageConfigs(config, errors, warnings);

      // **Validate performance settings**
      this.validatePerformanceSettings(config, errors, warnings);

      // **Generate suggestions**
      this.generateSuggestions(config, suggestions);

      const isValid = errors.length === 0;

      this.loggingService.info(
        `Configuration validation completed: ${isValid ? "Valid" : "Invalid"} ` +
          `(${errors.length} errors, ${warnings.length} warnings)`
      );

      return {
        isValid,
        errors,
        warnings,
        suggestions,
        executionTime: 0, // TODO: implement actual timing
        score: 0, // TODO: implement actual scoring
      };
    } catch (error) {
      this.loggingService.error("Configuration validation failed", error);

      return {
        isValid: false,
        errors: [
          {
            code: "VALIDATION_FAILED",
            message: `Validation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            line: 0,
            column: 0,
            severity: DiagnosticLevel.ERROR,
            source: "validation-service",
          },
        ],
        warnings: [],
        suggestions: [],
        executionTime: 0,
      };
    }
  }

  /**
   * **Validate basic configuration settings**
   */
  private validateBasicConfig(
    config: FormatConfig,
    errors: ValidationError[],
    warnings: ValidationError[]
  ): void {
    // **Validate indent size**
    if (config.indentSize < 1 || config.indentSize > 20) {
      errors.push({
        code: "INVALID_INDENT_SIZE",
        message: "Indent size must be between 1 and 20",
        line: 0,
        column: 0,
        severity: DiagnosticLevel.ERROR,
        source: "validation-service",
      });
    }

    // **Validate max line length**
    if (config.maxLineLength < 40 || config.maxLineLength > 500) {
      warnings.push({
        code: "INVALID_MAX_LINE_LENGTH",
        message: "Max line length should be between 40 and 500 characters",
        line: 0,
        column: 0,
        severity: DiagnosticLevel.WARNING,
        source: "validation-service",
      });
    }

    // **Validate enabled languages**
    if (!config.enabledLanguages || config.enabledLanguages.length === 0) {
      warnings.push({
        code: "NO_LANGUAGES_ENABLED",
        message: "No languages enabled for formatting",
        line: 0,
        column: 0,
        severity: DiagnosticLevel.WARNING,
        source: "validation-service",
      });
    }

    // **Validate file size limit**
    if (
      config.maxFileSizeKB &&
      (config.maxFileSizeKB < 1 || config.maxFileSizeKB > 100000)
    ) {
      warnings.push({
        code: "INVALID_FILE_SIZE_LIMIT",
        message: "File size limit should be between 1KB and 100MB",
        line: 0,
        column: 0,
        severity: DiagnosticLevel.WARNING,
        source: "validation-service",
      });
    }

    // **Check for conflicting settings**
    if (config.useTabs && config.indentSize !== 1) {
      warnings.push({
        code: "INDENT_SIZE_IGNORED",
        message: "Indent size is ignored when using tabs",
        line: 0,
        column: 0,
        severity: DiagnosticLevel.WARNING,
        source: "validation-service",
      });
    }
  }

  /**
   * **Validate language-specific configurations**
   */
  private validateLanguageConfigs(
    config: FormatConfig,
    errors: ValidationError[],
    warnings: ValidationError[]
  ): void {
    if (!config.languageSpecific) {
      return;
    }

    const supportedLanguages = [
      "javascript",
      "typescript",
      "json",
      "xml",
      "css",
      "scss",
      "less",
      "html",
      "python",
      "markdown",
      "yaml",
      "yml",
    ];

    for (const [languageId, langConfig] of Object.entries(
      config.languageSpecific
    )) {
      // **Check if language is supported**
      if (!supportedLanguages.includes(languageId)) {
        warnings.push({
          code: "UNSUPPORTED_LANGUAGE",
          message: `Language '${languageId}' may not be fully supported`,
          line: 0,
          column: 0,
          severity: DiagnosticLevel.WARNING,
          source: "validation-service",
        });
      }

      // **Validate language config**
      this.validateLanguageConfig(languageId, langConfig, errors, warnings);
    }
  }

  /**
   * **Validate individual language configuration**
   */
  private validateLanguageConfig(
    languageId: string,
    langConfig: LanguageConfig,
    errors: ValidationError[],
    warnings: ValidationError[]
  ): void {
    // **Validate timeout**
    if (
      langConfig.timeout &&
      (langConfig.timeout < 100 || langConfig.timeout > 60000)
    ) {
      warnings.push({
        code: "INVALID_TIMEOUT",
        message: `Timeout for ${languageId} should be between 100ms and 60s`,
        line: 0,
        column: 0,
        severity: DiagnosticLevel.WARNING,
        source: "validation-service",
      });
    }

    // **Validate custom formatter path**
    if (langConfig.customFormatter && !langConfig.customFormatter.trim()) {
      errors.push({
        code: "EMPTY_CUSTOM_FORMATTER",
        message: `Custom formatter path for ${languageId} cannot be empty`,
        line: 0,
        column: 0,
        severity: DiagnosticLevel.ERROR,
        source: "validation-service",
      });
    }

    // **Validate rules object**
    if (langConfig.rules && typeof langConfig.rules !== "object") {
      errors.push({
        code: "INVALID_RULES_OBJECT",
        message: `Rules for ${languageId} must be an object`,
        line: 0,
        column: 0,
        severity: DiagnosticLevel.ERROR,
        source: "validation-service",
      });
    }
  }

  /**
   * **Validate performance settings**
   */
  private validatePerformanceSettings(
    config: FormatConfig,
    errors: ValidationError[],
    warnings: ValidationError[]
  ): void {
    // **Check for performance-impacting combinations**
    if (config.formatOnType && config.formatOnPaste) {
      warnings.push({
        code: "PERFORMANCE_IMPACT",
        message:
          "Having both format-on-type and format-on-paste enabled may impact performance",
        line: 0,
        column: 0,
        severity: DiagnosticLevel.WARNING,
        source: "validation-service",
      });
    }

    if (config.enablePreview && config.formatOnSave) {
      warnings.push({
        code: "PREVIEW_PERFORMANCE",
        message: "Preview mode with format-on-save may slow down saving",
        line: 0,
        column: 0,
        severity: DiagnosticLevel.WARNING,
        source: "validation-service",
      });
    }

    // **Check file size limits with performance monitoring**
    if (config.performanceMonitoring && !config.maxFileSizeKB) {
      warnings.push({
        code: "MISSING_FILE_SIZE_LIMIT",
        message:
          "Consider setting file size limits when performance monitoring is enabled",
        line: 0,
        column: 0,
        severity: DiagnosticLevel.WARNING,
        source: "validation-service",
      });
    }
  }

  /**
   * **Generate helpful suggestions**
   */
  private generateSuggestions(
    config: FormatConfig,
    suggestions: StyleSuggestion[]
  ): void {
    // **Performance suggestions**
    if (!config.performanceMonitoring) {
      suggestions.push({
        type: SuggestionType.CONVENTION,
        message: "Enable performance monitoring to track formatting efficiency",
        range: new vscode.Range(0, 0, 0, 0),
        severity: DiagnosticLevel.INFO,
        confidence: 0.8,
      });
    }

    if (!config.incrementalFormatting) {
      suggestions.push({
        type: SuggestionType.PERFORMANCE,
        message: "Enable incremental formatting for better performance on large files",
        range: new vscode.Range(0, 0, 0, 0),
        severity: DiagnosticLevel.INFO,
        confidence: 0.8,
      });
    }

    // **Integration suggestions**
    if (!config.respectEditorConfig) {
      suggestions.push({
        type: SuggestionType.CONVENTION,
        message: "Consider enabling EditorConfig support for better project consistency",
        range: new vscode.Range(0, 0, 0, 0),
        severity: DiagnosticLevel.INFO,
        confidence: 0.8,
      });
    }

    if (!config.respectPrettierConfig) {
      suggestions.push({
        type: SuggestionType.CONVENTION,
        message: "Enable Prettier config respect for JavaScript/TypeScript projects",
        range: new vscode.Range(0, 0, 0, 0),
        severity: DiagnosticLevel.INFO,
        confidence: 0.8,
      });
    }

    // **Feature suggestions**
    if (!config.enablePreview && config.enabledLanguages.length > 3) {
      suggestions.push({
        type: SuggestionType.STYLE,
        message: "Enable preview mode to see formatting changes before applying",
        range: new vscode.Range(0, 0, 0, 0),
        severity: DiagnosticLevel.INFO,
        confidence: 0.8,
      });
    }

    if (!config.statusBarIntegration) {
      suggestions.push({
        type: SuggestionType.CONVENTION,
        message: "Enable status bar integration for quick access to formatting status",
        range: new vscode.Range(0, 0, 0, 0),
        severity: DiagnosticLevel.INFO,
        confidence: 0.8,
      });
    }

    // **Profile suggestions**
    if (
      !config.configurationProfiles ||
      Object.keys(config.configurationProfiles).length === 0
    ) {
      suggestions.push({
        type: SuggestionType.CONVENTION,
        message: "Create configuration profiles for different project types",
        range: new vscode.Range(0, 0, 0, 0),
        severity: DiagnosticLevel.INFO,
        confidence: 0.8,
      });
    }
  }

  /**
   * **Validate specific field value**
   */
  validateField(field: string, value: any): ValidationError | null {
    switch (field) {
      case "indentSize":
        if (typeof value !== "number" || value < 1 || value > 20) {
          return {
            code: "INVALID_INDENT_SIZE",
            message: "Indent size must be a number between 1 and 20",
            line: 0,
            column: 0,
            severity: DiagnosticLevel.ERROR,
            source: "validation-service",
          };
        }
        break;

      case "maxLineLength":
        if (typeof value !== "number" || value < 40 || value > 500) {
          return {
            code: "INVALID_MAX_LINE_LENGTH",
            message: "Max line length must be a number between 40 and 500",
            line: 0,
            column: 0,
            severity: DiagnosticLevel.WARNING,
            source: "validation-service",
          };
        }
        break;

      case "enabledLanguages":
        if (!Array.isArray(value)) {
          return {
            code: "INVALID_ENABLED_LANGUAGES",
            message: "Enabled languages must be an array",
            line: 0,
            column: 0,
            severity: DiagnosticLevel.ERROR,
            source: "validation-service",
          };
        }
        break;

      case "diagnosticsLevel":
        const validLevels = Object.values(DiagnosticLevel);
        if (!validLevels.includes(value)) {
          return {
            code: "INVALID_DIAGNOSTIC_LEVEL",
            message: `Diagnostics level must be one of: ${validLevels.join(", ")}`,
            line: 0,
            column: 0,
            severity: DiagnosticLevel.ERROR,
            source: "validation-service",
          };
        }
        break;
    }

    return null;
  }

  /**
   * **Get validation summary**
   */
  getValidationSummary(result: ValidationResult): string {
    const parts: string[] = [];

    if (result.isValid) {
      parts.push("✅ Configuration is valid");
    } else {
      parts.push("❌ Configuration has issues");
    }

    if (result.errors.length > 0) {
      parts.push(`${result.errors.length} error(s)`);
    }

    if (result.warnings.length > 0) {
      parts.push(`${result.warnings.length} warning(s)`);
    }

    if (result.suggestions && result.suggestions.length > 0) {
      parts.push(`${result.suggestions.length} suggestion(s)`);
    }

    return parts.join(" | ");
  }
}
