import * as vscode from "vscode";
import * as prettier from "prettier";
import { BaseFormatter } from "./base-formatter";
import { FormatOptions, FormatResult } from "../types";
import { FormatError } from "../errors/format-error"; // 导入自定义格式化错误类型

/**
 * **Formatter for JavaScript and TypeScript files**
 */
export class JavaScriptFormatter extends BaseFormatter {
  public readonly supportedLanguages = [
    "javascript",
    "typescript",
    "javascriptreact",
    "typescriptreact",
  ];

  /**
   * **Format JavaScript/TypeScript code using Prettier**
   */
  async formatText(
    text: string,
    options: FormatOptions
  ): Promise<FormatResult> {
    try {
      const preprocessedText = this.preprocess(text, options);

      // **Determine parser based on language**
      const parser = this.getParser(options.languageId);

      // **Configure Prettier options**
      const prettierOptions: prettier.Options = {
        parser,
        tabWidth: options.tabSize || options.indentSize || 2,
        useTabs: options.useTabs || false,
        printWidth: options.maxLineLength || 120,
        semi: true,
        singleQuote: false,
        quoteProps: "as-needed",
        trailingComma: "es5",
        bracketSpacing: true,
        bracketSameLine: false,
        arrowParens: "avoid",
        endOfLine: "lf",
        insertPragma: false,
        proseWrap: "preserve",
        requirePragma: false,
        // **Override with custom rules if provided**
        ...this.getCustomRules(options),
      };

      // **Format with Prettier**
      const formattedText = await prettier.format(
        preprocessedText,
        prettierOptions
      );

      // **Post-process the result**
      const finalText = this.postprocess(formattedText, options);
      const normalizedText = this.normalizeIndentation(finalText, options);

      return this.createSuccessResult(normalizedText);
    } catch (error) {
      return this.handleFormattingError(error, options);
    }
  }

  /**
   * **Enhanced format text with built-in formatter fallback**
   */
  async formatTextWithFallback(
    text: string,
    options: FormatOptions,
    useBuiltInFallback: boolean = true
  ): Promise<FormatResult> {
    try {
      // **First try custom Prettier formatting**
      const result = await this.formatText(text, options);

      if (result.success) {
        return result;
      }

      // **If custom formatting failed and fallback is enabled**
      if (useBuiltInFallback && result.error) {        console.warn(`Custom formatting failed for ${options.languageId}, trying built-in formatter`);
        return await this.tryBuiltInFormatter(text, options);
      }

      return result;
    } catch (error) {
      if (useBuiltInFallback) {        console.warn(`Custom formatting threw error for ${options.languageId}, trying built-in formatter`);
        return await this.tryBuiltInFormatter(text, options);
      }

      return this.handleFormattingError(error, options);
    }
  }

