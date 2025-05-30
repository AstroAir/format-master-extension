import { BaseFormatter } from "./base-formatter";
import {
  FormatOptions,
  FormatResult,
  FormatOptionDescriptor,
  ValidationResult,
  DiagnosticLevel,
  ValidationError,
} from "../types";

/**
 * **Formatter for JSON files**
 */
export class JsonFormatter extends BaseFormatter {
  public readonly name = "JSON Formatter";
  public readonly priority = 1;
  public readonly supportedLanguages = ["json", "jsonc"];

  /**
   * **Format JSON content**
   */
  async formatText(
    text: string,
    options: FormatOptions
  ): Promise<FormatResult> {
    try {
      const preprocessedText = this.preprocess(text, options);

      // **Handle JSON with comments (JSONC)**
      const isJsonc = options.languageId === "jsonc";
      let jsonText = preprocessedText;
      let comments: Array<{ position: number; comment: string }> = [];

      // **Extract comments for JSONC**
      if (isJsonc) {
        const result = this.extractComments(jsonText);
        jsonText = result.text;
        comments = result.comments;
      }

      // **Parse and format JSON**
      const parsed = JSON.parse(jsonText);
      const indentString = this.getIndentString(options);
      const formattedJson = JSON.stringify(parsed, null, indentString);

      // **Restore comments for JSONC**
      let formattedText = formattedJson;
      if (isJsonc && comments.length > 0) {
        formattedText = this.restoreComments(formattedJson, comments);
      }

      // **Post-process the result**
      const finalText = this.postprocess(formattedText, options);

      return this.createSuccessResult(finalText);
    } catch (error) {
      if (error instanceof Error) {
        return this.createErrorResult(error);
      }
      return this.createErrorResult(new Error("JSON formatting error"));
    }
  }

  /**
   * **Get the indentation string based on options**
   */
  private getIndentString(options: FormatOptions): string {
    if (!options.insertSpaces) {
      return "\t";
    }

    const tabSize = options.tabSize || 2;
    return " ".repeat(tabSize);
  }

  /**
   * **Extract comments from JSONC text**
   */
  private extractComments(text: string): {
    text: string;
    comments: Array<{ position: number; comment: string }>;
  } {
    const comments: Array<{ position: number; comment: string }> = [];

    // **Simple comment extraction (basic implementation)**
    // **Note: This is a simplified approach. A proper implementation would use a JSON parser that supports comments**
    const lines = text.split("\n");
    const cleanLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const commentMatch = line.match(/^(\s*)(\/\/.*|\/\*.*?\*\/)(.*)$/);

      if (commentMatch) {
        const [, indent, comment, rest] = commentMatch;
        if (rest.trim()) {
          cleanLines.push(indent + rest);
        } else {
          cleanLines.push("");
        }
        comments.push({ position: i, comment: comment.trim() });
      } else {
        cleanLines.push(line);
      }
    }

    return {
      text: cleanLines.join("\n"),
      comments,
    };
  }

  /**
   * **Restore comments to formatted JSON**
   */
  private restoreComments(
    text: string,
    comments: Array<{ position: number; comment: string }>
  ): string {
    // **Simple comment restoration**
    // **Note: This is a simplified approach for demonstration**
    const lines = text.split("\n");

    for (const { position, comment } of comments.reverse()) {
      if (position < lines.length) {
        const line = lines[position];
        const indent = line.match(/^(\s*)/)?.[1] || "";
        lines.splice(position, 0, `${indent}${comment}`);
      }
    }

    return lines.join("\n");
  }

  public async format(
    text: string,
    options: FormatOptions
  ): Promise<FormatResult> {
    return this.formatText(text, options);
  }

  public getSupportedOptions(): FormatOptionDescriptor[] {
    return [
      {
        name: "tabSize",
        type: "number",
        description: "Number of spaces per indentation level",
        default: 2,
        required: false,
      },
      {
        name: "insertSpaces",
        type: "boolean",
        description: "Use spaces for indentation",
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
      if (languageId === "jsonc") {
        const { text } = this.extractComments(content);
        JSON.parse(text);
      } else {
        JSON.parse(content);
      }
      return {
        isValid: true,
        errors: [],
        warnings: [],
        suggestions: [],
        executionTime: 0,
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [
          {
            message:
              error instanceof Error ? error.message : "Invalid JSON syntax",
            line: 0,
            column: 0,
            severity: DiagnosticLevel.ERROR,
            code: "INVALID_JSON",
            source: this.name,
          },
        ],
        warnings: [],
        suggestions: [],
        executionTime: 0,
      };
    }
  }
}
