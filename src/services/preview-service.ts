import * as vscode from "vscode";
import { TextDiff, TextDiffItem, PreviewResult } from "../types/types";
import { LoggingService } from "../services/logging-service";
import { FormatService } from "../services/format-service";

export class PreviewService {
  private previewPanel: vscode.WebviewPanel | undefined;

  constructor(
    private readonly logger: LoggingService,
    private readonly formatService: FormatService
  ) {}

  /**
   * **Show preview of formatting changes**
   */
  async showPreview(document: vscode.TextDocument): Promise<void> {
    const preview = await this.formatService.previewFormat(document);

    if (!this.previewPanel) {
      this.createPreviewPanel();
    }

    if (this.previewPanel) {
      const html = this.generatePreviewHtml(preview, document);
      this.previewPanel.webview.html = html;
      this.previewPanel.reveal();
    }
  }

  /**
   * **Create preview panel**
   */
  private createPreviewPanel(): void {
    this.previewPanel = vscode.window.createWebviewPanel(
      "formatPreview",
      "Format Preview",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    this.previewPanel.onDidDispose(() => {
      this.previewPanel = undefined;
    });
  }

  /**
   * **Generate preview HTML**
   */
  private generatePreviewHtml(
    preview: PreviewResult,
    document: vscode.TextDocument
  ): string {
    const fileName = document.fileName.split(/[/\\]/).pop() || "Unknown";
    const changesSummary = this.generateChangesSummary(preview);
    const diffHtml = this.generateDiffHtml(preview.diff || []);

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Format Preview: ${fileName}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      margin: 0;
      padding: 20px;
      background-color: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--vscode-editorWidget-border);
    }
    .title {
      font-size: 18px;
      font-weight: 600;
    }
    .summary {
      font-size: 14px;
      color: var(--vscode-descriptionForeground);
    }
    .actions {
      margin: 20px 0;
      display: flex;
      gap: 10px;
    }
    button {
      padding: 8px 16px;
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 2px;
      cursor: pointer;
    }
    button:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
    .diff-container {
      font-family: 'Fira Code', 'Consolas', monospace;
      font-size: 14px;
      line-height: 1.5;
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 3px;
      overflow: auto;
      max-height: 70vh;
    }
    .diff-line {
      padding: 2px 10px;
      white-space: pre;
    }
    .diff-add {
      background-color: var(--vscode-diffEditor-insertedTextBackground);
    }
    .diff-remove {
      background-color: var(--vscode-diffEditor-removedTextBackground);
    }
    .diff-modify {
      background-color: var(--vscode-diffEditor-insertedTextBackground);
    }
    .diff-unchanged {
      background-color: var(--vscode-editor-background);
    }
    .line-number {
      display: inline-block;
      width: 40px;
      color: var(--vscode-editorLineNumber-foreground);
      text-align: right;
      margin-right: 10px;
      user-select: none;
      opacity: 0.7;
    }
    .no-changes {
      padding: 20px;
      text-align: center;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">Format Preview: ${fileName}</div>
    <div class="summary">${changesSummary}</div>
  </div>
  
  <div class="actions">
    <button id="applyBtn">Apply Formatting</button>
    <button id="closeBtn">Close Preview</button>
  </div>
  
  <div class="diff-container">
    ${diffHtml}
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('applyBtn').addEventListener('click', () => {
      vscode.postMessage({ command: 'applyFormat' });
    });
    document.getElementById('closeBtn').addEventListener('click', () => {
      vscode.postMessage({ command: 'closePreview' });
    });
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
        const sign = sizeDiff > 0 ? "+" : "";
        parts.push(`${sign}${sizeDiff} characters`);
      }
    }

    return parts.join(" • ");
  }

  /**
   * **Generate HTML for diff display**
   */
  private generateDiffHtml(diffs: TextDiffItem[]): string {
    if (diffs.length === 0) {
      return '<div class="no-changes">No changes to display</div>';
    }

    const html = diffs
      .map((diff) => {
        const lineNum =
          diff.lineNumber !== undefined
            ? `<span class="line-number">${diff.lineNumber}</span>`
            : "";

        switch (diff.type) {
          case "add":
            return `<div class="diff-line diff-add">${lineNum}+ ${this.escapeHtml(diff.newText || "")}</div>`;
          case "remove":
            return `<div class="diff-line diff-remove">${lineNum}- ${this.escapeHtml(diff.originalText || "")}</div>`;
          case "modify":
            return `<div class="diff-line diff-modify">${lineNum}~ ${this.escapeHtml(diff.newText || "")}</div>`;
          default:
            return `<div class="diff-line diff-unchanged">${lineNum}  ${this.escapeHtml(diff.newText || diff.originalText || "")}</div>`;
        }
      })
      .join("");

    return html;
  }

  /**
   * **Escape HTML entities**
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
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
