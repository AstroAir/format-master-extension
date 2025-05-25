import jsBeautify from "js-beautify";
import { BaseFormatter } from "./base-formatter";
import { FormatOptions, FormatResult } from "../types";
import { FormatError } from "../errors/format-error";

/**
 * **Enhanced formatter for HTML files with intelligent content handling**
 */
export class HtmlFormatter extends BaseFormatter {
  public readonly supportedLanguages = ["html", "htm", "xhtml"];

  /**
   * **Format HTML code with enhanced features**
   */
  async formatText(
    text: string,
    options: FormatOptions
  ): Promise<FormatResult> {
    try {
      const preprocessedText = this.preprocess(text, options);
      const startTime = Date.now();

      // **Configure js-beautify HTML options**
      const beautifyOptions: jsBeautify.HTMLBeautifyOptions = {
        indent_size: options.indentSize || 2,
        indent_char: options.useTabs ? "\t" : " ",
        max_preserve_newlines: 2,
        preserve_newlines: true,
        indent_scripts: "normal",
        end_with_newline: options.insertFinalNewline ?? true,
        wrap_line_length: options.maxLineLength || 120,
        indent_inner_html: false,
        indent_body_inner_html: true,
        indent_head_inner_html: true,
        wrap_attributes: "auto",
        wrap_attributes_indent_size: options.indentSize || 2,
        // **Override with custom rules if provided**
        ...this.getCustomRules(options),
      };

      const formattedText = jsBeautify.html(preprocessedText, beautifyOptions);

      // **Apply post-processing**
      const finalText = this.postprocess(formattedText, options);
      const executionTime = Date.now() - startTime;

      return {
        success: true,
        text: finalText,
        changes: this.countChanges(text, finalText),
        formatterUsed: "formatMaster-html",
        executionTime,
        originalLength: text.length,
        newLength: finalText.length,
        linesChanged: this.countLinesChanged(text, finalText),
      };
    } catch (error) {
      return {
        success: false,
        error: new FormatError(
          `HTML formatting failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          options.languageId,
          error instanceof Error ? error : undefined
        ),
        formatterUsed: "formatMaster-html",
      };
    }
  }

  /**
   * **Get custom formatting rules from options**
   */
  protected getCustomRules(
    options: FormatOptions
  ): Partial<jsBeautify.HTMLBeautifyOptions> {
    const customRules: Partial<jsBeautify.HTMLBeautifyOptions> = {};

    // **Apply custom rules from options if available**
    if (options.customRules) {
      Object.assign(customRules, options.customRules);
    }

    return customRules;
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
   * **Enhanced preprocessing for HTML**
   */
  protected preprocess(text: string, options: FormatOptions): string {
    let processedText = super.preprocess(text, options);

    // **Preserve script and style content**
    processedText = this.preserveEmbeddedContent(processedText);

    // **Normalize whitespace around tags**
    processedText = processedText.replace(/>\s+</g, "><");

    return processedText;
  }

  /**
   * **Enhanced postprocessing for HTML**
   */
  protected postprocess(text: string, options: FormatOptions): string {
    let processedText = super.postprocess(text, options);

    // **Restore preserved content**
    processedText = this.restoreEmbeddedContent(processedText);

    // **Ensure proper spacing around block elements**
    const blockElements = [
      "div",
      "section",
      "article",
      "main",
      "header",
      "footer",
      "aside",
      "nav",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "p",
      "ul",
      "ol",
      "li",
      "table",
      "form",
    ];

    for (const element of blockElements) {
      const regex = new RegExp(
        `</${element}>(?!\\s*</(${blockElements.join("|")}|body|html)>)`,
        "gi"
      );
      processedText = processedText.replace(regex, `</${element}>\n`);
    }

    return processedText;
  }

  /**
   * **Preserve embedded script and style content during formatting**
   */
  private preserveEmbeddedContent(html: string): string {
    const preservedContent: string[] = [];
    let index = 0;

    // **Preserve script tags**
    html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, (match) => {
      const placeholder = `__PRESERVED_SCRIPT_${index}__`;
      preservedContent[index] = match;
      index++;
      return placeholder;
    });

    // **Preserve style tags**
    html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, (match) => {
      const placeholder = `__PRESERVED_STYLE_${index}__`;
      preservedContent[index] = match;
      index++;
      return placeholder;
    });

    // **Store in a way that can be retrieved later**
    (this as any)._preservedContent = preservedContent;

    return html;
  }

  /**
   * **Restore preserved embedded content after formatting**
   */
  private restoreEmbeddedContent(html: string): string {
    const preservedContent = (this as any)._preservedContent || [];

    for (let i = 0; i < preservedContent.length; i++) {
      const scriptPlaceholder = `__PRESERVED_SCRIPT_${i}__`;
      const stylePlaceholder = `__PRESERVED_STYLE_${i}__`;

      html = html.replace(scriptPlaceholder, preservedContent[i]);
      html = html.replace(stylePlaceholder, preservedContent[i]);
    }

    // **Clean up**
    delete (this as any)._preservedContent;

    return html;
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
