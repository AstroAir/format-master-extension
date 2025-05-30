import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  BatchJobStatus,
  BatchFormattingResult,
  FormatOptions,
  FormatResult,
  ProgressInfo,
} from "../types";

// Define missing types locally
interface BatchFormattingJob {
  id: string;
  files: string[];
  status: BatchJobStatus;
  progress: number;
  startTime: Date;
  endTime?: Date;
  totalFiles: number;
  processedFiles: number;
  successfulFiles: number;
  failedFiles: number;
  errors: string[];
  results: BatchFormattingResult[];
}

interface BatchFormatOptions extends FormatOptions {
  maxConcurrency?: number;
  stopOnError?: boolean;
  progressCallback?: (progress: ProgressInfo) => void;
}

interface WorkspaceFormatOptions extends BatchFormatOptions {
  includeHiddenFiles?: boolean;
  excludePatterns?: string[];
  includePatterns?: string[];
}

/**
 * **Enhanced batch formatting service for workspace-wide operations**
 */
export class BatchFormattingService {
  private activeJobs: Map<string, BatchFormattingJob> = new Map();
  private jobCounter = 0;

  constructor(
    private formatService: any,
    private loggingService: any,
    private configService: any
  ) {}

  /**
   * **Format multiple files**
   */
  async formatFiles(
    files: string[],
    options?: BatchFormatOptions
  ): Promise<BatchFormattingJob> {
    const jobId = this.generateJobId();
    const job = this.createJob(jobId, files);

    this.activeJobs.set(jobId, job);

    // Start formatting in background
    this.processJob(job, options).catch((error) => {
      this.loggingService?.error("Batch formatting job failed:", error);
      job.status = BatchJobStatus.FAILED;
      job.errors.push(error.message);
      job.endTime = new Date();
    });

    return job;
  }

  /**
   * **Format entire workspace**
   */
  async formatWorkspace(
    options?: WorkspaceFormatOptions
  ): Promise<BatchFormattingJob> {
    const files = await this.getWorkspaceFiles(options);
    return this.formatFiles(files, options);
  }

  /**
   * **Get job status**
   */
  getJob(jobId: string): BatchFormattingJob | undefined {
    return this.activeJobs.get(jobId);
  }

  /**
   * **Get all active jobs**
   */
  getActiveJobs(): BatchFormattingJob[] {
    return Array.from(this.activeJobs.values());
  }

  /**
   * **Cancel a job**
   */
  cancelJob(jobId: string): void {
    const job = this.activeJobs.get(jobId);
    if (job && job.status === BatchJobStatus.RUNNING) {
      job.status = BatchJobStatus.CANCELLED;
      job.endTime = new Date();
    }
  }

  /**
   * **Pause a job**
   */
  pauseJob(jobId: string): void {
    const job = this.activeJobs.get(jobId);
    if (job && job.status === BatchJobStatus.RUNNING) {
      job.status = BatchJobStatus.PAUSED;
    }
  }

  /**
   * **Resume a paused job**
   */
  resumeJob(jobId: string): void {
    const job = this.activeJobs.get(jobId);
    if (job && job.status === BatchJobStatus.PAUSED) {
      job.status = BatchJobStatus.RUNNING;
      this.processJob(job).catch((error) => {
        this.loggingService?.error("Failed to resume job:", error);
        job.status = BatchJobStatus.FAILED;
        job.errors.push(error.message);
        job.endTime = new Date();
      });
    }
  }

  /**
   * **Clean up completed jobs**
   */
  cleanupCompletedJobs(): void {
    const completedStatuses = [
      BatchJobStatus.COMPLETED,
      BatchJobStatus.FAILED,
      BatchJobStatus.CANCELLED,
    ];

    for (const [jobId, job] of this.activeJobs.entries()) {
      if (completedStatuses.includes(job.status)) {
        this.activeJobs.delete(jobId);
      }
    }
  }

  /**
   * **Generate unique job ID**
   */
  private generateJobId(): string {
    return `batch-format-${Date.now()}-${++this.jobCounter}`;
  }

  /**
   * **Create a new formatting job**
   */
  private createJob(jobId: string, files: string[]): BatchFormattingJob {
    return {
      id: jobId,
      files: files.slice(), // Copy array
      status: BatchJobStatus.PENDING,
      progress: 0,
      startTime: new Date(),
      totalFiles: files.length,
      processedFiles: 0,
      successfulFiles: 0,
      failedFiles: 0,
      errors: [],
      results: [],
    };
  }

