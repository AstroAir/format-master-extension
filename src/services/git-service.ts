import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import {
  IGitService,
  FormatOptions,
  FormatResult,
  GitIntegrationConfig,
} from "../types";

const execAsync = promisify(exec);

/**
 * **Enhanced Git integration service with advanced formatting workflows**
 */
export class GitService implements IGitService {
  private _onRepositoryChanged = new vscode.EventEmitter<string>();
  public readonly onRepositoryChanged = this._onRepositoryChanged.event;

  private watchers: Map<string, fs.FSWatcher> = new Map();
  private gitExtension: any;

  constructor(
    private configService: any,
    private formatService: any,
    private loggingService: any
  ) {
    this.initializeGitExtension();
    this.setupRepositoryWatchers();
  }

  /**
   * **Get changed files in repository**
   */
  async getChangedFiles(repository?: string): Promise<string[]> {
    const repoPath = repository || (await this.getCurrentRepository());
    if (!repoPath) {
      return [];
    }

    try {
      const { stdout } = await execAsync("git diff --name-only HEAD", {
        cwd: repoPath,
      });
      return stdout
        .trim()
        .split("\n")
        .filter((file) => file.length > 0);
    } catch (error) {
      this.loggingService?.warn("Failed to get changed files:", error);
      return [];
    }
  }

  /**
   * **Get staged files in repository**
   */
  async getStagedFiles(repository?: string): Promise<string[]> {
    const repoPath = repository || (await this.getCurrentRepository());
    if (!repoPath) {
      return [];
    }

    try {
      const { stdout } = await execAsync("git diff --cached --name-only", {
        cwd: repoPath,
      });
      return stdout
        .trim()
        .split("\n")
        .filter((file) => file.length > 0);
    } catch (error) {
      this.loggingService?.warn("Failed to get staged files:", error);
      return [];
    }
  }

  /**
   * **Get unstaged files in repository**
   */
  async getUnstagedFiles(repository?: string): Promise<string[]> {
    const repoPath = repository || (await this.getCurrentRepository());
    if (!repoPath) {
      return [];
    }

    try {
      const { stdout } = await execAsync("git diff --name-only", {
        cwd: repoPath,
      });
      return stdout
        .trim()
        .split("\n")
        .filter((file) => file.length > 0);
    } catch (error) {
      this.loggingService?.warn("Failed to get unstaged files:", error);
      return [];
    }
  }

  /**
   * **Format changed files**
   */
  async formatChangedFiles(options?: FormatOptions): Promise<FormatResult[]> {
    const changedFiles = await this.getChangedFiles();
    return this.formatFileList(changedFiles, options);
  }

  /**
   * **Format staged files**
   */
  async formatStagedFiles(options?: FormatOptions): Promise<FormatResult[]> {
    const stagedFiles = await this.getStagedFiles();
    return this.formatFileList(stagedFiles, options);
  }

  /**
   * **Install pre-commit hook**
   */
  async installPreCommitHook(): Promise<void> {
    const repoPath = await this.getCurrentRepository();
    if (!repoPath) {
      throw new Error("No Git repository found");
    }

    const hooksDir = path.join(repoPath, ".git", "hooks");
    const preCommitPath = path.join(hooksDir, "pre-commit");

    // Ensure hooks directory exists
    await fs.promises.mkdir(hooksDir, { recursive: true });

    const hookContent = this.generatePreCommitHook();

    try {
      // Check if hook already exists
      if (fs.existsSync(preCommitPath)) {
        const existingContent = await fs.promises.readFile(
          preCommitPath,
          "utf8"
        );
        if (existingContent.includes("FORMAT_MASTER_HOOK")) {
          this.loggingService?.info("Pre-commit hook already installed");
          return;
        }

        // Backup existing hook
        await fs.promises.copyFile(preCommitPath, `${preCommitPath}.backup`);
      }

      await fs.promises.writeFile(preCommitPath, hookContent, "utf8");
      await fs.promises.chmod(preCommitPath, "755");

      this.loggingService?.info("Pre-commit hook installed successfully");
    } catch (error) {
      this.loggingService?.error("Failed to install pre-commit hook:", error);
      throw error;
    }
  }

