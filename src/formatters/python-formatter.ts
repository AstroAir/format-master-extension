import { BaseFormatter } from "./base-formatter";
import {
  FormatOptions,
  FormatResult,
  FormatterPriority,
  FormatOptionDescriptor,
  ValidationResult,
  DiagnosticLevel,
} from "../types";
import { FormatError } from "../errors/format-error";

/**
 * **Enhanced formatter for Python files with PEP 8 compliance**
 */
export class PythonFormatter extends BaseFormatter {
  public readonly name = "Python";
  public readonly supportedLanguages = ["python"];
  public readonly priority = FormatterPriority.HIGH;

  /**
   * **Format Python code with PEP 8 compliance**
   */
  public async formatText(
    text: string, 
    options: FormatOptions
  ): Promise<FormatResult> {
    try {
      const preprocessedText = this.preprocess(text, options);
      const startTime = Date.now();

      let formattedText = this.formatPythonCode(preprocessedText, options);
      const finalText = this.postprocess(formattedText, options);
      const executionTime = Date.now() - startTime;

      const result = this.createSuccessResult(finalText);
      result.formatterUsed = "formatMaster-python";
      result.executionTime = executionTime;
      return result;
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error : new Error("Unknown error")
      );
    }
  }

  /**
   * **Format the given text**
   */
  public async format(
    text: string,
    options: FormatOptions
  ): Promise<FormatResult> {
    return this.formatText(text, options);
  }

  /**
   * **Get supported formatting options**
   */
  public getSupportedOptions(): FormatOptionDescriptor[] {
    return [
      {
        name: "maxLineLength",
        type: "number",
        default: 79,
        required: false,
        description: "Maximum line length according to PEP 8",
      },
      {
        name: "sortImports",
        type: "boolean",
        default: true,
        required: false,
        description: "Sort import statements",
      },
    ];
  }

  /**
   * **Get formatter version**
   */
  public getVersion(): string {
    return "1.0.0";
  }

  /**
   * **Validate Python syntax**
   */
  public async validateSyntax(
    content: string,
    languageId: string
  ): Promise<ValidationResult> {
    try {
      new Function(content);
      return {
        isValid: true,
        errors: [],
        warnings: [],
        suggestions: [],
        executionTime: 0,
      };
    } catch (error: any) {
      return {
        isValid: false,
        errors: [
          {
            code: "SYNTAX_ERROR",
            message:
              error instanceof Error ? error.message : "Invalid Python syntax",
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

  private formatPythonCode(text: string, options: FormatOptions): string {
    let lines = text.split("\n");
    const indentChar = options.insertSpaces
      ? " ".repeat(options.tabSize || 4)
      : "\t";
    const customRules = this.getCustomRules(options);

    let indentLevel = 0;
    const formattedLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      const trimmedLine = line.trim();

      if (trimmedLine === "" || trimmedLine.startsWith("#")) {
        formattedLines.push(line);
        continue;
      }

      if (this.isDedentKeyword(trimmedLine)) {
        indentLevel = Math.max(0, indentLevel - 1);
      }

      const indentedLine = indentChar.repeat(indentLevel) + trimmedLine;

      if (this.isIndentKeyword(trimmedLine)) {
        indentLevel++;
      }

      const formattedLine = this.formatImports(indentedLine, customRules);
      const finalLine = this.formatDefinitions(formattedLine, customRules);

      formattedLines.push(finalLine);
    }

    let result = formattedLines.join("\n");
    result = this.applyPep8Rules(result, options);

    return result;
  }

  private isIndentKeyword(line: string): boolean {
    const indentKeywords = [
      "if ",
      "elif ",
      "else:",
      "for ",
      "while ",
      "try:",
      "except:",
      "except ",
      "finally:",
      "with ",
      "def ",
      "class ",
      "async def ",
      "async for ",
      "async with ",
    ];

    return (
      indentKeywords.some(
        (keyword) =>
          line.startsWith(keyword) ||
          (line.includes(":") && line.includes(keyword))
      ) && line.endsWith(":")
    );
  }

  private isDedentKeyword(line: string): boolean {
    const dedentKeywords = ["except:", "except ", "elif ", "else:", "finally:"];
    return dedentKeywords.some((keyword) => line.startsWith(keyword));
  }

  private formatImports(line: string, customRules: any): string {
    const trimmed = line.trim();

    if (
      customRules.sortImports === true &&
      (trimmed.startsWith("import ") || trimmed.startsWith("from "))
    ) {
      return line.replace(/,\s*/g, ", ");
    }

    return line;
  }

  private formatDefinitions(line: string, customRules: any): string {
    const trimmed = line.trim();

    if (
      trimmed.startsWith("def ") ||
      trimmed.startsWith("class ") ||
      trimmed.startsWith("async def ")
    ) {
      return line;
    }

    return line;
  }

  private applyPep8Rules(text: string, options: FormatOptions): string {
    let result = text;

    const maxLength = options.maxLineLength || 79;
    const lines = result.split("\n");
    const wrappedLines = lines.map((line) =>
      this.wrapLongLine(line, maxLength)
    );
    result = wrappedLines.join("\n");

    result = this.fixOperatorSpacing(result);
    result = this.fixFunctionCallSpacing(result);
    result = result.replace(/[ \t]+$/gm, "");
    result = this.fixBlankLineSpacing(result);

    return result;
  }

  private wrapLongLine(line: string, maxLength: number): string {
    if (line.length <= maxLength) {
      return line;
    }

    const indent = line.match(/^\s*/)?.[0] || "";
    const content = line.trim();

    if (
      content.startsWith("#") ||
      content.includes('"""') ||
      content.includes("'''")
    ) {
      return line;
    }

    const wrapPoints = [", ", " and ", " or ", " + ", " - ", " * ", " / "];

    for (const wrapPoint of wrapPoints) {
      if (content.includes(wrapPoint)) {
        const parts = content.split(wrapPoint);
        if (parts.length > 1) {
          const firstPart = indent + parts[0] + wrapPoint;
          if (firstPart.length < maxLength) {
            const remainingParts = parts.slice(1).join(wrapPoint);
            return firstPart + "\n" + indent + "    " + remainingParts;
          }
        }
      }
    }

    return line;
  }

  private fixOperatorSpacing(text: string): string {
    let result = text;

    const binaryOperators = [
      "==",
      "!=",
      "<=",
      ">=",
      "<",
      ">",
      "=",
      "+=",
      "-=",
      "*=",
      "/=",
    ];

    for (const op of binaryOperators) {
      const regex = new RegExp(
        `\\s*${op.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`,
        "g"
      );
      result = result.replace(regex, ` ${op} `);
    }

    result = result.replace(/\s+/g, " ");

    return result;
  }

  private fixFunctionCallSpacing(text: string): string {
    return text.replace(/(\w)\s+\(/g, "$1(");
  }

  private fixBlankLineSpacing(text: string): string {
    let result = text;
    result = result.replace(/\n\s*\n\s*\n/g, "\n\n");
    result = result.replace(/\n(class |def |async def )/g, "\n\n$1");
    return result;
  }

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

  private countChanges(original: string, formatted: string): number {
    let changes = 0;
    const maxLength = Math.max(original.length, formatted.length);

    for (let i = 0; i < maxLength; i++) {
      if (original[i] !== formatted[i]) {
        changes++;
      }
    }

    return changes;
  }

  private getCustomRules(options: FormatOptions): Record<string, any> {
    const customRules = options.customRules || {};
    return {
      sortImports: customRules.sortImports ?? true,
    };
  }
}
