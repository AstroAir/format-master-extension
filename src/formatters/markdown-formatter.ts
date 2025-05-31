import * as vscode from "vscode";
import { BaseFormatter } from "./base-formatter";
import {
  FormatOptions,
  FormatResult,
  FormatterPriority,
  ValidationResult,
  FormatOptionDescriptor,
  ValidationError,
  DiagnosticLevel,
} from "../types";
import { FormatError } from "../errors/format-error";

/**
 * **Enhanced formatter for Markdown files with table formatting and link validation**
 */
export class MarkdownFormatter extends BaseFormatter {
  public readonly name = "markdown";
  public readonly priority = 1;
  public readonly supportedLanguages = ["markdown", "md"];

  public getSupportedOptions(): FormatOptionDescriptor[] {
    return [
      {
        name: "removeTrailingHashes",
        description: "Remove trailing hash symbols from headers",
        type: "boolean",
        required: false,
        default: true,
      },
      {
        name: "listIndentSize",
        description: "Number of spaces for list indentation",
        type: "number",
        required: false,
        default: 2,
      },
      {
        name: "wrapText",
        description: "Enable text wrapping at maxLineLength",
        type: "boolean",
        required: false,
        default: true,
      },
    ];
  }

  public getVersion(): string {
    return "1.0.0";
  }

  public async format(
    text: string,
    options: FormatOptions
  ): Promise<FormatResult> {
    return this.formatText(text, options);
  }

