import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import {
  FormatConfig,
  IConfigurationService,
  ConfigurationProfile,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  StyleSuggestion,
  DiagnosticLevel,
  FormatterType,
  LanguageConfig,
  SuggestionType,
  LineEndingType,
} from "../types";

/**
 * **Enhanced service for managing extension configuration with profiles and validation**
 */
export class ConfigurationService implements IConfigurationService {
  private _onConfigurationChanged = new vscode.EventEmitter<void>();
  public readonly onConfigurationChanged = this._onConfigurationChanged.event;

  private cachedConfig: FormatConfig | null = null;
  private profiles: Map<string, ConfigurationProfile> = new Map();
  private editorConfigCache: Map<string, any> = new Map();
  private prettierConfigCache: Map<string, any> = new Map();

  constructor() {
    // **Listen for configuration changes**
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("formatMaster")) {
        this.invalidateCache();
        this._onConfigurationChanged.fire();
      }
    });

    // **Load saved profiles**
    this.loadProfiles();
  }

  /**
   * **Get the current configuration with profile support**
   */
  getConfig(workspaceFolder?: string): FormatConfig {
    if (this.cachedConfig) {
      return this.mergeWithProfile(this.cachedConfig, workspaceFolder);
    }

    const config = vscode.workspace.getConfiguration("formatMaster");

    this.cachedConfig = {
      // Basic formatting settings
      indentSize: config.get<number>("indentSize", 2),
      useTabs: config.get<boolean>("useTabs", false),
      maxLineLength: config.get<number>("maxLineLength", 120),
      insertFinalNewline: config.get<boolean>("insertFinalNewline", true),
      trimTrailingWhitespace: config.get<boolean>(
        "trimTrailingWhitespace",
        true
      ),
      preserveLineEndings: config.get<boolean>("preserveLineEndings", false),
      normalizeLineEndings: config.get<LineEndingType>(
        "normalizeLineEndings",
        LineEndingType.AUTO
      ),

      // Language and formatting behavior
      enabledLanguages: config.get<string[]>("enabledLanguages", [
        "javascript",
        "typescript",
        "json",
        "xml",
        "css",
        "html",
        "python",
        "markdown",
        "yaml",
      ]),
      customRules: config.get<Record<string, any>>("customRules", {}),
      formatOnSave: config.get<boolean>("formatOnSave", true),
      formatOnSaveTimeout: config.get<number>("formatOnSaveTimeout", 5000),
      formatOnPaste: config.get<boolean>("formatOnPaste", false),
      formatOnType: config.get<boolean>("formatOnType", false),
      formatOnTypeDelay: config.get<number>("formatOnTypeDelay", 500),

      // Advanced features
      enablePreview: config.get<boolean>("enablePreview", true),
      enableFormatHistory: config.get<boolean>("enableFormatHistory", false),
      maxHistoryEntries: config.get<number>("maxHistoryEntries", 50),
      validateBeforeFormat: config.get<boolean>("validateBeforeFormat", true),
      enableCodeAnalysis: config.get<boolean>("enableCodeAnalysis", false),
      enableStyleSuggestions: config.get<boolean>(
        "enableStyleSuggestions",
        true
      ),

      // Performance settings
      performanceMonitoring: config.get<boolean>(
        "performanceMonitoring",
        false
      ),
      maxFileSizeKB: config.get<number>("maxFileSizeKB", 1024),
      incrementalFormatting: config.get<boolean>("incrementalFormatting", true),
      backgroundProcessing: config.get<boolean>("backgroundProcessing", false),
      enableCaching: config.get<boolean>("enableCaching", true),
      cacheExpirationMinutes: config.get<number>("cacheExpirationMinutes", 30),

      // Profile and configuration management
      configurationProfiles: config.get<Record<string, Partial<FormatConfig>>>(
        "configurationProfiles",
        {}
      ),
      activeProfile: config.get<string>("activeProfile", "default"),
      respectEditorConfig: config.get<boolean>("respectEditorConfig", true),
      respectPrettierConfig: config.get<boolean>("respectPrettierConfig", true),
      respectESLintConfig: config.get<boolean>("respectESLintConfig", true),
      enableWorkspaceInheritance: config.get<boolean>(
        "enableWorkspaceInheritance",
        true
      ),

      // UI and UX settings
      statusBarIntegration: config.get<boolean>("statusBarIntegration", true),
      showProgressNotifications: config.get<boolean>(
        "showProgressNotifications",
        true
      ),
      enableQuickActions: config.get<boolean>("enableQuickActions", true),
      diagnosticsLevel: config.get<DiagnosticLevel>(
        "diagnosticsLevel",
        DiagnosticLevel.WARNING
      ),

      // Language-specific configurations
      languageSpecific: config.get<Record<string, LanguageConfig>>(
        "languageSpecific",
        {}
      ),

      // Formatter discovery and integration
      formatterScanOnStartup: config.get<boolean>(
        "formatterScanOnStartup",
        true
      ),
      formatterScanCacheTimeout: config.get<number>(
        "formatterScanCacheTimeout",
        30
      ),
      showFormatterSuggestions: config.get<boolean>(
        "showFormatterSuggestions",
        true
      ),
      autoRefreshLanguageSupport: config.get<boolean>(
        "autoRefreshLanguageSupport",
        false
      ),
      enableExternalFormatterIntegration: config.get<boolean>(
        "enableExternalFormatterIntegration",
        false
      ),

      // Git integration
      formatOnlyChangedFiles: config.get<boolean>(
        "formatOnlyChangedFiles",
        false
      ),
      enableGitHooks: config.get<boolean>("enableGitHooks", false),
      formatBeforeCommit: config.get<boolean>("formatBeforeCommit", false),

      // Batch processing
      enableBatchFormatting: config.get<boolean>(
        "enableBatchFormatting",
        false
      ),
      batchProcessingChunkSize: config.get<number>(
        "batchProcessingChunkSize",
        100
      ),
      batchProcessingDelay: config.get<number>("batchProcessingDelay", 0),

      // Accessibility and internationalization
      enableAccessibilityFeatures: config.get<boolean>(
        "enableAccessibilityFeatures",
        false
      ),
      language: config.get<string>("language", "en"),
      enableScreenReaderSupport: config.get<boolean>(
        "enableScreenReaderSupport",
        false
      ),

      // Additional required properties for FormatConfig interface
      enableCodeLens: config.get<boolean>("enableCodeLens", false),
      enableInlayHints: config.get<boolean>("enableInlayHints", false),
      cacheFormattingResults: config.get<boolean>(
        "cacheFormattingResults",
        true
      ),
      parallelFormatting: config.get<boolean>("parallelFormatting", false),
      maxConcurrentFormats: config.get<number>("maxConcurrentFormats", 3),
      enableSemanticFormatting: config.get<boolean>(
        "enableSemanticFormatting",
        false
      ),
      enableAutofixOnFormat: config.get<boolean>(
        "enableAutofixOnFormat",
        false
      ),
      excludePatterns: config.get<string[]>("excludePatterns", [
        "**/node_modules/**",
      ]),
      includePatterns: config.get<string[]>("includePatterns", ["**/*"]),
      enableAutoFormatterDiscovery: config.get<boolean>(
        "enableAutoFormatterDiscovery",
        true
      ),
      customFormatterPaths: config.get<string[]>("customFormatterPaths", []),
      formatterTimeout: config.get<number>("formatterTimeout", 10000),
      enableProgressReporting: config.get<boolean>(
        "enableProgressReporting",
        true
      ),
    };

    return this.mergeWithProfile(
      this.cachedConfig || this.getConfig(),
      workspaceFolder
    );
  }

  /**
   * **Get language-specific configuration with enhanced merging**
   */
  getLanguageConfig(
    languageId: string,
    workspaceFolder?: string
  ): Partial<FormatConfig> & LanguageConfig {
    const baseConfig = this.getConfig(workspaceFolder);
    const languageSpecific = baseConfig.languageSpecific[languageId] || {};
    const customRules = baseConfig.customRules[languageId] || {};

    // **Merge EditorConfig if enabled**
    const editorConfig = baseConfig.respectEditorConfig
      ? this.getEditorConfig(workspaceFolder)
      : {};

    // **Merge Prettier config if enabled**
    const prettierConfig =
      baseConfig.respectPrettierConfig &&
      this.isLanguageSupported(languageId, [
        "javascript",
        "typescript",
        "css",
        "html",
        "json",
        "markdown",
      ])
        ? this.getPrettierConfig(workspaceFolder)
        : {};

    return {
      ...baseConfig,
      ...editorConfig,
      ...prettierConfig,
      ...customRules,
      enabled:
        languageSpecific.enabled ??
        baseConfig.enabledLanguages.includes(languageId),
      formatter: languageSpecific.formatter ?? FormatterType.AUTO,
      rules: { ...customRules, ...languageSpecific.rules },
      priority: languageSpecific.priority,
      timeout: languageSpecific.timeout,
      customFormatter: languageSpecific.customFormatter,
    };
  }

  /**
   * **Validate configuration with comprehensive checks**
   */
  validateConfig(config?: Partial<FormatConfig>): ValidationResult {
    const configToValidate = config || this.getConfig();
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const startTime = Date.now();

    // **Validate indent size**
    if (
      configToValidate.indentSize &&
      (configToValidate.indentSize < 1 || configToValidate.indentSize > 16)
    ) {
      errors.push({
        code: "INVALID_INDENT_SIZE",
        message: "Indent size must be between 1 and 16",
        line: 0,
        column: 0,
        severity: DiagnosticLevel.ERROR,
        source: "formatMaster",
      });
    }

    // **Validate max line length**
    if (
      configToValidate.maxLineLength &&
      (configToValidate.maxLineLength < 20 ||
        configToValidate.maxLineLength > 500)
    ) {
      warnings.push({
        code: "SUBOPTIMAL_LINE_LENGTH",
        message:
          "Line length should be between 20 and 500 for optimal readability",
        line: 0,
        column: 0,
        severity: DiagnosticLevel.WARNING,
        source: "formatMaster",
      });
    }

    // **Validate enabled languages**
    const supportedLanguages = [
      "javascript",
      "typescript",
      "javascriptreact",
      "typescriptreact",
      "json",
      "xml",
      "css",
      "scss",
      "less",
      "html",
      "python",
      "markdown",
      "yaml",
      "yml",
    ];

    if (configToValidate.enabledLanguages) {
      const unsupportedLanguages = configToValidate.enabledLanguages.filter(
        (lang) => !supportedLanguages.includes(lang)
      );

      if (unsupportedLanguages.length > 0) {
        warnings.push({
          code: "UNSUPPORTED_LANGUAGES",
          message: `Unsupported languages: ${unsupportedLanguages.join(", ")}`,
          line: 0,
          column: 0,
          severity: DiagnosticLevel.WARNING,
          source: "formatMaster",
        });
      }
    }

    // **Validate file size limit**
    if (
      configToValidate.maxFileSizeKB &&
      configToValidate.maxFileSizeKB > 10240
    ) {
      warnings.push({
        code: "LARGE_FILE_SIZE_LIMIT",
        message: "Large file size limits may impact performance",
        line: 0,
        column: 0,
        severity: DiagnosticLevel.WARNING,
        source: "formatMaster",
      });
    }

    const executionTime = Date.now() - startTime;

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions: this.generateSuggestions(configToValidate),
      executionTime,
    };
  }

  /**
   * **List all available profiles (required by interface)**
   */
  listProfiles(): ConfigurationProfile[] {
    return Array.from(this.profiles.values());
  }

  /**
   * **Create a new configuration profile**
   */
  async createProfile(
    name: string,
    config: Partial<FormatConfig>,
    description?: string
  ): Promise<void> {
    const profile: ConfigurationProfile = {
      name,
      description,
      config,
      createdAt: new Date(),
      lastModified: new Date(),
      version: "1.0.0",
      tags: [],
      isReadOnly: false,
      isDefault: false,
    };

    this.profiles.set(name, profile);
    await this.saveProfiles();
  }

  /**
   * **Switch to a different configuration profile**
   */
  async switchProfile(profileName: string): Promise<void> {
    if (!this.profiles.has(profileName) && profileName !== "default") {
      throw new Error(`Profile '${profileName}' not found`);
    }

    await this.updateConfig("activeProfile", profileName);

    if (this.profiles.has(profileName)) {
      const profile = this.profiles.get(profileName)!;
      profile.lastModified = new Date();
      await this.saveProfiles();
    }
  }

  /**
   * **Export configuration profile to string**
   */
  async exportProfile(name: string): Promise<string> {
    const profile = this.profiles.get(name);
    if (!profile) {
      throw new Error(`Profile '${name}' not found`);
    }

    const exportData = {
      formatMasterProfile: {
        version: "1.0.0",
        exported: new Date().toISOString(),
        profile,
      },
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * **Import configuration profile from string data**
   */
  async importProfile(profileData: string): Promise<void> {
    const importData = JSON.parse(profileData);

    if (
      !importData.formatMasterProfile ||
      !importData.formatMasterProfile.profile
    ) {
      throw new Error("Invalid profile file format");
    }

    const profile = importData.formatMasterProfile
      .profile as ConfigurationProfile;
    profile.createdAt = new Date();
    profile.lastModified = new Date();

    // **Ensure unique name**
    let uniqueName = profile.name;
    let counter = 1;
    while (this.profiles.has(uniqueName)) {
      uniqueName = `${profile.name}_${counter}`;
      counter++;
    }

    profile.name = uniqueName;
    this.profiles.set(uniqueName, profile);
    await this.saveProfiles();
  }

  /**
   * **Export configuration to a file**
   */
  async exportConfiguration(filePath: string): Promise<void> {
    try {
      const config = this.getConfig();
      const profiles = Array.from(this.profiles.values());

      const exportData = {
        config,
        profiles,
        exportDate: new Date().toISOString(),
        version: "1.0.0",
      };

      await fs.promises.writeFile(
        filePath,
        JSON.stringify(exportData, null, 2),
        "utf8"
      );
    } catch (error) {
      throw new Error(`Failed to export configuration: ${error}`);
    }
  }

  /**
   * **Import configuration from a file**
   */
  async importConfiguration(filePath: string): Promise<void> {
    try {
      const data = await fs.promises.readFile(filePath, "utf8");
      const importData = JSON.parse(data);

      if (importData.config) {
        // **Apply imported configuration**
        const config = vscode.workspace.getConfiguration("formatMaster");
        for (const [key, value] of Object.entries(importData.config)) {
          if (key !== "configurationProfiles" && key !== "activeProfile") {
            await config.update(
              key,
              value,
              vscode.ConfigurationTarget.Workspace
            );
          }
        }
      }

      if (importData.profiles && Array.isArray(importData.profiles)) {
        // **Import profiles**
        for (const profile of importData.profiles) {
          this.profiles.set(profile.name, profile);
        }
        await this.saveProfiles();
      }

      this.invalidateCache();
    } catch (error) {
      throw new Error(`Failed to import configuration: ${error}`);
    }
  }

  /**
   * **Delete a configuration profile**
   */
  async deleteProfile(profileName: string): Promise<void> {
    if (!this.profiles.has(profileName)) {
      throw new Error(`Profile '${profileName}' does not exist`);
    }

    if (profileName === "default") {
      throw new Error("Cannot delete the default profile");
    }

    this.profiles.delete(profileName);
    await this.saveProfiles();

    // **If this was the active profile, switch to default**
    const config = vscode.workspace.getConfiguration("formatMaster");
    const activeProfile = config.get<string>("activeProfile");

    if (activeProfile === profileName) {
      await config.update(
        "activeProfile",
        "default",
        vscode.ConfigurationTarget.Workspace
      );
    }
  }

  /**
   * **Get all available profiles**
   */
  async getProfiles(): Promise<ConfigurationProfile[]> {
    return Array.from(this.profiles.values());
  }

  /**
   * Reset configuration to default values
   */
  async resetConfig(): Promise<void> {
    this.invalidateCache();
    const config = vscode.workspace.getConfiguration("formatMaster");

    // Reset all configuration settings to their default values
    for (const key of Object.keys(this.getConfig())) {
      await config.update(key, undefined, vscode.ConfigurationTarget.Workspace);
    }

    // Reset to default profile
    await this.switchProfile("default");
  }

  /**
   * Migrate configuration from older versions
   */
  async migrateConfig(fromVersion: string): Promise<void> {
    const currentConfig = this.getConfig();

    switch (fromVersion) {
      case "1.0.0":
        // Migrate from 1.0.0 to current version
        if (!currentConfig.enableAutoFormatterDiscovery) {
          await this.updateConfig("enableAutoFormatterDiscovery", true);
        }
        break;
      case "0.9.0":
        // Migrate from 0.9.0 to current version
        if (!currentConfig.languageSpecific) {
          await this.updateConfig("languageSpecific", {});
        }
        break;
      default:
        throw new Error(`Unsupported version for migration: ${fromVersion}`);
    }
  }

  /**
   * Get ESLint configuration integration
   */
  getESLintConfig(workspaceFolder?: string): Partial<FormatConfig> {
    if (!workspaceFolder) {
      workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    }

    if (!workspaceFolder) {
      return {};
    }

    try {
      const eslintConfigFiles = [
        ".eslintrc",
        ".eslintrc.js",
        ".eslintrc.json",
        ".eslintrc.yaml",
        ".eslintrc.yml",
      ];

      for (const configFile of eslintConfigFiles) {
        const configPath = path.join(workspaceFolder, configFile);
        if (fs.existsSync(configPath)) {
          // For JSON/YAML files
          if (
            configFile.endsWith(".json") ||
            configFile.endsWith(".yaml") ||
            configFile.endsWith(".yml")
          ) {
            const content = fs.readFileSync(configPath, "utf8");
            const eslintConfig = JSON.parse(content);
            return this.mapESLintToFormatConfig(eslintConfig);
          }
        }
      }
    } catch (error) {
      // Ignore errors and return empty config
    }

    return {};
  }

  /**
   * **Public method to get EditorConfig (required by interface)**
   */
  getEditorConfig(workspaceFolder?: string): Partial<FormatConfig> {
    if (!workspaceFolder) {
      workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    }

    if (!workspaceFolder) {
      return {};
    }

    const cacheKey = workspaceFolder;
    if (this.editorConfigCache.has(cacheKey)) {
      return this.editorConfigCache.get(cacheKey);
    }

    try {
      const editorConfigPath = path.join(workspaceFolder, ".editorconfig");
      if (fs.existsSync(editorConfigPath)) {
        // **Simple .editorconfig parsing - in production, use a proper parser**
        const content = fs.readFileSync(editorConfigPath, "utf8");
        const config = this.parseEditorConfig(content);
        this.editorConfigCache.set(cacheKey, config);
        return config;
      }
    } catch (error) {
      // **Ignore errors and return empty config**
    }

    this.editorConfigCache.set(cacheKey, {});
    return {};
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.invalidateCache();
    this._onConfigurationChanged.dispose();
    this.profiles.clear();
    this.editorConfigCache.clear();
    this.prettierConfigCache.clear();
  }

  private mapESLintToFormatConfig(eslintConfig: any): Partial<FormatConfig> {
    const config: Partial<FormatConfig> = {};

    if (eslintConfig.rules) {
      if (eslintConfig.rules["max-len"]?.[1]?.code) {
        config.maxLineLength = eslintConfig.rules["max-len"][1].code;
      }
      if (eslintConfig.rules.indent?.[1]) {
        config.indentSize = eslintConfig.rules.indent[1];
      }
    }

    return config;
  }

  // **Private helper methods**

  private mergeWithProfile(
    baseConfig: FormatConfig,
    _workspaceFolder?: string
  ): FormatConfig {
    const activeProfile = baseConfig.activeProfile;

    if (activeProfile === "default") {
      return baseConfig;
    }

    const profile = this.profiles.get(activeProfile);
    if (!profile) {
      return baseConfig;
    }

    return { ...baseConfig, ...profile.config };
  }

  public getPrettierConfig(workspaceFolder?: string): Partial<FormatConfig> {
    if (!workspaceFolder) {
      workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    }

    if (!workspaceFolder) {
      return {};
    }

    const cacheKey = workspaceFolder;
    if (this.prettierConfigCache.has(cacheKey)) {
      return this.prettierConfigCache.get(cacheKey);
    }

    try {
      const configFiles = [
        ".prettierrc",
        ".prettierrc.json",
        ".prettierrc.js",
        "prettier.config.js",
      ];

      for (const configFile of configFiles) {
        const configPath = path.join(workspaceFolder, configFile);
        if (fs.existsSync(configPath)) {
          const config = this.parsePrettierConfig(configPath);
          this.prettierConfigCache.set(cacheKey, config);
          return config;
        }
      }
    } catch (error) {
      // **Ignore errors and return empty config**
    }

    this.prettierConfigCache.set(cacheKey, {});
    return {};
  }

  private parseEditorConfig(content: string): Partial<FormatConfig> {
    const config: Partial<FormatConfig> = {};
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.includes("indent_size")) {
        const match = trimmed.match(/indent_size\s*=\s*(\d+)/);
        if (match) {
          config.indentSize = parseInt(match[1]);
        }
      } else if (trimmed.includes("indent_style")) {
        const match = trimmed.match(/indent_style\s*=\s*(tab|space)/);
        if (match) {
          config.useTabs = match[1] === "tab";
        }
      } else if (trimmed.includes("max_line_length")) {
        const match = trimmed.match(/max_line_length\s*=\s*(\d+)/);
        if (match) {
          config.maxLineLength = parseInt(match[1]);
        }
      }
    }

    return config;
  }

  private parsePrettierConfig(configPath: string): Partial<FormatConfig> {
    try {
      if (configPath.endsWith(".json") || configPath.endsWith(".prettierrc")) {
        const content = fs.readFileSync(configPath, "utf8");
        const prettierConfig = JSON.parse(content);
        return this.mapPrettierToFormatConfig(prettierConfig);
      }
      // **For .js files, would need dynamic import - simplified for now**
    } catch (error) {
      // **Ignore parsing errors**
    }

    return {};
  }

  private mapPrettierToFormatConfig(
    prettierConfig: any
  ): Partial<FormatConfig> {
    const config: Partial<FormatConfig> = {};

    if (typeof prettierConfig.tabWidth === "number") {
      config.indentSize = prettierConfig.tabWidth;
    }

    if (typeof prettierConfig.useTabs === "boolean") {
      config.useTabs = prettierConfig.useTabs;
    }

    if (typeof prettierConfig.printWidth === "number") {
      config.maxLineLength = prettierConfig.printWidth;
    }

    return config;
  }

  private generateSuggestions(
    config: Partial<FormatConfig>
  ): StyleSuggestion[] {
    const suggestions: StyleSuggestion[] = [];

    if (config.maxLineLength && config.maxLineLength > 120) {
      suggestions.push({
        type: SuggestionType.FORMATTING,
        message:
          "Consider using a line length of 120 or less for better readability",
        range: new vscode.Range(0, 0, 0, 0),
        severity: DiagnosticLevel.INFO,
        confidence: 0.8,
      });
    }

    if (config.formatOnSave === false) {
      suggestions.push({
        type: SuggestionType.PERFORMANCE,
        message: "Enable 'Format on Save' for consistent code formatting",
        range: new vscode.Range(0, 0, 0, 0),
        severity: DiagnosticLevel.INFO,
        confidence: 0.9,
      });
    }

    if (config.validateBeforeFormat === false) {
      suggestions.push({
        type: SuggestionType.SECURITY,
        message: "Enable validation before formatting to prevent syntax errors",
        range: new vscode.Range(0, 0, 0, 0),
        severity: DiagnosticLevel.INFO,
        confidence: 0.7,
      });
    }

    return suggestions;
  }

  private isLanguageSupported(
    languageId: string,
    supportedLanguages: string[]
  ): boolean {
    return supportedLanguages.includes(languageId);
  }

  private async loadProfiles(): Promise<void> {
    try {
      // **In a real implementation, load from extension storage**
      // **For now, keep profiles in memory**
    } catch (error) {
      // **Ignore load errors**
    }
  }

  private async saveProfiles(): Promise<void> {
    try {
      // **In a real implementation, save to extension storage**
      // **For now, profiles are kept in memory only**
    } catch (error) {
      // **Ignore save errors**
    }
  }

  private invalidateCache(): void {
    this.cachedConfig = null;
    this.editorConfigCache.clear();
    this.prettierConfigCache.clear();
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
