import * as vscode from "vscode";
import { ILoggingService, PerformanceMetrics, LanguageMetrics } from "../types";

/**
 * **Performance monitoring service interface**
 */
export interface IPerformanceMonitoringService {
  recordFormatOperation(
    languageId: string,
    executionTime: number,
    success: boolean,
    cacheHit?: boolean,
    fileSizeKB?: number
  ): void;
  recordMemoryUsage(): void;
  getMetrics(): PerformanceMetrics;
  getLanguageMetrics(languageId: string): LanguageMetrics | undefined;
  getTopPerformingLanguages(
    limit?: number
  ): Array<{ language: string; metrics: LanguageMetrics }>;
  getSlowestPerformingLanguages(
    limit?: number
  ): Array<{ language: string; metrics: LanguageMetrics }>;
  resetMetrics(): void;
  clearMetrics(): void;
  setMemoryUsage(usage: number): void;
  exportMetrics(filePath: string): Promise<void>;
  generateReport(): string;
  isEnabled(): boolean;
  setEnabled(enabled: boolean): Promise<void>;
}

/**
 * **Performance monitoring service interface**
 */
export interface IPerformanceMonitoringService {
  recordFormatOperation(
    languageId: string,
    executionTime: number,
    success: boolean,
    cacheHit?: boolean,
    fileSizeKB?: number
  ): void;
  recordMemoryUsage(): void;
  getMetrics(): PerformanceMetrics;
  getLanguageMetrics(languageId: string): LanguageMetrics | undefined;
  getTopPerformingLanguages(
    limit?: number
  ): Array<{ language: string; metrics: LanguageMetrics }>;
  getSlowestPerformingLanguages(
    limit?: number
  ): Array<{ language: string; metrics: LanguageMetrics }>;
  resetMetrics(): void;
  clearMetrics(): void;
  setMemoryUsage(usage: number): void;
  exportMetrics(filePath: string): Promise<void>;
  generateReport(): string;
  isEnabled(): boolean;
  setEnabled(enabled: boolean): Promise<void>;
}

/**
 * **Service for monitoring and tracking formatting performance metrics**
 */