  /**
   * **Process a formatting job**
   */
  private async processJob(
    job: BatchFormattingJob,
    options?: BatchFormatOptions
  ): Promise<void> {
    job.status = BatchJobStatus.RUNNING;

    const batchOptions: BatchFormatOptions = {
      insertSpaces: options?.insertSpaces ?? true,
      tabSize: options?.tabSize ?? 2,
      languageId: options?.languageId ?? "",
      fileName: options?.fileName ?? "",
      maxConcurrency: 5,
      stopOnError: false,
      ...options,
    };

    const semaphore = new Semaphore(batchOptions.maxConcurrency || 5);
    const promises: Promise<void>[] = [];

    for (let i = 0; i < job.files.length; i++) {
      const file = job.files[i];

      const promise = semaphore.acquire().then(async (release) => {
        try {
          // Check if job is still running
          if (job.status !== BatchJobStatus.RUNNING) {
            return;
          }

          const result = await this.formatSingleFile(file, options);

          job.results.push(result);
          job.processedFiles++;

          if (result.success) {
            job.successfulFiles++;
          } else {
            job.failedFiles++;
            if (result.error) {
              job.errors.push(`${file}: ${result.error}`);
            }
          }

          // Update progress
          job.progress = Math.round(
            (job.processedFiles / job.totalFiles) * 100
          );

          // Report progress
          if (batchOptions.progressCallback) {
            const progressInfo: ProgressInfo = {
              message: `Formatting ${path.basename(file)}...`,
              increment: 1,
              total: job.totalFiles,
              current: job.processedFiles,
            };
            batchOptions.progressCallback(progressInfo);
          }

          // Stop on error if configured
          if (!result.success && batchOptions.stopOnError) {
            job.status = BatchJobStatus.FAILED;
            job.endTime = new Date();
            return;
          }
        } catch (error) {
          job.failedFiles++;
          job.processedFiles++;
          job.errors.push(`${file}: ${error}`);

          if (batchOptions.stopOnError) {
            job.status = BatchJobStatus.FAILED;
            job.endTime = new Date();
            return;
          }
        } finally {
          release();
        }
      });

      promises.push(promise);
    }

    // Wait for all formatting operations to complete
    await Promise.allSettled(promises);

    // Update final job status
    if (job.status === BatchJobStatus.RUNNING) {
      job.status =
        job.failedFiles > 0 && job.successfulFiles === 0
          ? BatchJobStatus.FAILED
          : BatchJobStatus.COMPLETED;
    }

    job.endTime = new Date();
    job.progress = 100;

    this.loggingService?.info(
      `Batch formatting job ${job.id} completed. ` +
        `Success: ${job.successfulFiles}, Failed: ${job.failedFiles}`
    );
  }

  /**
   * **Format a single file**
   */
  private async formatSingleFile(
    filePath: string,
    options?: FormatOptions
  ): Promise<BatchFormattingResult> {
    const startTime = Date.now();

    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return {
          filePath: filePath,
          success: false,
          error: new Error("File not found"),
          executionTime: Date.now() - startTime,
          changes: 0,
        };
      }

      // Read file content
      const originalContent = await fs.promises.readFile(filePath, "utf8");
      const originalLines = originalContent.split("\n").length;

      // Open document in VS Code
      const document = await vscode.workspace.openTextDocument(filePath);

      // Format the document
      const formatResult = await this.formatService?.formatDocument(
        document,
        options
      );

      if (!formatResult || !formatResult.success) {
        return {
          filePath: filePath,
          success: false,
          error: new Error(
            formatResult?.errors?.[0]?.message || "Format failed"
          ),
          executionTime: Date.now() - startTime,
          changes: 0,
        };
      }

      // Apply edits and save
      if (formatResult.edits && formatResult.edits.length > 0) {
        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.set(document.uri, formatResult.edits);

        const applied = await vscode.workspace.applyEdit(workspaceEdit);
        if (applied) {
          await document.save();
        }
      }

