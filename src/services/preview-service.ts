import * as vscode from "vscode";
import { PreviewResult, TextDiff, FormatOptions, ILoggingService } from "../types";

/**
 * **Service for providing formatting previews and diffs**
 */
export class PreviewService {
  private previewPanel: vscode.WebviewPanel | undefined;
  private currentPreview: PreviewResult | undefined;

  constructor(
    private context: vscode.ExtensionContext,
    private loggingService: ILoggingService
  ) {}

  /**
   * **Generate a preview of formatting changes**
   */
  async generatePreview(
    document: vscode.TextDocument,
    formattedText: string,
    originalRange?: vscode.Range
  ): Promise<PreviewResult> {
    try {
      const originalText = originalRange ? 
        document.getText(originalRange) : 
        document.getText();

      const diff = this.generateDiff(originalText, formattedText);
      const changes = diff.length;
      const linesChanged = diff.filter(d => d.type === 'add' || d.type === 'remove' || d.type === 'modify').length;

      const result: PreviewResult = {
        success: true,
        text: formattedText,
        diff,
        previewText: this.generatePreviewText(originalText, formattedText, diff),
        canApply: changes > 0,
        changes,
        linesChanged,
        originalLength: originalText.length,
        newLength: formattedText.length,
        formatterUsed: 'preview'
      };

      this.currentPreview = result;
      return result;

    } catch (error) {
      this.loggingService.error("Failed to generate preview", error);
      
      return {
        success: false,
        error: error instanceof Error ? error : new Error('Unknown preview error'),
        diff: [],
        previewText: '',
        canApply: false,
        formatterUsed: 'preview'
      };
    }
  }

