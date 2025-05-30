import * as vscode from "vscode";
import { BaseFormatter } from "./base-formatter";
import {
  FormatOptions,
  FormatResult,
  FormatOptionDescriptor,
  ValidationResult,
  ValidationError,
  FormatterPriority,
  DiagnosticLevel,
} from "../types";
import { FormatError } from "../errors/format-error";

/**
 * **Enhanced formatter for YAML files with validation and structure preservation**
 */
export class YamlFormatter extends BaseFormatter {
  public readonly name = "yaml";
  public readonly priority = FormatterPriority.NORMAL;
  public readonly supportedLanguages = ["yaml", "yml"];

  public async format(
    text: string,
    options: FormatOptions
  ): Promise<FormatResult> {
    return this.formatText(text, options);
  }

  public getSupportedOptions(): FormatOptionDescriptor[] {
    return [
      {
        name: "alignComments",
        type: "boolean",
        description: "Align comments with the current context",
        default: true,
        required: false,
      },
      {
        name: "spaceAfterDash",
        type: "boolean",
        description: "Add space after list item dashes",
        default: true,
        required: false,
      },
      {
        name: "spaceAfterColon",
        type: "boolean",
        description: "Add space after colons in key-value pairs",
        default: true,
        required: false,
      },
      {
        name: "quoteKeys",
        type: "boolean",
        description: "Quote keys containing spaces or special characters",
        default: false,
        required: false,
      },
      {
        name: "normalizeBooleans",
        type: "boolean",
        description: "Normalize boolean values (yes/no to true/false)",
        default: true,
        required: false,
      },
      {
        name: "normalizeNulls",
        type: "boolean",
        description: "Normalize null values (~, NULL etc. to null)",
        default: true,
        required: false,
      },
    ];
  }

  public getVersion(): string {
    return "1.0.0";
  }

  public async validateSyntax(
    content: string,
    languageId: string
  ): Promise<ValidationResult> {
    try {
      this.validateYamlStructure(content);
      return {
        isValid: true,
        errors: [],
        warnings: [],
        suggestions: [],
        executionTime: 0,
      };
    } catch (error) {
      const syntaxError: ValidationError = {
        code: "YAML_SYNTAX_ERROR",
        message: error instanceof Error ? error.message : "Invalid YAML syntax",
        line: 0,
        column: 0,
        severity: DiagnosticLevel.ERROR,
        source: this.name,
      };

      return {
        isValid: false,
        errors: [syntaxError],
        warnings: [],
        suggestions: [],
        executionTime: 0,
      };
    }
  }

  /**
   * **Format YAML content with validation and structure preservation**
   */
  async formatText(
    text: string,
    options: FormatOptions
  ): Promise<FormatResult> {
    try {
      const preprocessedText = this.preprocess(text, options);
      const startTime = Date.now();

      // **Validate YAML structure first**
      if (options.enableValidation !== false) {
        this.validateYamlStructure(preprocessedText);
      }

      // **Apply YAML formatting**
      let formattedText = this.formatYaml(preprocessedText, options);

      // **Apply post-processing**
      const finalText = this.postprocess(formattedText, options);
      const executionTime = Date.now() - startTime;

      return {
        success: true,
        edits: [
          vscode.TextEdit.replace(
            new vscode.Range(
              new vscode.Position(0, 0),
              new vscode.Position(text.split("\n").length, 0)
            ),
            finalText
          ),
        ],
        errors: [],
        warnings: [],
        suggestions: [],
        formatterUsed: this.name,
        executionTime,
        linesProcessed: text.split("\n").length,
        charactersProcessed: text.length,
        fromCache: false,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const formatError: ValidationError = {
        code: "YAML_FORMAT_ERROR",
        message: `YAML formatting failed: ${errorMessage}`,
        line: 0,
        column: 0,
        severity: DiagnosticLevel.ERROR,
        source: this.name,
      };

      return {
        success: false,
        edits: [],
        errors: [formatError],
        warnings: [],
        suggestions: [],
        formatterUsed: this.name,
        executionTime: 0,
        linesProcessed: 0,
        charactersProcessed: 0,
        fromCache: false,
      };
    }
  }

  /**
   * **Validate YAML structure before formatting**
   */
  private validateYamlStructure(text: string): void {
    const lines = text.split("\n");
    const indentStack: number[] = [0];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // **Skip empty lines and comments**
      if (trimmed === "" || trimmed.startsWith("#")) {
        continue;
      }

      const indent = line.length - line.trimStart().length;

      // **Check for consistent indentation**
      if (indent > indentStack[indentStack.length - 1]) {
        indentStack.push(indent);
      } else if (indent < indentStack[indentStack.length - 1]) {
        // **Pop until we find the right level**
        while (
          indentStack.length > 1 &&
          indentStack[indentStack.length - 1] > indent
        ) {
          indentStack.pop();
        }

        if (indentStack[indentStack.length - 1] !== indent) {
          throw new Error(`Inconsistent indentation at line ${i + 1}: ${line}`);
        }
      }

      // **Check for valid key-value pairs**
      if (trimmed.includes(":") && !trimmed.startsWith("-")) {
        const colonIndex = trimmed.indexOf(":");
        const key = trimmed.substring(0, colonIndex).trim();

        if (
          key === "" ||
          (key.includes(" ") && !key.startsWith('"') && !key.startsWith("'"))
        ) {
          // **Keys with spaces should be quoted**
          // **This is a warning rather than an error**
        }
      }
    }
  }