      return {
        filePath: filePath,
        success: true,
        executionTime: Date.now() - startTime,
        changes: formatResult.edits?.length || 0,
      };
    } catch (error) {
      return {
        filePath: filePath,
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        executionTime: Date.now() - startTime,
        changes: 0,
      };
    }
  }

  /**
   * **Get all files in workspace for formatting**
   */
  private async getWorkspaceFiles(
    options?: WorkspaceFormatOptions
  ): Promise<string[]> {
    const files: string[] = [];

    if (!vscode.workspace.workspaceFolders) {
      return files;
    }

    for (const folder of vscode.workspace.workspaceFolders) {
      const folderFiles = await this.getFilesInFolder(
        folder.uri.fsPath,
        options
      );
      files.push(...folderFiles);
    }

    return files;
  }

  /**
   * **Get all files in a folder recursively**
   */
  private async getFilesInFolder(
    folderPath: string,
    options?: WorkspaceFormatOptions
  ): Promise<string[]> {
    const files: string[] = [];

    try {
      const items = await fs.promises.readdir(folderPath, {
        withFileTypes: true,
      });

      for (const item of items) {
        const itemPath = path.join(folderPath, item.name);

        if (item.isDirectory()) {
          // Skip hidden directories unless configured to include them
          if (item.name.startsWith(".") && !options?.includeHiddenFiles) {
            continue;
          }

          // Skip common build/dependency directories
          if (this.shouldSkipDirectory(item.name, options)) {
            continue;
          }

          const subFiles = await this.getFilesInFolder(itemPath, options);
          files.push(...subFiles);
        } else if (item.isFile()) {
          // Skip hidden files unless configured to include them
          if (item.name.startsWith(".") && !options?.includeHiddenFiles) {
            continue;
          }

          if (this.shouldIncludeFile(itemPath, options)) {
            files.push(itemPath);
          }
        }
      }
    } catch (error) {
      this.loggingService?.warn(
        `Failed to read directory ${folderPath}:`,
        error
      );
    }

    return files;
  }

  /**
   * **Check if directory should be skipped**
   */
  private shouldSkipDirectory(
    dirName: string,
    options?: WorkspaceFormatOptions
  ): boolean {
    const commonSkipDirs = [
      "node_modules",
      "dist",
      "build",
      "out",
      "target",
      ".git",
      ".svn",
      ".hg",
      "__pycache__",
      ".pytest_cache",
      "venv",
      "env",
    ];

    return commonSkipDirs.includes(dirName);
  }

  /**
   * **Check if file should be included for formatting**
   */
  private shouldIncludeFile(
    filePath: string,
    options?: WorkspaceFormatOptions
  ): boolean {
    const fileName = path.basename(filePath);
    const ext = path.extname(fileName);

    // Check exclude patterns
    if (options?.excludePatterns) {
      for (const pattern of options.excludePatterns) {
        if (this.matchesPattern(filePath, pattern)) {
          return false;
        }
      }
    }

    // Check include patterns
    if (options?.includePatterns && options.includePatterns.length > 0) {
      for (const pattern of options.includePatterns) {
        if (this.matchesPattern(filePath, pattern)) {
          return true;
        }
      }
      return false;
    }

    // Default: include common code file extensions
    const codeExtensions = [
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
      ".py",
      ".java",
      ".c",
      ".cpp",
      ".cs",
      ".php",
      ".rb",
      ".go",
      ".rs",
      ".html",
      ".css",
      ".scss",
      ".less",
      ".json",
      ".xml",
      ".yaml",
      ".yml",
      ".md",
      ".sql",
      ".sh",
      ".ps1",
    ];

    return codeExtensions.includes(ext.toLowerCase());
  }

  /**
   * **Check if file path matches a pattern**
   */
  private matchesPattern(filePath: string, pattern: string): boolean {
    // Simple glob matching
    const regexPattern = pattern
      .replace(/\./g, "\\.")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath) || regex.test(path.basename(filePath));
  }
}

/**
 * **Semaphore for controlling concurrency**
 */
class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      if (this.permits > 0) {
        this.permits--;
        resolve(this.createReleaseFunction());
      } else {
        this.waitQueue.push(() => {
          resolve(this.createReleaseFunction());
        });
      }
    });
  }

  private createReleaseFunction(): () => void {
    return () => {
      this.permits++;
      if (this.waitQueue.length > 0) {
        this.permits--;
        const next = this.waitQueue.shift()!;
        next();
      }
    };
  }
}
