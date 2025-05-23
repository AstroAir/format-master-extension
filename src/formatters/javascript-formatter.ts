import * as prettier from "prettier";
import { BaseFormatter } from "./base-formatter";
import { FormatOptions, FormatResult } from "../types";

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
      if (error instanceof Error) {
        return this.createErrorResult(error);
      }
      return this.createErrorResult(new Error("Unknown formatting error"));
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
}