  /**
   * **Format YAML content**
   */
  private formatYaml(text: string, options: FormatOptions): string {
    const lines = text.split("\n");
    const indentChar = !options.insertSpaces
      ? "\t"
      : " ".repeat(options.tabSize);
    const customRules = this.getCustomRules(options);
    const formattedLines: string[] = [];

    let currentIndentLevel = 0;
    const indentStack: number[] = [0];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // **Preserve empty lines and comments with proper indentation**
      if (trimmed === "") {
        formattedLines.push("");
        continue;
      }

      if (trimmed.startsWith("#")) {
        const commentIndent = this.getCommentIndent(
          line,
          indentStack,
          customRules
        );
        formattedLines.push(indentChar.repeat(commentIndent) + trimmed);
        continue;
      }

      // **Calculate proper indentation**
      const originalIndent = line.length - line.trimStart().length;
      let newIndentLevel = this.calculateIndentLevel(
        originalIndent,
        indentStack,
        options.tabSize
      );

      // **Handle list items**
      if (trimmed.startsWith("-")) {
        const listItemFormatted = this.formatListItem(
          trimmed,
          newIndentLevel,
          indentChar,
          customRules
        );
        formattedLines.push(listItemFormatted);

        // **Check if list item has a value**
        if (trimmed.includes(":")) {
          const colonIndex = trimmed.indexOf(":");
          const afterColon = trimmed.substring(colonIndex + 1).trim();
          if (afterColon === "") {
            // **List item with nested content - increase indent**
            indentStack.push((newIndentLevel + 1) * options.tabSize);
          }
        }
        continue;
      }

      // **Handle key-value pairs**
      if (trimmed.includes(":")) {
        const formattedKeyValue = this.formatKeyValue(
          trimmed,
          newIndentLevel,
          indentChar,
          customRules
        );
        formattedLines.push(formattedKeyValue);

        // **Check if this starts a new nested structure**
        const colonIndex = trimmed.indexOf(":");
        const afterColon = trimmed.substring(colonIndex + 1).trim();

        if (afterColon === "" || afterColon === "|" || afterColon === ">") {
          // **Key with nested content - prepare for increased indent**
          const nextLineIndex = i + 1;
          if (nextLineIndex < lines.length) {
            const nextLine = lines[nextLineIndex];
            const nextTrimmed = nextLine.trim();
            if (nextTrimmed !== "" && !nextTrimmed.startsWith("#")) {
              const nextIndent = nextLine.length - nextLine.trimStart().length;
              if (nextIndent > originalIndent) {
                indentStack.push(nextIndent);
              }
            }
          }
        }
        continue;
      }

      // **Handle scalar values (multiline strings, etc.)**
      const formattedScalar = indentChar.repeat(newIndentLevel) + trimmed;
      formattedLines.push(formattedScalar);
    }

    let result = formattedLines.join("\n");

    // **Apply additional formatting rules**
    result = this.applyYamlRules(result, customRules);

