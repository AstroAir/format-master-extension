import * as vscode from "vscode";
import { FormatConfig, PerformanceMetrics, ILoggingService } from "../types";

/**
 * **Service for managing status bar integration and updates**
 */
export class StatusBarService {
  private statusBarItem: vscode.StatusBarItem;
  private config: FormatConfig | null = null;
  private metrics: PerformanceMetrics | null = null;

  constructor(private loggingService: ILoggingService) {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );

    this.statusBarItem.command = "formatMaster.showStatus";
    this.statusBarItem.tooltip = "Format Master Status - Click for details";

    this.updateStatusBar();
  }

  /**
   * **Update status bar with current configuration and metrics**
   */
  updateStatusBar(config?: FormatConfig, metrics?: PerformanceMetrics): void {
    if (config) {
      this.config = config;
    }
    if (metrics) {
      this.metrics = metrics;
    }

    if (this.config?.statusBarIntegration) {
      this.showStatusBar();
    } else {
      this.hideStatusBar();
    }
  }

  /**
   * **Show status bar with current information**
   */
  private showStatusBar(): void {
    const parts: string[] = [];

    // **Base icon and name**
    parts.push("$(symbol-misc) Format Master");

    // **Add operation count if available**
    if (this.metrics && this.metrics.totalFormatOperations > 0) {
      parts.push(`(${this.metrics.totalFormatOperations})`);
    }

    // **Add active profile if available**
    if (this.config?.activeProfile && this.config.activeProfile !== "default") {
      parts.push(`[${this.config.activeProfile}]`);
    }

    // **Add format on save indicator**
    if (this.config?.formatOnSave) {
      parts.push("$(check)");
    }

    this.statusBarItem.text = parts.join(" ");
    this.statusBarItem.show();

    this.loggingService.debug("Status bar updated");
  }

  /**
   * **Hide status bar**
   */
  private hideStatusBar(): void {
    this.statusBarItem.hide();
    this.loggingService.debug("Status bar hidden");
  }

  /**
   * **Show status with animation for operations**
   */
  showOperationStatus(operation: string, duration?: number): void {
    const originalText = this.statusBarItem.text;
    this.statusBarItem.text = `$(sync~spin) ${operation}...`;

    if (duration) {
      setTimeout(() => {
        this.statusBarItem.text = originalText;
      }, duration);
    }
  }

  /**
   * **Show error status temporarily**
   */
  showErrorStatus(error: string, duration = 3000): void {
    const originalText = this.statusBarItem.text;
    const originalTooltip = this.statusBarItem.tooltip;

    this.statusBarItem.text = "$(error) Format Master - Error";
    this.statusBarItem.tooltip = `Error: ${error}`;

    setTimeout(() => {
      this.statusBarItem.text = originalText;
      this.statusBarItem.tooltip = originalTooltip;
    }, duration);
  }

  /**
   * **Show success status temporarily**
   */
  showSuccessStatus(message: string, duration = 2000): void {
    const originalText = this.statusBarItem.text;

    this.statusBarItem.text = "$(check) Format Master - Success";

    setTimeout(() => {
      this.statusBarItem.text = originalText;
    }, duration);
  }

  /**
   * **Update tooltip with detailed information**
   */
  updateTooltip(): void {
    const tooltipParts: string[] = ["Format Master Extension"];

    if (this.config) {
      tooltipParts.push(`Profile: ${this.config.activeProfile || "Default"}`);
      tooltipParts.push(`Languages: ${this.config.enabledLanguages.length}`);
      tooltipParts.push(
        `Format on Save: ${this.config.formatOnSave ? "Enabled" : "Disabled"}`
      );
    }

    if (this.metrics) {
      tooltipParts.push(`Operations: ${this.metrics.totalFormatOperations}`);
      if (this.metrics.totalFormatOperations > 0) {
        tooltipParts.push(
          `Success Rate: ${this.metrics.successRate.toFixed(1)}%`
        );
        tooltipParts.push(
          `Avg Time: ${this.metrics.averageFormatTime.toFixed(1)}ms`
        );
      }
    }

    tooltipParts.push("Click for more details");

    this.statusBarItem.tooltip = tooltipParts.join("\n");
  }

  /**
   * **Dispose of status bar resources**
   */
  dispose(): void {
    this.statusBarItem.dispose();
  }
}
