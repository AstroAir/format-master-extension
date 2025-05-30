import {
  IFormatter,
  FormatOptions,
  FormatResult,
  FormatterPriority,
  ValidationResult,
  ValidationError,
  DiagnosticLevel,
  FormatOptionDescriptor
} from "../types";

/**
 * **Abstract base class for all formatters**
 */
export abstract class BaseFormatter implements IFormatter {
  public abstract readonly name: string;
  public abstract readonly supportedLanguages: string[];
  public abstract readonly priority: FormatterPriority;

  /**
   * **Check if this formatter can handle the given language**
   */
  canFormat(languageId: string): boolean {
    return this.supportedLanguages.includes(languageId);
  }

  /**
   * **Format text with the given options**
   */
  public abstract formatText(
    text: string,
    options: FormatOptions
  ): Promise<FormatResult>;

  /**
   * **Format the given text or document**
   */
  public abstract format(
    text: string,
    options: FormatOptions
  ): Promise<FormatResult>;

  /**
   * **Get supported formatting options**
   */
  public abstract getSupportedOptions(): FormatOptionDescriptor[];

  /**
   * **Get formatter version**
   */
  public abstract getVersion(): string;

  /**
   * **Common preprocessing for all formatters**
   */
  protected preprocess(text: string, options: FormatOptions): string {
    let processedText = text;

    // **Trim trailing whitespace if enabled**
    if (options.trimTrailingWhitespace !== false) {
      processedText = processedText.replace(/[ \t]+$/gm, "");
    }

    return processedText;
  }

  /**
   * **Common postprocessing for all formatters**
   */
  protected postprocess(text: string, options: FormatOptions): string {
    let processedText = text;

    // **Insert final newline if enabled**
    if (options.insertFinalNewline !== false) {
      if (!processedText.endsWith("\n") && processedText.length > 0) {
        processedText += "\n";
      }
    }

    return processedText;
  }

  /**
   * **Convert tabs to spaces or vice versa**
   */
  protected normalizeIndentation(text: string, options: FormatOptions): string {
    const tabSize = options.tabSize || 2;

    if (options.insertSpaces) {
      // **Convert tabs to spaces**
      const spaces = " ".repeat(tabSize);
      return text.replace(/\t/g, spaces);
    } else {
      // **Convert spaces to tabs**
      const spacePattern = new RegExp(`^( {${tabSize}})+`, "gm");
      return text.replace(spacePattern, (match) => {
        const tabCount = match.length / tabSize;
        return "\t".repeat(tabCount);
      });
    }

    return text;
  }

  /**
   * **Create a successful format result**
   */
  protected createSuccessResult(
    text: string,
    changes: number = 0
  ): FormatResult {
    return {
      success: true,
      edits: [],
      errors: [],
      warnings: [],
      suggestions: [],
      formatterUsed: this.name,
      executionTime: 0,
      linesProcessed: text.split('\n').length,
      charactersProcessed: text.length,
      fromCache: false
    };
  }

  /**
   * **Create a failed format result**
   */
  protected createErrorResult(error: Error): FormatResult {
    return {
      success: false,
      edits: [],
      errors: [{
        code: 'FORMAT_ERROR',
        message: error.message,
        line: 0,
        column: 0,
        severity: DiagnosticLevel.ERROR,
        source: this.name
      }],
      warnings: [],
      suggestions: [],
      formatterUsed: this.name,
      executionTime: 0,
      linesProcessed: 0,
      charactersProcessed: 0,
      fromCache: false
    };
  }

  /**
   * **Validate syntax of the given text**
   */
  public abstract validateSyntax(
    content: string,
    languageId: string
  ): Promise<ValidationResult>;
}