    return result;
  }

  /**
   * **Calculate proper indentation level**
   */
  private calculateIndentLevel(
    originalIndent: number,
    indentStack: number[],
    indentSize: number
  ): number {
    // **Find the appropriate indent level**
    let level = 0;

    for (let i = indentStack.length - 1; i >= 0; i--) {
      if (originalIndent >= indentStack[i]) {
        level = i;
        break;
      }
    }

    // **Adjust stack if we're backing out of indentation**
    while (indentStack.length > level + 1) {
      indentStack.pop();
    }

    return level;
  }

  /**
   * **Get appropriate comment indentation**
   */
  private getCommentIndent(
    line: string,
    indentStack: number[],
    customRules: any
  ): number {
    const originalIndent = line.length - line.trimStart().length;

    // **Comments can be aligned with current context or standalone**
    if (customRules.alignComments === false) {
      // Use default tab size since this is just for comment alignment
      const defaultTabSize = 2;
      return Math.floor(originalIndent / defaultTabSize);
    }

    // **Align with current indent level**
    return indentStack[indentStack.length - 1] || 0;
  }

  /**
   * **Format list items**
   */
  private formatListItem(
    item: string,
    indentLevel: number,
    indentChar: string,
    customRules: any
  ): string {
    const baseIndent = indentChar.repeat(indentLevel);

    if (item.includes(":")) {
      // **List item with key-value**
      const dashIndex = item.indexOf("-");
      const afterDash = item.substring(dashIndex + 1).trim();

      const spaceAfterDash = customRules.spaceAfterDash !== false ? " " : "";
      return baseIndent + "-" + spaceAfterDash + afterDash;
    } else {
      // **Simple list item**
      const content = item.substring(1).trim();
      const spaceAfterDash = customRules.spaceAfterDash !== false ? " " : "";
      return baseIndent + "-" + spaceAfterDash + content;
    }
  }

  /**
   * **Format key-value pairs**
   */
  private formatKeyValue(
    pair: string,
    indentLevel: number,
    indentChar: string,
    customRules: any
  ): string {
    const baseIndent = indentChar.repeat(indentLevel);
    const colonIndex = pair.indexOf(":");

    const key = pair.substring(0, colonIndex).trim();
    const value = pair.substring(colonIndex + 1).trim();

    // **Format key (quote if necessary)**
    let formattedKey = key;
    if (
      customRules.quoteKeys === true &&
      !key.startsWith('"') &&
      !key.startsWith("'")
    ) {
      if (key.includes(" ") || key.includes("-") || /^\d/.test(key)) {
        formattedKey = `"${key}"`;
      }
    }

    // **Format spacing around colon**
    const spaceAfterColon = customRules.spaceAfterColon !== false ? " " : "";

    if (value === "") {
      return baseIndent + formattedKey + ":";
    } else if (value === "|" || value === ">") {
      return baseIndent + formattedKey + ": " + value;
    } else {
      return baseIndent + formattedKey + ":" + spaceAfterColon + value;
    }
  }

  /**
   * **Apply additional YAML formatting rules**
   */
  private applyYamlRules(text: string, customRules: any): string {
    let result = text;

    // **Normalize boolean values**
    if (customRules.normalizeBooleans !== false) {
      result = result.replace(/:\s*(yes|Yes|YES|on|On|ON)\s*$/gm, ": true");
      result = result.replace(/:\s*(no|No|NO|off|Off|OFF)\s*$/gm, ": false");
    }

    // **Normalize null values**
    if (customRules.normalizeNulls !== false) {
      result = result.replace(/:\s*(null|Null|NULL|~)\s*$/gm, ": null");
    }

    // **Remove trailing spaces**
    result = result.replace(/[ \t]+$/gm, "");

    // **Ensure document ends with newline**
    if (!result.endsWith("\n") && customRules.ensureFinalNewline !== false) {
      result += "\n";
    }

    // **Remove excessive blank lines**
    result = result.replace(/\n\s*\n\s*\n/g, "\n\n");

    return result;
  }

  /**
   * **Count lines that were changed**
   */
  private countLinesChanged(original: string, formatted: string): number {
    const originalLines = original.split("\n");
    const formattedLines = formatted.split("\n");

    let changedLines = 0;
    const maxLines = Math.max(originalLines.length, formattedLines.length);

    for (let i = 0; i < maxLines; i++) {
      const originalLine = originalLines[i] || "";
      const formattedLine = formattedLines[i] || "";

      if (originalLine.trim() !== formattedLine.trim()) {
        changedLines++;
      }
    }

    return changedLines;
  }

  /**
   * **Count character differences between original and formatted text**
   */
  private countChanges(original: string, formatted: string): number {
    if (original === formatted) {
      return 0;
    }

    let changes = 0;
    const maxLength = Math.max(original.length, formatted.length);

    for (let i = 0; i < maxLength; i++) {
      if (original[i] !== formatted[i]) {
        changes++;
      }
    }

    return changes;
  }

  /**
   * **Get custom formatting rules with defaults**
   */
  private getCustomRules(options: FormatOptions): any {
    const customRules = options.customRules || {};
    return {
      alignComments: customRules.alignComments !== false,
      spaceAfterDash: customRules.spaceAfterDash !== false,
      spaceAfterColon: customRules.spaceAfterColon !== false,
      quoteKeys: customRules.quoteKeys === true,
      normalizeBooleans: customRules.normalizeBooleans !== false,
      normalizeNulls: customRules.normalizeNulls !== false,
      ensureFinalNewline: options.insertFinalNewline !== false,
    };
  }

  /**
   * **Enhanced preprocessing for YAML**
   */
  protected preprocess(text: string, options: FormatOptions): string {
    let processedText = super.preprocess(text, options);

    // **Normalize line endings**
    processedText = processedText.replace(/\r\n/g, "\n");

    // **Preserve document separators**
    processedText = processedText.replace(/^---\s*$/gm, "---");
    processedText = processedText.replace(/^\.\.\.\s*$/gm, "...");

    return processedText;
  }
}