  /**
   * **Uninstall pre-commit hook**
   */
  async uninstallPreCommitHook(): Promise<void> {
    const repoPath = await this.getCurrentRepository();
    if (!repoPath) {
      throw new Error("No Git repository found");
    }

    const preCommitPath = path.join(repoPath, ".git", "hooks", "pre-commit");

    try {
      if (fs.existsSync(preCommitPath)) {
        const content = await fs.promises.readFile(preCommitPath, "utf8");

        if (content.includes("FORMAT_MASTER_HOOK")) {
          // Check if backup exists
          const backupPath = `${preCommitPath}.backup`;
          if (fs.existsSync(backupPath)) {
            await fs.promises.copyFile(backupPath, preCommitPath);
            await fs.promises.unlink(backupPath);
          } else {
            await fs.promises.unlink(preCommitPath);
          }

          this.loggingService?.info("Pre-commit hook uninstalled successfully");
        }
      }
    } catch (error) {
      this.loggingService?.error("Failed to uninstall pre-commit hook:", error);
      throw error;
    }
  }

  /**
   * **Check if pre-commit hook is installed**
   */
  async isPreCommitHookInstalled(): Promise<boolean> {
    const repoPath = await this.getCurrentRepository();
    if (!repoPath) {
      return false;
    }

    const preCommitPath = path.join(repoPath, ".git", "hooks", "pre-commit");

    try {
      if (fs.existsSync(preCommitPath)) {
        const content = await fs.promises.readFile(preCommitPath, "utf8");
        return content.includes("FORMAT_MASTER_HOOK");
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * **Get Git configuration for Format Master**
   */
  async getGitIntegrationConfig(): Promise<GitIntegrationConfig> {
    const config = this.configService?.getConfig();
    return config?.gitIntegration || this.getDefaultGitConfig();
  }

  /**
   * **Update Git integration configuration**
   */
  async updateGitIntegrationConfig(
    config: Partial<GitIntegrationConfig>
  ): Promise<void> {
    const currentConfig = await this.getGitIntegrationConfig();
    const updatedConfig = { ...currentConfig, ...config };

    await this.configService?.updateConfig("gitIntegration", updatedConfig);
  }

  /**
   * **Get diff for files**
   */
  async getDiff(
    files: string[],
    repository?: string
  ): Promise<Map<string, string>> {
    const repoPath = repository || (await this.getCurrentRepository());
    const diffs = new Map<string, string>();

    if (!repoPath) {
      return diffs;
    }

    for (const file of files) {
      try {
        const { stdout } = await execAsync(`git diff HEAD -- "${file}"`, {
          cwd: repoPath,
        });
        diffs.set(file, stdout);
      } catch (error) {
        this.loggingService?.warn(`Failed to get diff for ${file}:`, error);
        diffs.set(file, "");
      }
    }

    return diffs;
  }

  /**
   * **Stage formatted files**
   */
  async stageFiles(files: string[], repository?: string): Promise<void> {
    const repoPath = repository || (await this.getCurrentRepository());
    if (!repoPath || files.length === 0) {
      return;
    }

    try {
      const fileList = files.map((f) => `"${f}"`).join(" ");
      await execAsync(`git add ${fileList}`, { cwd: repoPath });
      this.loggingService?.info(`Staged ${files.length} formatted files`);
    } catch (error) {
      this.loggingService?.error("Failed to stage files:", error);
      throw error;
    }
  }

  /**
   * **Check if repository has uncommitted changes**
   */
  async hasUncommittedChanges(repository?: string): Promise<boolean> {
    const repoPath = repository || (await this.getCurrentRepository());
    if (!repoPath) {
      return false;
    }

    try {
      const { stdout } = await execAsync("git status --porcelain", {
        cwd: repoPath,
      });
      return stdout.trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * **Get current branch name**
   */
  async getCurrentBranch(repository?: string): Promise<string | null> {
    const repoPath = repository || (await this.getCurrentRepository());
    if (!repoPath) {
      return null;
    }

    try {
      const { stdout } = await execAsync("git rev-parse --abbrev-ref HEAD", {
        cwd: repoPath,
      });
      return stdout.trim();
    } catch (error) {
      return null;
    }
  }

  /**
   * **Dispose of the Git service**
   */
  dispose(): void {
    // Clean up watchers
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();

    this._onRepositoryChanged.dispose();
  }

  /**
   * **Initialize Git extension integration**
   */
  private async initializeGitExtension(): Promise<void> {
    try {
      this.gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;

      if (this.gitExtension) {
        const api = this.gitExtension.getAPI(1);

        api.onDidOpenRepository((repo: any) => {
          this.setupRepositoryWatcher(repo.rootUri.fsPath);
          this._onRepositoryChanged.fire(repo.rootUri.fsPath);
        });

        api.onDidCloseRepository((repo: any) => {
          this.removeRepositoryWatcher(repo.rootUri.fsPath);
        });
      }
    } catch (error) {
      this.loggingService?.warn("Failed to initialize Git extension:", error);
    }
  }

  /**
   * **Setup repository watchers**
   */
  private setupRepositoryWatchers(): void {
    if (vscode.workspace.workspaceFolders) {
      for (const folder of vscode.workspace.workspaceFolders) {
        const gitDir = path.join(folder.uri.fsPath, ".git");
        if (fs.existsSync(gitDir)) {
          this.setupRepositoryWatcher(folder.uri.fsPath);
        }
      }
    }
  }

  /**
   * **Setup watcher for a specific repository**
   */
  private setupRepositoryWatcher(repoPath: string): void {
    if (this.watchers.has(repoPath)) {
      return;
    }

    try {
      const gitDir = path.join(repoPath, ".git");
      const watcher = fs.watch(
        gitDir,
        { recursive: true },
        (eventType, filename) => {
          if (
            filename &&
            (filename.includes("HEAD") || filename.includes("refs"))
          ) {
            this._onRepositoryChanged.fire(repoPath);
          }
        }
      );

      this.watchers.set(repoPath, watcher);
    } catch (error) {
      this.loggingService?.warn(
        `Failed to setup watcher for ${repoPath}:`,
        error
      );
    }
  }

  /**
   * **Remove repository watcher**
   */
  private removeRepositoryWatcher(repoPath: string): void {
    const watcher = this.watchers.get(repoPath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(repoPath);
    }
  }

  /**
   * **Get current repository path**
   */
  private async getCurrentRepository(): Promise<string | null> {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      return null;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(
      activeEditor.document.uri
    );
    if (!workspaceFolder) {
      return null;
    }

    const gitDir = path.join(workspaceFolder.uri.fsPath, ".git");
    if (fs.existsSync(gitDir)) {
      return workspaceFolder.uri.fsPath;
    }

    return null;
  }

  /**
   * **Format a list of files**
   */
  private async formatFileList(
    files: string[],
    options?: FormatOptions
  ): Promise<FormatResult[]> {
    const results: FormatResult[] = [];
    const config = await this.getGitIntegrationConfig();

    if (!config.enabled) {
      return results;
    }

    for (const file of files) {
      try {
        const fullPath = path.resolve(file);

        // Check if file should be formatted
        if (!this.shouldFormatFile(file, config)) {
          continue;
        }

        const document = await vscode.workspace.openTextDocument(fullPath);
        const result = await this.formatService?.formatDocument(
          document,
          options
        );

        if (result) {
          results.push(result);
        }
      } catch (error) {
        this.loggingService?.warn(`Failed to format ${file}:`, error);
      }
    }

    return results;
  }

  /**
   * **Check if file should be formatted based on configuration**
   */
  private shouldFormatFile(
    file: string,
    config: GitIntegrationConfig
  ): boolean {
    // Check exclude patterns
    for (const pattern of config.excludePatterns) {
      if (this.matchesPattern(file, pattern)) {
        return false;
      }
    }

    // Check include patterns
    if (config.includePatterns.length > 0) {
      for (const pattern of config.includePatterns) {
        if (this.matchesPattern(file, pattern)) {
          return true;
        }
      }
      return false;
    }

    return true;
  }

  /**
   * **Check if file matches a glob pattern**
   */
  private matchesPattern(file: string, pattern: string): boolean {
    // Simple glob matching (could be enhanced with a proper glob library)
    const regexPattern = pattern
      .replace(/\./g, "\\.")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(file);
  }

  /**
   * **Generate pre-commit hook content**
   */
  private generatePreCommitHook(): string {
    return `#!/bin/sh
# FORMAT_MASTER_HOOK - Auto-generated by Format Master extension

# Get list of staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

# Format staged files using VS Code command (if available)
if command -v code >/dev/null 2>&1; then
  echo "Formatting staged files with Format Master..."
  
  for FILE in $STAGED_FILES; do
    # Skip if file doesn't exist (in case of deletion)
    if [ -f "$FILE" ]; then
      # Try to format the file
      code --wait --new-window "$FILE" >/dev/null 2>&1 || true
    fi
  done
  
  # Re-stage the formatted files
  git add $STAGED_FILES
  
  echo "Formatting complete."
fi

exit 0
`;
  }

  /**
   * **Get default Git integration configuration**
   */
  private getDefaultGitConfig(): GitIntegrationConfig {
    return {
      enabled: true,
      formatOnlyChangedFiles: true,
      formatBeforeCommit: false,
      enablePreCommitHook: false,
      enablePrePushHook: false,
      excludePatterns: [
        "*.min.js",
        "*.min.css",
        "node_modules/**",
        "dist/**",
        "build/**",
        "*.bundle.*",
      ],
      includePatterns: [],
      respectGitignore: true,
    };
  }
}
