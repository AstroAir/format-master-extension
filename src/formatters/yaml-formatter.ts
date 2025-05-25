import { BaseFormatter } from "./base-formatter";
import { FormatOptions, FormatResult } from "../types";
import { FormatError } from "../errors/format-error";

/**
 * **Enhanced formatter for YAML files with validation and structure preservation**
 */
export class YamlFormatter extends BaseFormatter {
  public readonly supportedLanguages = ["yaml", "yml"];

  /**
   * **Format YAML content with validation and structure preservation**
   */
  async formatText(text: string, options: FormatOptions): Promise<FormatResult> {
    try {
      const preprocessedText = this.preprocess(text, options);
      const startTime = Date.now();

      // **Validate YAML structure first**
      if (options.validateBeforeFormat !== false) {
        this.validateYamlStructure(preprocessedText);
      }

      // **Apply YAML formatting**
      let formattedText = this.formatYaml(preprocessedText, options);

      // **Apply post-processing**
      const finalText = this.postprocess(formattedText, options);
      const executionTime = Date.now() - startTime;

      return {
        success: true,
        text: finalText,
        changes: this.countChanges(text, finalText),
        formatterUsed: 'formatMaster-yaml',
        executionTime,
        originalLength: text.length,
        newLength: finalText.length,
        linesChanged: this.countLinesChanged(text, finalText)
      };

    } catch (error) {
      return {
        success: false,
        error: new FormatError(
          `YAML formatting failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          options.languageId,
          error instanceof Error ? error : undefined
        ),
        formatterUsed: 'formatMaster-yaml'
      };
    }
  }

  /**
   * **Validate YAML structure before formatting**
   */
  private validateYamlStructure(text: string): void {
    const lines = text.split('\n');
    const indentStack: number[] = [0];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // **Skip empty lines and comments**
      if (trimmed === '' || trimmed.startsWith('#')) {
        continue;
      }

      const indent = line.length - line.trimStart().length;
      
      // **Check for consistent indentation**
      if (indent > indentStack[indentStack.length - 1]) {
        indentStack.push(indent);
      } else if (indent < indentStack[indentStack.length - 1]) {
        // **Pop until we find the right level**
        while (indentStack.length > 1 && indentStack[indentStack.length - 1] > indent) {
          indentStack.pop();
        }
        
        if (indentStack[indentStack.length - 1] !== indent) {
          throw new Error(`Inconsistent indentation at line ${i + 1}: ${line}`);
        }
      }

      // **Check for valid key-value pairs**
      if (trimmed.includes(':') && !trimmed.startsWith('-')) {
        const colonIndex = trimmed.indexOf(':');
        const key = trimmed.substring(0, colonIndex).trim();
        
        if (key === '' || key.includes(' ') && !key.startsWith('"') && !key.startsWith("'")) {
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
    const lines = text.split('\n');
    const indentChar = options.useTabs ? '\t' : ' '.repeat(options.indentSize || 2);
    const customRules = this.getCustomRules(options);
    const formattedLines: string[] = [];

    let currentIndentLevel = 0;
    const indentStack: number[] = [0];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // **Preserve empty lines and comments with proper indentation**
      if (trimmed === '') {
        formattedLines.push('');
        continue;
      }

      if (trimmed.startsWith('#')) {
        const commentIndent = this.getCommentIndent(line, indentStack, customRules);
        formattedLines.push(indentChar.repeat(commentIndent) + trimmed);
        continue;
      }

      // **Calculate proper indentation**
      const originalIndent = line.length - line.trimStart().length;
      let newIndentLevel = this.calculateIndentLevel(originalIndent, indentStack, options.indentSize || 2);

      // **Handle list items**
      if (trimmed.startsWith('-')) {
        const listItemFormatted = this.formatListItem(trimmed, newIndentLevel, indentChar, customRules);
        formattedLines.push(listItemFormatted);
        
        // **Check if list item has a value**
        if (trimmed.includes(':')) {
          const colonIndex = trimmed.indexOf(':');
          const afterColon = trimmed.substring(colonIndex + 1).trim();
          if (afterColon === '') {
            // **List item with nested content - increase indent**
            indentStack.push((newIndentLevel + 1) * (options.indentSize || 2));
          }
        }
        continue;
      }

      // **Handle key-value pairs**
      if (trimmed.includes(':')) {
        const formattedKeyValue = this.formatKeyValue(trimmed, newIndentLevel, indentChar, customRules);
        formattedLines.push(formattedKeyValue);

        // **Check if this starts a new nested structure**
        const colonIndex = trimmed.indexOf(':');
        const afterColon = trimmed.substring(colonIndex + 1).trim();
        
        if (afterColon === '' || afterColon === '|' || afterColon === '>') {
          // **Key with nested content - prepare for increased indent**
          const nextLineIndex = i + 1;
          if (nextLineIndex < lines.length) {
            const nextLine = lines[nextLineIndex];
            const nextTrimmed = nextLine.trim();
            if (nextTrimmed !== '' && !nextTrimmed.startsWith('#')) {
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

    let result = formattedLines.join('\n');

    // **Apply additional formatting rules**
    result = this.applyYamlRules(result, customRules);

    return result;
  }

  /**
   * **Calculate proper indentation level**
   */
  private calculateIndentLevel(originalIndent: number, indentStack: number[], indentSize: number): number {
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
  private getCommentIndent(line: string, indentStack: number[], customRules: any): number {
    const originalIndent = line.length - line.trimStart().length;
    
    // **Comments can be aligned with current context or standalone**
    if (customRules.alignComments === false) {
      return Math.floor(originalIndent / (customRules.indentSize || 2));
    }

    // **Align with current indent level**
    return indentStack[indentStack.length - 1] || 0;
  }

  /**
   * **Format list items**
   */
  private formatListItem(item: string, indentLevel: number, indentChar: string, customRules: any): string {
    const baseIndent = indentChar.repeat(indentLevel);
    
    if (item.includes(':')) {
      // **List item with key-value**
      const dashIndex = item.indexOf('-');
      const afterDash = item.substring(dashIndex + 1).trim();
      
      const spaceAfterDash = customRules.spaceAfterDash !== false ? ' ' : '';
      return baseIndent + '-' + spaceAfterDash + afterDash;
    } else {
      // **Simple list item**
      const content = item.substring(1).trim();
      const spaceAfterDash = customRules.spaceAfterDash !== false ? ' ' : '';
      return baseIndent + '-' + spaceAfterDash + content;
    }
  }

  /**
   * **Format key-value pairs**
   */
  private formatKeyValue(pair: string, indentLevel: number, indentChar: string, customRules: any): string {
    const baseIndent = indentChar.repeat(indentLevel);
    const colonIndex = pair.indexOf(':');
    
    const key = pair.substring(0, colonIndex).trim();
    const value = pair.substring(colonIndex + 1).trim();
    
    // **Format key (quote if necessary)**
    let formattedKey = key;
    if (customRules.quoteKeys === true && !key.startsWith('"') && !key.startsWith("'")) {
      if (key.includes(' ') || key.includes('-') || /^\d/.test(key)) {
        formattedKey = `"${key}"`;
      }
    }

    // **Format spacing around colon**
    const spaceAfterColon = customRules.spaceAfterColon !== false ? ' ' : '';
    
    if (value === '') {
      return baseIndent + formattedKey + ':';
    } else if (value === '|' || value === '>') {
      return baseIndent + formattedKey + ': ' + value;
    } else {
      return baseIndent + formattedKey + ':' + spaceAfterColon + value;
    }
  }

  /**
   * **Apply additional YAML formatting rules**
   */
  private applyYamlRules(text: string, customRules: any): string {
    let result = text;

    // **Normalize boolean values**
    if (customRules.normalizeBooleans !== false) {
      result = result.replace(/:\s*(yes|Yes|YES|on|On|ON)\s*$/gm, ': true');
      result = result.replace(/:\s*(no|No|NO|off|Off|OFF)\s*$/gm, ': false');
    }

    // **Normalize null values**
    if (customRules.normalizeNulls !== false) {
      result = result.replace(/:\s*(null|Null|NULL|~)\s*$/gm, ': null');
    }

    // **Remove trailing spaces**
    result = result.replace(/[ \t]+$/gm, '');

    // **Ensure document ends with newline**
    if (!result.endsWith('\n') && customRules.ensureFinalNewline !== false) {
      result += '\n';
    }

    // **Remove excessive blank lines**
    result = result.replace(/\n\s*\n\s*\n/g, '\n\n');

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
    return {
      alignComments: options.alignComments !== false,
      spaceAfterDash: options.spaceAfterDash !== false,
      spaceAfterColon: options.spaceAfterColon !== false,
      quoteKeys: options.quoteKeys === true,
      normalizeBooleans: options.normalizeBooleans !== false,
      normalizeNulls: options.normalizeNulls !== false,
      ensureFinalNewline: options.insertFinalNewline !== false,
      indentSize: options.indentSize || 2
    };
  }

  /**
   * **Enhanced preprocessing for YAML**
   */
  protected preprocess(text: string, options: FormatOptions): string {
    let processedText = super.preprocess(text, options);

    // **Normalize line endings**
    processedText = processedText.replace(/\r\n/g, '\n');

    // **Preserve document separators**
    processedText = processedText.replace(/^---\s*$/gm, '---');
    processedText = processedText.replace(/^\.\.\.\s*$/gm, '...');

    return processedText;
  }
}