  /**
   * **Show preview in a webview panel**
   */
  async showPreviewPanel(preview: PreviewResult, document: vscode.TextDocument): Promise<void> {
    if (this.previewPanel) {
      this.previewPanel.dispose();
    }

    this.previewPanel = vscode.window.createWebviewPanel(
      'formatMasterPreview',
      'Format Master - Preview',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.context.extensionUri]
      }
    );

    // **Set up webview content**
    this.previewPanel.webview.html = this.generateWebviewContent(preview, document);

    // **Handle messages from webview**
    this.previewPanel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'apply':
            await this.applyPreview(document, preview);
            this.previewPanel?.dispose();
            break;
          case 'cancel':
            this.previewPanel?.dispose();
            break;
          case 'refresh':
            // **Regenerate preview - would need current formatter service**
            break;
        }
      },
      undefined,
      this.context.subscriptions
    );

    // **Clean up when panel is disposed**
    this.previewPanel.onDidDispose(() => {
      this.previewPanel = undefined;
      this.currentPreview = undefined;
    });
  }

  /**
   * **Apply the current preview to the document**
   */
  async applyPreview(document: vscode.TextDocument, preview: PreviewResult): Promise<boolean> {
    if (!preview.canApply || !preview.text) {
      return false;
    }

    try {
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length)
      );
      
      edit.replace(document.uri, fullRange, preview.text);
      
      const success = await vscode.workspace.applyEdit(edit);
      
      if (success) {
        this.loggingService.info(`Applied formatting preview: ${preview.changes} changes`);
        vscode.window.showInformationMessage(
          `Applied formatting: ${preview.changes} changes`
        );
      }
      
      return success;

    } catch (error) {
      this.loggingService.error("Failed to apply preview", error);
      vscode.window.showErrorMessage("Failed to apply formatting preview");
      return false;
    }
  }

  /**
   * **Preview format implementation (IPreviewService interface)**
   */
  async previewFormat(document: vscode.TextDocument, options?: FormatOptions): Promise<PreviewResult> {
    // **This would normally call the formatter service**
    // **For now, return a placeholder implementation**
    return {
      success: false,
      error: new Error("Not implemented - requires format service integration"),
      diff: [],
      previewText: '',
      canApply: false,
      formatterUsed: 'none'
    };
  }

  /**
   * **Show preview implementation (IPreviewService interface)**
   */
  async showPreview(previewResult: PreviewResult): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.previewPanel) {
        this.previewPanel.dispose();
      }

      this.previewPanel = vscode.window.createWebviewPanel(
        'formatMasterPreview',
        'Format Master - Preview',
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [this.context.extensionUri]
        }
      );

      this.previewPanel.webview.html = this.generateSimplePreviewHTML(previewResult);

      this.previewPanel.webview.onDidReceiveMessage(
        (message) => {
          switch (message.command) {
            case 'apply':
              resolve(true);
              this.previewPanel?.dispose();
              break;
            case 'cancel':
              resolve(false);
              this.previewPanel?.dispose();
              break;
          }
        }
      );

      this.previewPanel.onDidDispose(() => {
        resolve(false);
      });
    });
  }

  /**
   * **Dispose preview implementation (IPreviewService interface)**
   */
  disposePreview(): void {
    if (this.previewPanel) {
      this.previewPanel.dispose();
      this.previewPanel = undefined;
    }
    this.currentPreview = undefined;
  }
  /**
   * **Generate diff between original and formatted text**
   */
  generateDiff(original: string, formatted: string): TextDiff[] {
    const originalLines = original.split('\n');
    const formattedLines = formatted.split('\n');
    const diffs: TextDiff[] = [];

    // **Simple line-by-line diff - in production use a proper diff algorithm**
    const maxLines = Math.max(originalLines.length, formattedLines.length);
    
    for (let i = 0; i < maxLines; i++) {
      const originalLine = originalLines[i];
      const formattedLine = formattedLines[i];
      
      if (originalLine === undefined) {
        // **Line added**
        diffs.push({
          type: 'add',
          lineNumber: i + 1,
          newText: formattedLine,
          range: new vscode.Range(i, 0, i, 0)
        });
      } else if (formattedLine === undefined) {
        // **Line removed**
        diffs.push({
          type: 'remove',
          lineNumber: i + 1,
          originalText: originalLine,
          range: new vscode.Range(i, 0, i + 1, 0)
        });
      } else if (originalLine !== formattedLine) {
        // **Line modified**
        diffs.push({
          type: 'modify',
          lineNumber: i + 1,
          originalText: originalLine,
          newText: formattedLine,
          range: new vscode.Range(i, 0, i, originalLine.length)
        });
      }
    }

    return diffs;
  }

  /**
   * **Generate preview text with highlighting**
   */
  private generatePreviewText(original: string, formatted: string, diff: TextDiff[]): string {
    const lines = formatted.split('\n');
    const previewLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const diffEntry = diff.find(d => d.lineNumber === i + 1);
      
      if (diffEntry) {
        switch (diffEntry.type) {
          case 'add':
            previewLines.push(`+ ${line}`);
            break;
          case 'remove':
            previewLines.push(`- ${diffEntry.originalText || ''}`);
            break;
          case 'modify':
            previewLines.push(`~ ${line}`);
            break;
          default:
            previewLines.push(`  ${line}`);
        }
      } else {
        previewLines.push(`  ${line}`);
      }
    }

    return previewLines.join('\n');
  }

  /**
   * **Generate HTML content for the webview**
   */
  private generateWebviewContent(preview: PreviewResult, document: vscode.TextDocument): string {
    const fileName = document.fileName.split(/[/\\]/).pop() || 'Unknown';
    const changesSummary = this.generateChangesSummary(preview);
    const diffHtml = this.generateDiffHtml(preview.diff || []);

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Format Master Preview</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 20px;
        }

        .header {
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 15px;
            margin-bottom: 20px;
        }

        .file-name {
            font-size: 1.2em;
            font-weight: bold;
            margin-bottom: 10px;
        }

        .summary {
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            padding: 10px 15px;
            margin-bottom: 20px;
        }

        .diff-container {
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 3px;
            overflow-x: auto;
            margin-bottom: 20px;
        }

        .diff-line {
            padding: 2px 8px;
            white-space: pre;
            line-height: 1.4;
        }

        .diff-add {
            background-color: var(--vscode-diffEditor-insertedTextBackground);
            color: var(--vscode-diffEditor-insertedTextForeground);
        }

        .diff-remove {
            background-color: var(--vscode-diffEditor-removedTextBackground);
            color: var(--vscode-diffEditor-removedTextForeground);
        }

        .diff-modify {
            background-color: var(--vscode-diffEditor-modifiedTextBackground);
            color: var(--vscode-diffEditor-modifiedTextForeground);
        }

        .diff-unchanged {
            color: var(--vscode-editor-foreground);
        }

        .line-number {
            color: var(--vscode-editorLineNumber-foreground);
            margin-right: 10px;
            user-select: none;
        }

        .actions {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
            padding-top: 15px;
            border-top: 1px solid var(--vscode-panel-border);
        }

        .button {
            padding: 8px 16px;
            border: 1px solid var(--vscode-button-border);
            border-radius: 3px;
            cursor: pointer;
            font-family: inherit;
            font-size: inherit;
        }

        .button-primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .button-primary:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .button-secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .button-secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .no-changes {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            margin: 40px 0;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="file-name">${fileName}</div>
        <div class="summary">
            ${changesSummary}
        </div>
    </div>

    ${preview.canApply ? `
        <div class="diff-container">
            ${diffHtml}
        </div>
    ` : `
        <div class="no-changes">
            <h3>No formatting changes needed</h3>
            <p>The file is already properly formatted.</p>
        </div>
    `}

    <div class="actions">
        <button class="button button-secondary" onclick="cancel()">Cancel</button>
        ${preview.canApply ? '<button class="button button-primary" onclick="apply()">Apply Changes</button>' : ''}
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function apply() {
            vscode.postMessage({ command: 'apply' });
        }

        function cancel() {
            vscode.postMessage({ command: 'cancel' });
        }

        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }
    </script>
