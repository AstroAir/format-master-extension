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
   * **Handle formatting errors with detailed diagnostics**
   */
  private handleFormattingError(error: unknown, options: FormatOptions): FormatResult {
    // 创建基础错误信息
    const baseMessage = error instanceof Error ? error.message : "Unknown formatting error";
    const errorType = error instanceof Error ? error.constructor.name : "Error";
    
    // 构建增强错误信息
    let enhancedMessage = `${errorType}: ${baseMessage}`;
    
    // 添加特定语言的错误提示
    const languageInfo = `Language: ${options.languageId}`;
    enhancedMessage += `\n${languageInfo}`;
    
    // 如果是 Prettier 的语法错误，尝试提取行号和列号信息
    if (baseMessage.includes("Unexpected token") || baseMessage.includes("SyntaxError")) {
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
      error: formattingError
    };
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
}
