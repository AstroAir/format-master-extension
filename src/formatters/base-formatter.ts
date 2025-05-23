import { IFormatter, FormatOptions, FormatResult } from "../types";

/**
 * **Abstract base class for all formatters**
 */
export abstract class BaseFormatter implements IFormatter {
  public abstract readonly supportedLanguages: string[];

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
    const tabSize = options.tabSize || options.indentSize || 2;

    if (options.insertSpaces !== false && !options.useTabs) {
      // **Convert tabs to spaces**
      const spaces = " ".repeat(tabSize);
      return text.replace(/\t/g, spaces);
    } else if (options.useTabs || options.insertSpaces === false) {
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
      text,
      changes,
    };
  }

  /**
   * **Create a failed format result**
   */
  protected createErrorResult(error: Error): FormatResult {
    return {
      success: false,
      error,
    };
  }
}
