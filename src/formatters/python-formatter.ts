import { BaseFormatter } from "./base-formatter";
import { FormatOptions, FormatResult } from "../types";
import { FormatError } from "../errors/format-error";

/**
 * **Enhanced formatter for Python files with PEP 8 compliance**
 */
export class PythonFormatter extends BaseFormatter {
  public readonly supportedLanguages = ["python"];

  /**
   * **Format Python code with PEP 8 compliance**
   */
  async formatText(text: string, options: FormatOptions): Promise<FormatResult> {
    try {
      const preprocessedText = this.preprocess(text, options);
      const startTime = Date.now();

      // **Apply Python-specific formatting rules**
      let formattedText = this.formatPythonCode(preprocessedText, options);

      // **Apply post-processing**
      const finalText = this.postprocess(formattedText, options);
      const executionTime = Date.now() - startTime;

      return {
        success: true,
        text: finalText,
        changes: this.countChanges(text, finalText),
        formatterUsed: 'formatMaster-python',
        executionTime,
        originalLength: text.length,
        newLength: finalText.length,
        linesChanged: this.countLinesChanged(text, finalText)
      };

    } catch (error) {
      return {
        success: false,
        error: new FormatError(
          `Python formatting failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          options.languageId,
          error instanceof Error ? error : undefined
        ),
        formatterUsed: 'formatMaster-python'
      };
    }
  }

  /**
   * **Format Python code according to PEP 8 standards**
   */
  private formatPythonCode(text: string, options: FormatOptions): string {
    let lines = text.split('\n');
    const indentChar = options.useTabs ? '\t' : ' '.repeat(options.indentSize || 4);
    const customRules = this.getCustomRules(options);

    // **Track indentation level**
    let indentLevel = 0;
    const formattedLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      const trimmedLine = line.trim();

      // **Skip empty lines and comments (preserve their indentation)**
      if (trimmedLine === '' || trimmedLine.startsWith('#')) {
        formattedLines.push(line);
        continue;
      }

      // **Handle dedent keywords**
      if (this.isDedentKeyword(trimmedLine)) {
        indentLevel = Math.max(0, indentLevel - 1);
      }

      // **Apply indentation**
      const indentedLine = indentChar.repeat(indentLevel) + trimmedLine;

      // **Handle indent keywords**
      if (this.isIndentKeyword(trimmedLine)) {
        indentLevel++;
      }

      // **Format imports**
      const formattedLine = this.formatImports(indentedLine, customRules);
      
      // **Format function/class definitions**
      const finalLine = this.formatDefinitions(formattedLine, customRules);

      formattedLines.push(finalLine);
    }

    let result = formattedLines.join('\n');

    // **Apply PEP 8 specific formatting**
    result = this.applyPep8Rules(result, options);

    return result;
  }

  /**
   * **Check if line contains keywords that increase indentation**
   */
  private isIndentKeyword(line: string): boolean {
    const indentKeywords = [
      'if ', 'elif ', 'else:', 'for ', 'while ', 'try:', 'except:', 'except ',
      'finally:', 'with ', 'def ', 'class ', 'async def ', 'async for ', 'async with '
    ];

    return indentKeywords.some(keyword => 
      line.startsWith(keyword) || line.includes(`:`) && line.includes(keyword)
    ) && line.endsWith(':');
  }

  /**
   * **Check if line contains keywords that decrease indentation**
   */
  private isDedentKeyword(line: string): boolean {
    const dedentKeywords = ['except:', 'except ', 'elif ', 'else:', 'finally:'];
    return dedentKeywords.some(keyword => line.startsWith(keyword));
  }

  /**
   * **Format import statements according to PEP 8**
   */
  private formatImports(line: string, customRules: any): string {
    const trimmed = line.trim();
    
    // **Sort imports if enabled**
    if (customRules.sortImports === true && (trimmed.startsWith('import ') || trimmed.startsWith('from '))) {
      // **Basic import formatting - in production use isort or similar**
      return line.replace(/,\s*/g, ', '); // **Normalize comma spacing**
    }

    return line;
  }

  /**
   * **Format function and class definitions**
   */
  private formatDefinitions(line: string, customRules: any): string {
    const trimmed = line.trim();

    // **Add blank lines before function/class definitions**
    if (trimmed.startsWith('def ') || trimmed.startsWith('class ') || 
        trimmed.startsWith('async def ')) {
      // **This would require context of previous lines - simplified for now**
      return line;
    }

    return line;
  }

  /**
   * **Apply PEP 8 specific rules**
   */
  private applyPep8Rules(text: string, options: FormatOptions): string {
    let result = text;

    // **Ensure line length compliance**
    const maxLength = options.maxLineLength || 79; // **PEP 8 default**
    const lines = result.split('\n');
    const wrappedLines = lines.map(line => this.wrapLongLine(line, maxLength));
    result = wrappedLines.join('\n');

    // **Fix spacing around operators**
    result = this.fixOperatorSpacing(result);

    // **Fix spacing in function calls**
    result = this.fixFunctionCallSpacing(result);

    // **Remove trailing whitespace**
    result = result.replace(/[ \t]+$/gm, '');

    // **Ensure proper blank line spacing**
    result = this.fixBlankLineSpacing(result);

    return result;
  }

  /**
   * **Wrap long lines according to PEP 8 guidelines**
   */
  private wrapLongLine(line: string, maxLength: number): string {
    if (line.length <= maxLength) {
      return line;
    }

    // **Simple line wrapping - in production use a proper Python parser**
    const indent = line.match(/^\s*/)?.[0] || '';
    const content = line.trim();

    // **Don't wrap comments or strings for now**
    if (content.startsWith('#') || content.includes('"""') || content.includes("'''")) {
      return line;
    }

    // **Simple wrapping on commas and operators**
    const wrapPoints = [', ', ' and ', ' or ', ' + ', ' - ', ' * ', ' / '];
    
    for (const wrapPoint of wrapPoints) {
      if (content.includes(wrapPoint)) {
        const parts = content.split(wrapPoint);
        if (parts.length > 1) {
          const firstPart = indent + parts[0] + wrapPoint;
          if (firstPart.length < maxLength) {
            const remainingParts = parts.slice(1).join(wrapPoint);
            return firstPart + '\n' + indent + '    ' + remainingParts;
          }
        }
      }
    }

    return line; // **Return original if no good wrap point found**
  }

  /**
   * **Fix spacing around operators**
   */
  private fixOperatorSpacing(text: string): string {
    let result = text;

    // **Add spaces around binary operators**
    const binaryOperators = ['==', '!=', '<=', '>=', '<', '>', '=', '+=', '-=', '*=', '/='];
    
    for (const op of binaryOperators) {
      const regex = new RegExp(`\\s*${op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'g');
      result = result.replace(regex, ` ${op} `);
    }

    // **Fix double spaces**
    result = result.replace(/\s+/g, ' ');

    return result;
  }

  /**
   * **Fix spacing in function calls**
   */
  private fixFunctionCallSpacing(text: string): string {
    // **Remove spaces before opening parentheses in function calls**
    return text.replace(/(\w)\s+\(/g, '$1(');
  }

  /**
   * **Fix blank line spacing according to PEP 8**
   */
  private fixBlankLineSpacing(text: string): string {
    let result = text;

    // **Remove excessive blank lines**
    result = result.replace(/\n\s*\n\s*\n/g, '\n\n');

    // **Ensure blank lines around class and function definitions**
    result = result.replace(/\n(class |def |async def )/g, '\n\n$1');

    return result;
  }

  /**
   * **Count lines that were changed**
   */
  private countLinesChanged(original: string, formatted: string): number {
    const originalLines = original.split('\n');
    const formattedLines = formatted.split('\n');
    
    let changedLines = 0;
    const maxLines = Math.max(originalLines.length, formattedLines.length);
    
    for (let i = 0; i < maxLines; i++) {
      const originalLine = originalLines[i] || '';
      const formattedLine = formattedLines[i] || '';
      
      if (originalLine.trim() !== formattedLine.trim()) {
        changedLines++;
      }
    }
    
    return changedLines;
  }

  /**
   * **Enhanced preprocessing for Python**
   */
  protected preprocess(text: string, options: FormatOptions): string {
    let processedText = super.preprocess(text, options);

    // **Normalize line endings**
    processedText = processedText.replace(/\r\n/g, '\n');

    // **Preserve docstrings and multi-line strings**
    processedText = this.preserveMultilineStrings(processedText);

    return processedText;
  }

  /**
   * **Preserve multi-line strings during formatting**
   */
  private preserveMultilineStrings(text: string): string {
    // **Simple preservation - in production use a proper Python parser**
    return text.replace(/("""[\s\S]*?"""|'''[\s\S]*?''')/g, (match) => {
      // **Replace internal newlines with a placeholder**
      return match.replace(/\n/g, '__NEWLINE_PLACEHOLDER__');
    });
  }

  /**
   * **Enhanced postprocessing for Python**
   */
  protected postprocess(text: string, options: FormatOptions): string {
    let processedText = super.postprocess(text, options);

    // **Restore preserved multi-line strings**
    processedText = processedText.replace(/__NEWLINE_PLACEHOLDER__/g, '\n');

    return processedText;
  }

  /**
   * **Count the number of characters that were changed during formatting**
   */
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

  /**
   * **Get custom formatting rules from options**
   */
  private getCustomRules(options: FormatOptions): Record<string, any> {
    const customRules = options.customRules || {};
    return {
      sortImports: customRules.sortImports ?? true,
      // Add other custom rules as needed
    };
  }
}
