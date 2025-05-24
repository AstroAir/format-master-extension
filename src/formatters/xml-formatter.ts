import * as xmlFormatter from "xml-formatter";
import { BaseFormatter } from "./base-formatter";
import { FormatOptions, FormatResult } from "../types";
import formatXml from "xml-formatter";

/**
 * **Formatter for XML files**
 */
export class XmlFormatter extends BaseFormatter {
  public readonly supportedLanguages = ["xml", "xsl", "xsd", "svg"];

  /**
   * **Format XML content**
   */
  async formatText(
    text: string,
    options: FormatOptions
  ): Promise<FormatResult> {
    try {
      const preprocessedText = this.preprocess(text, options);

      // **Configure XML formatter options**
      const xmlOptions: xmlFormatter.XMLFormatterOptions = {
        indentation: this.getIndentString(options),
        filter: (node) => node.type !== "Comment", // **Keep comments by default**
        collapseContent: true,
        lineSeparator: "\n",
        whiteSpaceAtEndOfSelfclosingTag: false,
        throwOnFailure: true,
      }; // **Apply custom rules**
      this.applyCustomRules(xmlOptions, options);

      // **Format the XML**
      let formattedXml = formatXml(preprocessedText, xmlOptions);

      // **Handle SVG-specific formatting if applicable**
      if (options.languageId === "svg") {
        formattedXml = this.formatSvg(formattedXml, options);
      }

      // **Post-process the result**
      const finalText = this.postprocess(formattedXml, options);

      return this.createSuccessResult(finalText);
    } catch (error) {
      if (error instanceof Error) {
        return this.createErrorResult(error);
      }
      return this.createErrorResult(new Error("XML formatting error"));
    }
  }

  /**
   * **Get the indentation string based on options**
   */
  private getIndentString(options: FormatOptions): string {
    if (options.useTabs) {
      return "\t";
    }

    const indentSize = options.tabSize || options.indentSize || 2;
    return " ".repeat(indentSize);
  }

  /**
   * **Apply custom formatting rules**
   */
  private applyCustomRules(
    xmlOptions: xmlFormatter.XMLFormatterOptions,
    options: FormatOptions
  ): void {
    if (!options.customRules) {
      return;
    }

    const rules = options.customRules;

    // **Apply XML-specific custom rules**
    if (typeof rules.collapseContent === "boolean") {
      xmlOptions.collapseContent = rules.collapseContent;
    }

    if (
      typeof rules.preserveComments === "boolean" &&
      !rules.preserveComments
    ) {
      // If preserveComments is false, we don't want to filter them out.
      // The default filter keeps comments, so we only change it if preserveComments is explicitly false.
      // xmlFormatter's filter: return true to keep the node, false to remove.
      // To remove comments when preserveComments is false:
      xmlOptions.filter = (node) => node.type !== "Comment";
    } else if (rules.preserveComments === true) {
      // To keep comments when preserveComments is true (or undefined, as per default)
      xmlOptions.filter = (_node) => true;
    }

    if (typeof rules.whiteSpaceAtEndOfSelfClosingTag === "boolean") {
      xmlOptions.whiteSpaceAtEndOfSelfclosingTag =
        rules.whiteSpaceAtEndOfSelfClosingTag;
    }

    if (typeof rules.maxLineLength === "number") {
      // **Note: xml-formatter doesn't have built-in line length support**
      // **This would need to be implemented as a post-processing step**
    }
  }

  /**
   * **Handle SVG-specific formatting**
   */
  private formatSvg(text: string, options: FormatOptions): string {
    // **SVG-specific optimizations**
    let formatted = text;

    // **Optimize path data if enabled**
    if (options.customRules?.optimizePaths !== false) {
      formatted = this.optimizeSvgPaths(formatted);
    }

    return formatted;
  }

  /**
   * **Basic SVG path optimization**
   */
  private optimizeSvgPaths(svg: string): string {
    // **Simple path data cleanup**
    return svg.replace(/d="([^"]+)"/g, (_match, pathData: string) => {
      // **Remove unnecessary spaces and decimals**
      const optimized = pathData
        .replace(/\s+/g, " ")
        .replace(/(\d)\s+(\d)/g, "$1 $2")
        .trim();

      return `d="${optimized}"`;
    });
  }
}