export class PerformanceMonitoringService
  implements IPerformanceMonitoringService
{
  private metrics: PerformanceMetrics = {
    totalFormatOperations: 0,
    averageFormatTime: 0,
    lastFormatTime: 0,
    successRate: 100,
    errorCount: 0,
    cacheHitRate: 0,
    memoryUsage: 0,
    languageBreakdown: {},
  };
  private sessionStart: Date;
  private enabled: boolean = false;

  constructor(private loggingService: ILoggingService) {
    this.sessionStart = new Date();
    this.resetMetrics();

    // **Listen for configuration changes**
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("formatMaster.performanceMonitoring")) {
        const config = vscode.workspace.getConfiguration("formatMaster");
        this.enabled = config.get<boolean>("performanceMonitoring", false);

        if (this.enabled) {
          this.loggingService.info("Performance monitoring enabled");
        }
      }
    });

    // **Initialize from configuration**
    const config = vscode.workspace.getConfiguration("formatMaster");
    this.enabled = config.get<boolean>("performanceMonitoring", false);
  }

  /**
   * **Record a formatting operation**
   */
  recordFormatOperation(
    languageId: string,
    executionTime: number,
    success: boolean,
    cacheHit: boolean = false,
    fileSizeKB?: number
  ): void {
    if (!this.enabled) {
      return;
    }

    // **Update overall metrics**
    this.metrics.totalFormatOperations++;

    if (success) {
      this.updateAverageFormatTime(executionTime);
      this.metrics.lastFormatTime = executionTime;
    } else {
      this.metrics.errorCount++;
    }

    if (cacheHit) {
      this.updateCacheHitRate();
    }

    // **Update language-specific metrics**
    this.updateLanguageMetrics(languageId, executionTime, success);

    // **Update success rate**
    this.updateSuccessRate();

    // **Log performance data if execution time is notable**
    if (executionTime > 1000) {
      // **Over 1 second**
      this.loggingService.warn(
        `Slow formatting operation: ${languageId} took ${executionTime}ms` +
          (fileSizeKB ? ` (file size: ${fileSizeKB}KB)` : "")
      );
    }

    // **Log metrics periodically**
    if (this.metrics.totalFormatOperations % 50 === 0) {
      this.logPerformanceSummary();
    }
  }

  /**
   * **Record memory usage**
   */
  recordMemoryUsage(): void {
    if (!this.enabled) {
      return;
    }

    try {
      // **Get memory usage if available**
      const memUsage = process.memoryUsage();
      this.metrics.memoryUsage =
        Math.round((memUsage.heapUsed / 1024 / 1024) * 100) / 100; // **MB**
    } catch (error) {
      // **Memory usage not available in this environment**
    }
  }

  /**
   * **Get current performance metrics**
   */
  getMetrics(): PerformanceMetrics {
    this.recordMemoryUsage();
    return { ...this.metrics };
  }

  /**
   * **Get metrics for a specific language**
   */
  getLanguageMetrics(languageId: string): LanguageMetrics | undefined {
    return this.metrics.languageBreakdown[languageId];
  }

  /**
   * **Get top performing languages**
   */
  getTopPerformingLanguages(
    limit: number = 5
  ): Array<{ language: string; metrics: LanguageMetrics }> {
    const entries = Object.entries(this.metrics.languageBreakdown)
      .map(([language, metrics]) => ({ language, metrics }))
      .sort((a, b) => a.metrics.averageTime - b.metrics.averageTime)
      .slice(0, limit);

    return entries;
  }

  /**
   * **Get slowest performing languages**
   */
  getSlowestPerformingLanguages(
    limit: number = 5
  ): Array<{ language: string; metrics: LanguageMetrics }> {
    const entries = Object.entries(this.metrics.languageBreakdown)
      .map(([language, metrics]) => ({ language, metrics }))
      .sort((a, b) => b.metrics.averageTime - a.metrics.averageTime)
      .slice(0, limit);

    return entries;
  }

  /**
   * **Reset all metrics**
   */
  resetMetrics(): void {
    this.metrics = {
      totalFormatOperations: 0,
      averageFormatTime: 0,
      lastFormatTime: 0,
      successRate: 100,
      errorCount: 0,
      cacheHitRate: 0,
      memoryUsage: 0,
      languageBreakdown: {},
    };
    this.sessionStart = new Date();

    if (this.enabled) {
      this.loggingService.info("Performance metrics reset");
    }
  }

  /**
   * **Clear all performance metrics**
   */
  clearMetrics(): void {
    this.resetMetrics();
    this.loggingService.info("Performance metrics cleared");
  }

  /**
   * **Set current memory usage**
   */
  setMemoryUsage(usage: number): void {
    this.metrics.memoryUsage = usage;
  }

  /**
   * **Export metrics to file**
   */
  async exportMetrics(filePath: string): Promise<void> {
    const exportData = {
      formatMasterMetrics: {
        version: "1.0.0",
        exported: new Date().toISOString(),
        sessionStart: this.sessionStart.toISOString(),
        sessionDuration: Date.now() - this.sessionStart.getTime(),
        metrics: this.getMetrics(),
      },
    };

    try {
      const fs = await import("fs");
      await fs.promises.writeFile(
        filePath,
        JSON.stringify(exportData, null, 2)
      );
      this.loggingService.info(`Performance metrics exported to: ${filePath}`);
    } catch (error) {
      this.loggingService.error("Failed to export performance metrics", error);
      throw error;
    }
  }

  /**
   * **Generate performance report**
   */
  generateReport(): string {
    const metrics = this.getMetrics();
    const sessionDuration = Math.round(
      (Date.now() - this.sessionStart.getTime()) / 1000 / 60
    ); // **Minutes**

    const report = [
      "# Format Master Performance Report",
      "",
      `**Session Duration:** ${sessionDuration} minutes`,
      `**Total Operations:** ${metrics.totalFormatOperations}`,
      `**Success Rate:** ${metrics.successRate.toFixed(1)}%`,
      `**Average Format Time:** ${metrics.averageFormatTime.toFixed(1)}ms`,
      `**Cache Hit Rate:** ${metrics.cacheHitRate.toFixed(1)}%`,
      `**Memory Usage:** ${metrics.memoryUsage.toFixed(1)} MB`,
      "",
      "## Language Breakdown",
      "",
    ];

    // **Add language-specific metrics**
    const languageEntries = Object.entries(metrics.languageBreakdown).sort(
      (a, b) => b[1].operationCount - a[1].operationCount
    );

    if (languageEntries.length === 0) {
      report.push("No language-specific data available.");
    } else {
      report.push(
        "| Language | Operations | Avg Time (ms) | Error Count | Last Used |"
      );
      report.push(
        "|----------|------------|---------------|-------------|-----------|"
      );

      for (const [language, langMetrics] of languageEntries) {
        const lastUsed = langMetrics.lastUsed.toLocaleDateString();
        report.push(
          `| ${language} | ${langMetrics.operationCount} | ${langMetrics.averageTime.toFixed(1)} | ${langMetrics.errorCount} | ${lastUsed} |`
        );
      }
    }

    report.push("");
    report.push("## Performance Insights");
    report.push("");

    // **Add insights**
    if (metrics.averageFormatTime > 500) {
      report.push(
        "⚠️ **Warning:** Average formatting time is high. Consider enabling incremental formatting for large files."
      );
    }

    if (metrics.errorCount > metrics.totalFormatOperations * 0.1) {
      report.push(
        "⚠️ **Warning:** High error rate detected. Check formatter configurations and file syntax."
      );
    }

    if (metrics.cacheHitRate < 20 && metrics.totalFormatOperations > 20) {
      report.push(
        "💡 **Tip:** Low cache hit rate. Consider formatting similar files to improve performance."
      );
    }

    if (metrics.memoryUsage > 100) {
      report.push(
        "⚠️ **Warning:** High memory usage detected. Consider restarting VS Code if performance degrades."
      );
    }

    // **Add top and bottom performers**
    const topPerformers = this.getTopPerformingLanguages(3);
    const slowestPerformers = this.getSlowestPerformingLanguages(3);

    if (topPerformers.length > 0) {
      report.push("");
      report.push("### Fastest Languages");
      for (const { language, metrics } of topPerformers) {
        report.push(
          `- **${language}:** ${metrics.averageTime.toFixed(1)}ms average`
        );
      }
    }

    if (slowestPerformers.length > 0) {
      report.push("");
      report.push("### Slowest Languages");
      for (const { language, metrics } of slowestPerformers) {
        report.push(
          `- **${language}:** ${metrics.averageTime.toFixed(1)}ms average`
        );
      }
    }

    return report.join("\n");
  }

  /**
   * **Check if monitoring is enabled**
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * **Enable or disable monitoring**
   */
  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled;

    const config = vscode.workspace.getConfiguration("formatMaster");
    await config.update(
      "performanceMonitoring",
      enabled,
      vscode.ConfigurationTarget.Workspace
    );

    if (enabled) {
      this.loggingService.info("Performance monitoring enabled");
    } else {
      this.loggingService.info("Performance monitoring disabled");
    }
  }

  // **Private helper methods**

  private updateAverageFormatTime(newTime: number): void {
    const successfulOps =
      this.metrics.totalFormatOperations - this.metrics.errorCount;
    const currentTotal = this.metrics.averageFormatTime * (successfulOps - 1);
    this.metrics.averageFormatTime = (currentTotal + newTime) / successfulOps;
  }

  private updateSuccessRate(): void {
    if (this.metrics.totalFormatOperations > 0) {
      const successfulOps =
        this.metrics.totalFormatOperations - this.metrics.errorCount;
      this.metrics.successRate =
        (successfulOps / this.metrics.totalFormatOperations) * 100;
    }
  }

  private updateCacheHitRate(): void {
    // **Simple cache hit tracking - in a real implementation this would be more sophisticated**
    const currentHits = Math.round(
      (this.metrics.cacheHitRate * this.metrics.totalFormatOperations) / 100
    );
    const newHits = currentHits + 1;
    this.metrics.cacheHitRate =
      (newHits / this.metrics.totalFormatOperations) * 100;
  }

  private updateLanguageMetrics(
    languageId: string,
    executionTime: number,
    success: boolean
  ): void {
    if (!this.metrics.languageBreakdown[languageId]) {
      this.metrics.languageBreakdown[languageId] = {
        operationCount: 0,
        averageTime: 0,
        errorCount: 0,
        lastUsed: new Date(),
      };
    }

    const langMetrics = this.metrics.languageBreakdown[languageId];
    langMetrics.operationCount++;
    langMetrics.lastUsed = new Date();

    if (success) {
      const currentTotal =
        langMetrics.averageTime * (langMetrics.operationCount - 1);
      langMetrics.averageTime =
        (currentTotal + executionTime) / langMetrics.operationCount;
    } else {
      langMetrics.errorCount++;
    }
  }

  private logPerformanceSummary(): void {
    const metrics = this.getMetrics();
    this.loggingService.info(
      `Performance Summary: ${metrics.totalFormatOperations} operations, ` +
        `${metrics.averageFormatTime.toFixed(1)}ms avg, ` +
        `${metrics.successRate.toFixed(1)}% success rate`
    );
  }
}
