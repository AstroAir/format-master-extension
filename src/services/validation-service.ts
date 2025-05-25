import * as vscode from "vscode";
import { 
  ValidationResult, 
  ValidationError, 
  FormatConfig, 
  LanguageConfig,
  DiagnosticLevel,
  ILoggingService 
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
    const suggestions: string[] = [];

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
        `Configuration validation completed: ${isValid ? 'Valid' : 'Invalid'} ` +
        `(${errors.length} errors, ${warnings.length} warnings)`
      );
      
      return {
        isValid,
        errors,
        warnings,
        suggestions
      };
      
    } catch (error) {
      this.loggingService.error("Configuration validation failed", error);
      
      return {
        isValid: false,
        errors: [{
          field: 'general',
          message: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          severity: 'error'
        }],
        warnings: [],
        suggestions: []
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
        field: 'indentSize',
        message: 'Indent size must be between 1 and 20',
        severity: 'error',
        suggestedFix: 2
      });
    }

    // **Validate max line length**
    if (config.maxLineLength < 40 || config.maxLineLength > 500) {
      warnings.push({
        field: 'maxLineLength',
        message: 'Max line length should be between 40 and 500 characters',
        severity: 'warning',
        suggestedFix: 120
      });
    }

    // **Validate enabled languages**
    if (!config.enabledLanguages || config.enabledLanguages.length === 0) {
      warnings.push({
        field: 'enabledLanguages',
        message: 'No languages enabled for formatting',
        severity: 'warning'
      });
    }

    // **Validate file size limit**
    if (config.maxFileSizeKB && (config.maxFileSizeKB < 1 || config.maxFileSizeKB > 100000)) {
      warnings.push({
        field: 'maxFileSizeKB',
        message: 'File size limit should be between 1KB and 100MB',
        severity: 'warning',
        suggestedFix: 1024
      });
    }

    // **Check for conflicting settings**
    if (config.useTabs && config.indentSize !== 1) {
      warnings.push({
        field: 'indentSize',
        message: 'Indent size is ignored when using tabs',
        severity: 'warning'
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
      'javascript', 'typescript', 'json', 'xml', 'css', 'scss', 'less',
      'html', 'python', 'markdown', 'yaml', 'yml'
    ];

    for (const [languageId, langConfig] of Object.entries(config.languageSpecific)) {
      // **Check if language is supported**
      if (!supportedLanguages.includes(languageId)) {
        warnings.push({
          field: `languageSpecific.${languageId}`,
          message: `Language '${languageId}' may not be fully supported`,
          severity: 'warning'
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
    if (langConfig.timeout && (langConfig.timeout < 100 || langConfig.timeout > 60000)) {
      warnings.push({
        field: `languageSpecific.${languageId}.timeout`,
        message: `Timeout for ${languageId} should be between 100ms and 60s`,
        severity: 'warning',
        suggestedFix: 5000
      });
    }

    // **Validate custom formatter path**
    if (langConfig.customFormatter && !langConfig.customFormatter.trim()) {
      errors.push({
        field: `languageSpecific.${languageId}.customFormatter`,
        message: `Custom formatter path for ${languageId} cannot be empty`,
        severity: 'error'
      });
    }

    // **Validate rules object**
    if (langConfig.rules && typeof langConfig.rules !== 'object') {
      errors.push({
        field: `languageSpecific.${languageId}.rules`,
        message: `Rules for ${languageId} must be an object`,
        severity: 'error'
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
        field: 'formatOnType',
        message: 'Having both format-on-type and format-on-paste enabled may impact performance',
        severity: 'warning'
      });
    }

    if (config.enablePreview && config.formatOnSave) {
      warnings.push({
        field: 'enablePreview',
        message: 'Preview mode with format-on-save may slow down saving',
        severity: 'warning'
      });
    }

    // **Check file size limits with performance monitoring**
    if (config.performanceMonitoring && !config.maxFileSizeKB) {
      warnings.push({
        field: 'maxFileSizeKB',
        message: 'Consider setting file size limits when performance monitoring is enabled',
        severity: 'warning'
      });
    }
  }

  /**
   * **Generate helpful suggestions**
   */
  private generateSuggestions(config: FormatConfig, suggestions: string[]): void {
    // **Performance suggestions**
    if (!config.performanceMonitoring) {
      suggestions.push("Enable performance monitoring to track formatting efficiency");
    }

    if (!config.incrementalFormatting) {
      suggestions.push("Enable incremental formatting for better performance on large files");
    }

    // **Integration suggestions**
    if (!config.respectEditorConfig) {
      suggestions.push("Consider enabling EditorConfig support for better project consistency");
    }

    if (!config.respectPrettierConfig) {
      suggestions.push("Enable Prettier config respect for JavaScript/TypeScript projects");
    }

    // **Feature suggestions**
    if (!config.enablePreview && config.enabledLanguages.length > 3) {
      suggestions.push("Enable preview mode to see formatting changes before applying");
    }

    if (!config.statusBarIntegration) {
      suggestions.push("Enable status bar integration for quick access to formatting status");
    }

    // **Profile suggestions**
    if (!config.configurationProfiles || Object.keys(config.configurationProfiles).length === 0) {
      suggestions.push("Create configuration profiles for different project types");
    }
  }

  /**
   * **Validate specific field value**
   */
  validateField(field: string, value: any): ValidationError | null {
    switch (field) {
      case 'indentSize':
        if (typeof value !== 'number' || value < 1 || value > 20) {
          return {
            field,
            message: 'Indent size must be a number between 1 and 20',
            severity: 'error',
            suggestedFix: 2
          };
        }
        break;

      case 'maxLineLength':
        if (typeof value !== 'number' || value < 40 || value > 500) {
          return {
            field,
            message: 'Max line length must be a number between 40 and 500',
            severity: 'warning',
            suggestedFix: 120
          };
        }
        break;

      case 'enabledLanguages':
        if (!Array.isArray(value)) {
          return {
            field,
            message: 'Enabled languages must be an array',
            severity: 'error'
          };
        }
        break;

      case 'diagnosticsLevel':
        const validLevels = Object.values(DiagnosticLevel);
        if (!validLevels.includes(value)) {
          return {
            field,
            message: `Diagnostics level must be one of: ${validLevels.join(', ')}`,
            severity: 'error',
            suggestedFix: DiagnosticLevel.INFO
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