</body>
</html>`;
  }

  /**
   * **Generate simple preview HTML**
   */
  private generateSimplePreviewHTML(preview: PreviewResult): string {
    const diffHtml = preview.diff?.map(diff => {
      const color = diff.type === 'add' ? '#28a745' : diff.type === 'remove' ? '#dc3545' : '#ffc107';
      const prefix = diff.type === 'add' ? '+' : diff.type === 'remove' ? '-' : '~';
      return `<div style="color: ${color}; font-family: monospace; white-space: pre-wrap;">${prefix} ${diff.newText || diff.originalText || ''}</div>`;
    }).join('') || '<div>No changes to preview</div>';

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Format Master Preview</title>
          <style>
              body { 
                font-family: var(--vscode-font-family); 
                padding: 20px; 
                background: var(--vscode-editor-background);
                color: var(--vscode-editor-foreground);
              }
              .preview-container { 
                border: 1px solid var(--vscode-panel-border); 
                border-radius: 5px; 
                padding: 15px; 
                margin: 10px 0; 
              }
              .button-container { margin: 20px 0; }
              .button { 
                background: var(--vscode-button-background); 
                color: var(--vscode-button-foreground);
                border: none; 
                padding: 10px 20px; 
                margin: 5px; 
                border-radius: 3px; 
                cursor: pointer; 
              }
              .button:hover { background: var(--vscode-button-hoverBackground); }
              .apply-button { background: var(--vscode-button-background); }
              .cancel-button { background: var(--vscode-button-secondaryBackground); }
          </style>
      </head>
      <body>
          <h1>Format Master Preview</h1>
          <div class="preview-container">
              <h3>Changes Preview:</h3>
              ${diffHtml}
          </div>
          <div class="button-container">
              <button class="button apply-button" onclick="apply()" ${!preview.canApply ? 'disabled' : ''}>
                  Apply Changes
              </button>
              <button class="button cancel-button" onclick="cancel()">
                  Cancel
              </button>
          </div>
          <script>
              const vscode = acquireVsCodeApi();
              
              function apply() {
                  vscode.postMessage({ command: 'apply' });
              }
              
              function cancel() {
                  vscode.postMessage({ command: 'cancel' });
              }
          </script>
      </body>
      </html>
    `;
  }

  /**
   * **Generate changes summary text**
   */
  private generateChangesSummary(preview: PreviewResult): string {
    if (!preview.canApply) {
      return "No changes needed - file is already properly formatted.";
    }

    const parts: string[] = [];
    
    if (preview.changes) {
      parts.push(`${preview.changes} total changes`);
    }
    
    if (preview.linesChanged) {
      parts.push(`${preview.linesChanged} lines affected`);
    }
    
    if (preview.originalLength && preview.newLength) {
      const sizeDiff = preview.newLength - preview.originalLength;
      if (sizeDiff !== 0) {
        const sign = sizeDiff > 0 ? '+' : '';
        parts.push(`${sign}${sizeDiff} characters`);
      }
    }

    return parts.join(' • ');
  }

  /**
   * **Generate HTML for diff display**
   */
  private generateDiffHtml(diffs: TextDiff[]): string {
    if (diffs.length === 0) {
      return '<div class="no-changes">No changes to display</div>';
    }

    const html = diffs.map(diff => {
      const lineNum = `<span class="line-number">${diff.lineNumber}</span>`;
      
      switch (diff.type) {
        case 'add':
          return `<div class="diff-line diff-add">${lineNum}+ ${this.escapeHtml(diff.newText || '')}</div>`;
        case 'remove':
          return `<div class="diff-line diff-remove">${lineNum}- ${this.escapeHtml(diff.originalText || '')}</div>`;
        case 'modify':
          return `<div class="diff-line diff-modify">${lineNum}~ ${this.escapeHtml(diff.newText || '')}</div>`;
        default:
          return `<div class="diff-line diff-unchanged">${lineNum}  ${this.escapeHtml(diff.newText || diff.originalText || '')}</div>`;
      }
    }).join('');

    return html;
  }

  /**
   * **Escape HTML entities**
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * **Dispose of resources**
   */
  dispose(): void {
    if (this.previewPanel) {
      this.previewPanel.dispose();
    }
  }
}