  /**
   * **Try using VS Code's built-in formatter as fallback**
   */
  private async tryBuiltInFormatter(
    text: string,
    options: FormatOptions
  ): Promise<FormatResult> {
    try {
      // **Create a temporary document to use built-in formatter**
      const tempUri = vscode.Uri.parse(
        `untitled:temp.${this.getFileExtension(options.languageId)}`
      );

      // **Execute built-in formatter**
      const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
        "vscode.executeFormatDocumentProvider",
        tempUri,
        {
          insertSpaces: !options.useTabs,
          tabSize: options.tabSize || 2,
        }
      );

      if (edits && edits.length > 0) {
        // **Apply edits to get formatted text**
        let formattedText = text;
        for (const edit of edits.reverse()) {
          // Apply in reverse order
          const startOffset = this.getOffsetFromPosition(text, edit.range.start);
          const endOffset = this.getOffsetFromPosition(text, edit.range.end);
          formattedText =
            formattedText.substring(0, startOffset) +
            edit.newText +
            formattedText.substring(endOffset);
        }

        return this.createFormatterResult(formattedText, "builtin");
      }

      return {
        success: false,
        text: undefined,
        error: new FormatError(
          "Built-in formatter returned no edits",
          options.languageId
        ),
      };
    } catch (error) {
      return {
        success: false,
        text: undefined,
        error: new FormatError(
          `Built-in formatter failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          options.languageId,
          error instanceof Error ? error : undefined
        ),
      };
    }
  }

  /**
   * **Get the appropriate parser for the language**
   */
  private getParser(languageId: string): string {
    switch (languageId) {
      case "typescript":
      case "typescriptreact":
        return "typescript";
      case "javascriptreact":
        return "babel";
      case "javascript":
      default:
        return "babel";
    }
  }

  /**
   * **Extract custom formatting rules from options**
   */
  private getCustomRules(options: FormatOptions): Partial<prettier.Options> {
    const customRules: Partial<prettier.Options> = {};

    if (options.customRules) {
      const rules = options.customRules;

      // **Map common rules to Prettier options**
      if (typeof rules.semi === "boolean") {
        customRules.semi = rules.semi;
      }
      if (typeof rules.singleQuote === "boolean") {
        customRules.singleQuote = rules.singleQuote;
      }
      if (typeof rules.trailingComma === "string") {
        customRules.trailingComma = rules.trailingComma as any;
      }
      if (typeof rules.bracketSpacing === "boolean") {
        customRules.bracketSpacing = rules.bracketSpacing;
      }
      if (typeof rules.arrowParens === "string") {
        customRules.arrowParens = rules.arrowParens as any;
      }
    }

    return customRules;
  }

  /**
   * **Get file extension for language ID**
   */
  private getFileExtension(languageId: string): string {
    const extensionMap: Record<string, string> = {
      javascript: "js",
      typescript: "ts",
      javascriptreact: "jsx",
      typescriptreact: "tsx",
    };
    return extensionMap[languageId] || "js";
  }

  /**
   * **Convert position to offset in text**
   */
  private getOffsetFromPosition(
    text: string,
    position: vscode.Position
  ): number {
    const lines = text.split("\n");
    let offset = 0;

    for (let i = 0; i < position.line && i < lines.length; i++) {
      offset += lines[i].length + 1; // +1 for newline character
    }

    return offset + position.character;
  }
  /**
   * **Create success result with formatter type**
   */
  private createFormatterResult(
    text: string,
    formatterType: string = "prettier"
  ): FormatResult {
    return {
      success: true,
      text,
      formatterUsed: formatterType,
    };
  }

  /**
   * **Handle formatting errors with detailed diagnostics**
   */
  private handleFormattingError(
    error: unknown,
    options: FormatOptions
  ): FormatResult {
    // 创建基础错误信息
    const baseMessage =
      error instanceof Error ? error.message : "Unknown formatting error";
    const errorType = error instanceof Error ? error.constructor.name : "Error";

    // 构建增强错误信息
    let enhancedMessage = `${errorType}: ${baseMessage}`;

    // 添加特定语言的错误提示
    const languageInfo = `Language: ${options.languageId}`;
    enhancedMessage += `\n${languageInfo}`;

    // 如果是 Prettier 的语法错误，尝试提取行号和列号信息
    if (
      baseMessage.includes("Unexpected token") ||
      baseMessage.includes("SyntaxError")
    ) {
      const match = baseMessage.match(/\((\d+):(\d+)\)/);
      if (match && match.length >= 3) {
        const [_, line, column] = match;
        enhancedMessage += `\nSyntax error at line ${line}, column ${column}`;
        enhancedMessage += `\nPlease check for syntax errors in your code.`;
      }
    }

    // 添加常见错误的解决建议
    if (baseMessage.includes("Unknown option")) {
      enhancedMessage += `\nThis may be due to incompatible Prettier options or version mismatch.`;
    } else if (baseMessage.includes("No parser could be inferred")) {
      enhancedMessage += `\nCould not determine appropriate parser for ${options.languageId}.`;
    }

    // 创建增强错误对象
    const formattingError = new FormatError(
      enhancedMessage,
      options.languageId,
      error instanceof Error ? error : undefined
    );

    return {
      success: false,
      text: undefined,
      error: formattingError,
    };
  }
}
