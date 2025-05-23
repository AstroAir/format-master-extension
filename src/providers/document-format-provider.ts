import * as vscode from "vscode";
import { IFormatService } from "../types";

/**
 * **VSCode document formatting provider**
 */
export class DocumentFormatProvider
  implements
    vscode.DocumentFormattingEditProvider,
    vscode.DocumentRangeFormattingEditProvider
{
  constructor(private formatService: IFormatService) {}

  /**
   * **Provide formatting edits for the entire document**
   */
  async provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    options: vscode.FormattingOptions,
    token: vscode.CancellationToken
  ): Promise<vscode.TextEdit[]> {
    if (token.isCancellationRequested) {
      return [];
    }

    try {
      const formatOptions = {
        languageId: document.languageId,
        tabSize: options.tabSize,
        insertSpaces: options.insertSpaces,
        indentSize: options.insertSpaces ? options.tabSize : 1,
        useTabs: !options.insertSpaces,
      };

      return await this.formatService.formatDocument(document, formatOptions);
    } catch (error) {
      // **Let the format service handle the error logging**
      throw error;
    }
  }

  /**
   * **Provide formatting edits for a range of the document**
   */
  async provideDocumentRangeFormattingEdits(
    document: vscode.TextDocument,
    range: vscode.Range,
    options: vscode.FormattingOptions,
    token: vscode.CancellationToken
  ): Promise<vscode.TextEdit[]> {
    if (token.isCancellationRequested) {
      return [];
    }

    try {
      const formatOptions = {
        languageId: document.languageId,
        tabSize: options.tabSize,
        insertSpaces: options.insertSpaces,
        indentSize: options.insertSpaces ? options.tabSize : 1,
        useTabs: !options.insertSpaces,
      };

      return await this.formatService.formatRange(
        document,
        range,
        formatOptions
      );
    } catch (error) {
      // **Let the format service handle the error logging**
      throw error;
    }
  }
}
