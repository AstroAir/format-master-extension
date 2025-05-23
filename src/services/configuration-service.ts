import * as vscode from "vscode";
import { FormatConfig, IConfigurationService } from "../types";

/**
 * **Service for managing extension configuration**
 */
export class ConfigurationService implements IConfigurationService {
  private _onConfigurationChanged = new vscode.EventEmitter<void>();
  public readonly onConfigurationChanged = this._onConfigurationChanged.event;

  private cachedConfig: FormatConfig | null = null;

  constructor() {
    // **Listen for configuration changes**
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("formatMaster")) {
        this.cachedConfig = null; // **Invalidate cache**
        this._onConfigurationChanged.fire();
      }
    });
  }

  /**
   * **Get the current configuration**
   */
  getConfig(): FormatConfig {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    const config = vscode.workspace.getConfiguration("formatMaster");

    this.cachedConfig = {
      indentSize: config.get<number>("indentSize", 2),
      useTabs: config.get<boolean>("useTabs", false),
      maxLineLength: config.get<number>("maxLineLength", 120),
      insertFinalNewline: config.get<boolean>("insertFinalNewline", true),
      trimTrailingWhitespace: config.get<boolean>(
        "trimTrailingWhitespace",
        true
      ),
      enabledLanguages: config.get<string[]>("enabledLanguages", [
        "javascript",
        "typescript",
        "json",
        "xml",
      ]),
      customRules: config.get<Record<string, any>>("customRules", {}),
    };

    return this.cachedConfig;
  }

  /**
   * **Get language-specific configuration**
   */
  getLanguageConfig(languageId: string): Partial<FormatConfig> {
    const baseConfig = this.getConfig();
    const customRules = baseConfig.customRules[languageId] || {};

    return {
      ...baseConfig,
      ...customRules,
    };
  }

  /**
   * **Update configuration value**
   */
  async updateConfig<K extends keyof FormatConfig>(
    key: K,
    value: FormatConfig[K],
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration("formatMaster");
    await config.update(key, value, target);
  }

  /**
   * **Check if language is enabled for formatting**
   */
  isLanguageEnabled(languageId: string): boolean {
    const config = this.getConfig();
    return config.enabledLanguages.includes(languageId);
  }

  /**
   * **Get editor-specific formatting options**
   */
  getEditorOptions(document: vscode.TextDocument): {
    tabSize: number;
    insertSpaces: boolean;
  } {
    const editorConfig = vscode.workspace.getConfiguration(
      "editor",
      document.uri
    );
    const formatConfig = this.getLanguageConfig(document.languageId);

    return {
      tabSize:
        formatConfig.indentSize || editorConfig.get<number>("tabSize", 2),
      insertSpaces:
        !formatConfig.useTabs &&
        editorConfig.get<boolean>("insertSpaces", true),
    };
  }
}