  public async validateSyntax(
    content: string,
    languageId: string
  ): Promise<ValidationResult> {
    if (!this.canFormat(languageId)) {
      return {
        isValid: false,
        errors: [
          {
            code: "UNSUPPORTED_LANGUAGE",
            message: `Unsupported language: ${languageId}`,
            line: 0,
            column: 0,
            severity: DiagnosticLevel.ERROR,
            source: this.name,
          },
        ],
        warnings: [],
        suggestions: [],
        executionTime: 0,
      };
    }

    // Basic Markdown syntax validation
    try {
      const startTime = Date.now();
      const lines = content.split("\n");
      const errors: ValidationError[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Check for unmatched backticks
        const backtickCount = (line.match(/`/g) || []).length;
        if (backtickCount % 2 !== 0) {
          errors.push({
            code: "UNMATCHED_BACKTICK",
            message: "Unmatched backtick",
            line: i + 1,
            column: line.indexOf("`") + 1,
            severity: DiagnosticLevel.ERROR,
            source: this.name,
          });
        }

        // Check for malformed links
        const linkPattern = /\[([^\]]*)\]\(([^)]*)\)/g;
        const links = Array.from(line.matchAll(linkPattern));
        for (const link of links) {
          if (!link[1].trim() || !link[2].trim()) {
            errors.push({
              code: "INVALID_LINK_FORMAT",
              message: "Invalid link format - missing text or URL",
              line: i + 1,
              column: link.index! + 1,
              severity: DiagnosticLevel.ERROR,
              source: this.name,
            });
          }
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings: [],
        suggestions: [],
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [
          {
            code: "VALIDATION_ERROR",
            message: error instanceof Error ? error.message : "Unknown error",
            line: 0,
            column: 0,
            severity: DiagnosticLevel.ERROR,
            source: this.name,
          },
        ],
        warnings: [],
        suggestions: [],
        executionTime: 0,
      };
    }
  }

  /**
   * **Format Markdown content with enhanced features**
   */
  async formatText(
    text: string,
    options: FormatOptions
  ): Promise<FormatResult> {
    try {
      const preprocessedText = this.preprocess(text, options);
      const startTime = Date.now();

      // **Apply Markdown formatting**
      let formattedText = this.formatMarkdown(preprocessedText, options);

      // **Apply post-processing**
      const finalText = this.postprocess(formattedText, options);
      const executionTime = Date.now() - startTime;

      return {
        success: true,
        edits: [
          vscode.TextEdit.replace(
            new vscode.Range(0, 0, Number.MAX_VALUE, Number.MAX_VALUE),
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
      return {
        success: false,
        edits: [],
        errors: [
          {
            code: "FORMAT_ERROR",
            message: `Markdown formatting failed: ${errorMessage}`,
            line: 0,
            column: 0,
            severity: DiagnosticLevel.ERROR,
            source: this.name,
          },
        ],
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
   * **Get custom formatting rules from options**
   */
  protected getCustomRules(options: FormatOptions): any {
    const defaultRules = {
      removeTrailingHashes: true,
      listIndentSize: 2,
      unorderedListMarker: "-",
      wrapText: true,
      normalizeInlineCode: true,
      normalizeLinkSpacing: true,
      formatReferenceLinks: true,
      maxBlankLines: 2,
    };

    if (options.customRules) {
      return { ...defaultRules, ...options.customRules };
    }

    return defaultRules;
  }

  /**
   * **Count the number of changes between original and formatted text**
   */
  protected countChanges(original: string, formatted: string): number {
    if (original === formatted) {
      return 0;
    }

    const originalChars = original.split("");
    const formattedChars = formatted.split("");
    let changes = 0;

    const maxLength = Math.max(originalChars.length, formattedChars.length);

    for (let i = 0; i < maxLength; i++) {
      const originalChar = originalChars[i] || "";
      const formattedChar = formattedChars[i] || "";

      if (originalChar !== formattedChar) {
        changes++;
      }
    }

    return changes;
  }

  /**
   * **Format Markdown content**
   */
  private formatMarkdown(text: string, options: FormatOptions): string {
    let result = text;
    const customRules = this.getCustomRules(options);

    // **Format headers**
    result = this.formatHeaders(result, customRules);

    // **Format lists**
    result = this.formatLists(result, customRules);

    // **Format tables**
    result = this.formatTables(result, customRules);

    // **Format code blocks**
    result = this.formatCodeBlocks(result, customRules);

    // **Format links and images**
    result = this.formatLinksAndImages(result, customRules);

    // **Fix line spacing**
    result = this.fixLineSpacing(result, customRules);

    // **Apply line length wrapping**
    if (customRules.wrapText !== false) {
      result = this.wrapText(result, options.maxLineLength || 80);
    }

    return result;
  }

  /**
   * **Format headers with consistent spacing**
   */
  private formatHeaders(text: string, customRules: any): string {
    let result = text;

    // **Ensure space after # in headers**
    result = result.replace(/^(#{1,6})([^\s#])/gm, "$1 $2");

    // **Remove trailing # from headers**
    if (customRules.removeTrailingHashes !== false) {
      result = result.replace(/^(#{1,6}.*?)\s*#+\s*$/gm, "$1");
    }

    // **Ensure blank line before headers (except at start of document)**
    result = result.replace(/(?<=\S.*)\n(#{1,6}\s)/g, "\n\n$1");

    return result;
  }

  /**
   * **Format lists with consistent indentation**
   */
  private formatLists(text: string, customRules: any): string {
    let result = text;
    const indentSize = customRules.listIndentSize || 2;
    const indentChar = " ".repeat(indentSize);

    // **Format unordered lists**
    const listMarker = customRules.unorderedListMarker || "-";
    result = result.replace(/^(\s*)([*+-])\s+/gm, (_match, indent, _marker) => {
      return indent + listMarker + " ";
    });

    // **Format nested lists**
    const lines = result.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const listMatch = line.match(/^(\s*)([*+-]|\d+\.)\s+/);

      if (listMatch) {
        const indentLevel = Math.floor(listMatch[1].length / indentSize);
        const newIndent = indentChar.repeat(indentLevel);
        lines[i] = line.replace(/^\s*/, newIndent);
      }
    }

    return lines.join("\n");
  }

  /**
   * **Format tables with proper alignment**
   */
  private formatTables(text: string, customRules: any): string {
    const lines = text.split("\n");
    const result: string[] = [];
    let inTable = false;
    let tableLines: string[] = [];

    for (const line of lines) {
      const isTableRow = line.includes("|") && line.trim().length > 0;

      if (isTableRow && !inTable) {
        inTable = true;
        tableLines = [line];
      } else if (isTableRow && inTable) {
        tableLines.push(line);
      } else if (!isTableRow && inTable) {
        // **End of table - format it**
        result.push(...this.formatTable(tableLines, customRules));
        result.push(line);
        inTable = false;
        tableLines = [];
      } else {
        result.push(line);
      }
    }

    // **Handle table at end of file**
    if (inTable && tableLines.length > 0) {
      result.push(...this.formatTable(tableLines, customRules));
    }

    return result.join("\n");
  }

  /**
   * **Format a single table**
   */
  private formatTable(tableLines: string[], _customRules: any): string[] {
    if (tableLines.length < 2) {
      return tableLines;
    }

    const rows = tableLines.map((line) =>
      line
        .split("|")
        .map((cell) => cell.trim())
        .filter(
          (cell, index, arr) =>
            (index > 0 && index < arr.length - 1) ||
            (index === 0 && cell !== "") ||
            (index === arr.length - 1 && cell !== "")
        )
    );

    if (rows.length === 0 || rows[0].length === 0) {
      return tableLines;
    }

    // **Calculate column widths**
    const colCount = Math.max(...rows.map((row) => row.length));
    const colWidths = new Array(colCount).fill(0);

    for (const row of rows) {
      for (let i = 0; i < colCount; i++) {
        const cell = row[i] || "";
        colWidths[i] = Math.max(colWidths[i], cell.length);
      }
    }

    // **Format rows**
    const formattedRows = rows.map((row, rowIndex) => {
      const cells = row.map((cell, colIndex) => {
        const width = colWidths[colIndex];
        if (rowIndex === 1 && cell.match(/^:?-+:?$/)) {
          // **Alignment row**
          if (cell.startsWith(":") && cell.endsWith(":")) {
            return ":" + "-".repeat(width - 2) + ":";
          } else if (cell.endsWith(":")) {
            return "-".repeat(width - 1) + ":";
          } else if (cell.startsWith(":")) {
            return ":" + "-".repeat(width - 1);
          } else {
            return "-".repeat(width);
          }
        } else {
          return cell.padEnd(width);
        }
      });

      return "| " + cells.join(" | ") + " |";
    });

    return formattedRows;
  }

  /**
   * **Format code blocks**
   */
  private formatCodeBlocks(text: string, customRules: any): string {
    let result = text;

    // **Ensure blank lines around code blocks**
    result = result.replace(/(?<=\S.*)\n```/g, "\n\n```");
    result = result.replace(/```\n(?=\S)/g, "```\n\n");

    // **Format inline code**
    if (customRules.normalizeInlineCode !== false) {
      result = result.replace(/`([^`\n]+)`/g, (_match, code) => {
        return "`" + code.trim() + "`";
      });
    }

    return result;
  }

  /**
   * **Format links and images**
   */
  private formatLinksAndImages(text: string, customRules: any): string {
    let result = text;

    // **Normalize link formatting**
    if (customRules.normalizeLinkSpacing !== false) {
      // **Remove spaces in link syntax**
      result = result.replace(
        /\[\s*([^\]]+)\s*\]\s*\(\s*([^)]+)\s*\)/g,
        "[$1]($2)"
      );
    }

    // **Format reference links**
    if (customRules.formatReferenceLinks !== false) {
      // **Ensure blank line before reference definitions**
      result = result.replace(/(?<=\S.*)\n(\[[^\]]+\]:\s*)/g, "\n\n$1");
    }

    return result;
  }

  /**
   * **Fix line spacing throughout the document**
   */
  private fixLineSpacing(text: string, customRules: any): string {
    let result = text;

    // **Remove excessive blank lines**
    const maxBlankLines = customRules.maxBlankLines || 2;
    const blankLineRegex = new RegExp(
      `\\n\\s*\\n(?:\\s*\\n){${maxBlankLines},}`,
      "g"
    );
    result = result.replace(blankLineRegex, "\n".repeat(maxBlankLines + 1));

    // **Ensure blank line before block elements**
    const blockElements = [">", "```", "---", "***", "___"];
    for (const element of blockElements) {
      const regex = new RegExp(
        `(?<=\\S.*)\\n(${element.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
        "g"
      );
      result = result.replace(regex, `\n\n$1`);
    }

    return result;
  }

  /**
   * **Wrap text to specified line length**
   */
  private wrapText(text: string, maxLength: number): string {
    const lines = text.split("\n");
    const wrappedLines: string[] = [];

    for (const line of lines) {
      // **Don't wrap headers, code blocks, tables, or lists**
      if (
        line.match(/^#{1,6}\s/) ||
        line.match(/^```/) ||
        line.includes("|") ||
        line.match(/^\s*([*+-]|\d+\.)\s/) ||
        line.match(/^>\s/)
      ) {
        wrappedLines.push(line);
        continue;
      }

      if (line.length <= maxLength) {
        wrappedLines.push(line);
        continue;
      }

      // **Wrap long lines**
      const words = line.split(" ");
      let currentLine = "";

      for (const word of words) {
        if (currentLine.length + word.length + 1 <= maxLength) {
          currentLine += (currentLine ? " " : "") + word;
        } else {
          if (currentLine) {
            wrappedLines.push(currentLine);
          }
          currentLine = word;
        }
      }

      if (currentLine) {
        wrappedLines.push(currentLine);
      }
    }

    return wrappedLines.join("\n");
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
}
