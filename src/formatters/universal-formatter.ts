import * as vscode from "vscode";
import { BaseFormatter } from "./base-formatter";
import {
  FormatOptions,
  FormatResult,
  FormatterPriority,
  FormatOptionDescriptor,
  ValidationResult,
} from "../types";
import { FormatError } from "../errors/format-error";

/**
 * **Universal formatter that delegates to VS Code's built-in formatters**
 * Used for languages not directly supported by Format Master
 */
export class UniversalFormatter extends BaseFormatter {
  public readonly name: string = "Universal";
  public readonly priority: FormatterPriority = FormatterPriority.LOW;
  public readonly supportedLanguages: string[] = [];
  private readonly discoveredLanguages: Set<string> = new Set();
  private readonly providerCache: Map<string, boolean> = new Map();
  private scanPromise: Promise<void> | null = null;

  constructor(supportedLanguages: string[] = []) {
    super();
    this.supportedLanguages = supportedLanguages;
    this.initializeScanner();
  }

  /**
   * **初始化扫描器**
   */
  private initializeScanner(): void {
    this.scanPromise = this.scanAvailableFormatters();
  }

  /**
   * **扫描所有可用的格式化提供程序**
   */
  private async scanAvailableFormatters(): Promise<void> {
    const commonLanguages = this.getCommonLanguages();

    for (const languageId of commonLanguages) {
      try {
        const hasProvider = await this.detectFormatterProvider(languageId);
        this.providerCache.set(languageId, hasProvider);

        if (hasProvider) {
          this.discoveredLanguages.add(languageId);
        }
      } catch (error) {
        // 静默忽略扫描错误，继续扫描其他语言
        this.providerCache.set(languageId, false);
      }
    }
  }

  /**
   * **获取常见编程语言列表**
   */
  private getCommonLanguages(): string[] {
    return [
      // Web开发
      "javascript",
      "typescript",
      "html",
      "css",
      "scss",
      "sass",
      "less",
      "json",
      "jsonc",
      "xml",
      "yaml",
      "markdown",

      // 系统编程
      "c",
      "cpp",
      "csharp",
      "go",
      "rust",
      "java",
      "kotlin",
      "swift",

      // 脚本语言
      "python",
      "ruby",
      "php",
      "perl",
      "lua",
      "r",

      // 函数式语言
      "haskell",
      "scala",
      "erlang",
      "elixir",
      "fsharp",
      "ocaml",
      "clojure",

      // Shell和配置
      "shellscript",
      "bash",
      "zsh",
      "fish",
      "powershell",
      "dockerfile",
      "ini",
      "toml",
      "properties",
      "env",

      // 数据库
      "sql",
      "mysql",
      "postgresql",
      "sqlite",

      // 其他
      "dart",
      "vue",
      "svelte",
      "razor",
      "handlebars",
      "mustache",
      "latex",
      "bibtex",
      "makefile",
      "cmake",
      "gradle",
      "protobuf",
      "graphql",
      "prisma",
    ];
  }

  /**
   * **检测特定语言是否有格式化提供程序**
   */
  private async detectFormatterProvider(languageId: string): Promise<boolean> {
    try {
      // 创建临时文档URI
      const extension = this.getFileExtension(languageId);
      const tempUri = vscode.Uri.parse(
        `untitled:temp-${Date.now()}.${extension}`
      );

      // 尝试执行格式化命令
      const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
        "vscode.executeFormatDocumentProvider",
        tempUri,
        { insertSpaces: true, tabSize: 2 }
      );

      return edits !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * **获取所有已发现的支持格式化的语言**
   */
  async getDiscoveredLanguages(): Promise<string[]> {
    if (this.scanPromise) {
      await this.scanPromise;
    }
    return Array.from(this.discoveredLanguages);
  }

  /**
   * **检查语言是否被支持（包括动态发现的语言）**
   */
  async isLanguageSupported(languageId: string): Promise<boolean> {
    // 首先检查预定义的支持语言
    if (this.supportedLanguages.includes(languageId)) {
      return true;
    }

    // 等待扫描完成
    if (this.scanPromise) {
      await this.scanPromise;
    }

    // 检查缓存
    if (this.providerCache.has(languageId)) {
      return this.providerCache.get(languageId) || false;
    }

    // 动态检测新语言
    try {
      const hasProvider = await this.detectFormatterProvider(languageId);
      this.providerCache.set(languageId, hasProvider);

      if (hasProvider) {
        this.discoveredLanguages.add(languageId);
      }

      return hasProvider;
    } catch {
      this.providerCache.set(languageId, false);
      return false;
    }
  }

  /**
   * **重新扫描所有格式化提供程序**
   */
  async refreshLanguageSupport(): Promise<void> {
    this.discoveredLanguages.clear();
    this.providerCache.clear();
    this.scanPromise = this.scanAvailableFormatters();
    if (this.scanPromise) {
      await this.scanPromise;
    }
  }

  /**
   * **Add support for additional languages**
   */
  addLanguageSupport(languageIds: string[]): void {
    for (const languageId of languageIds) {
      if (!this.supportedLanguages.includes(languageId)) {
        this.supportedLanguages.push(languageId);
      }
    }
  }

  /**
   * **Format text using VS Code's built-in formatter**
   */
  public async format(
    text: string,
    options: FormatOptions
  ): Promise<FormatResult> {
    return this.formatText(text, options);
  }

  public getSupportedOptions(): FormatOptionDescriptor[] {
    return [
      {
        name: "tabSize",
        type: "number",
        default: 2,
        required: false,
        description: "Number of spaces used for indentation",
      },
      {
        name: "insertSpaces",
        type: "boolean",
        default: true,
        required: false,
        description: "Use spaces for indentation instead of tabs",
      },
    ];
  }

  public getVersion(): string {
    return "1.0.0";
  }

  async formatText(
    text: string,
    options: FormatOptions
  ): Promise<FormatResult> {
    try {
      // 首先检查是否支持该语言
      const isSupported = await this.isLanguageSupported(options.languageId);
      if (!isSupported) {
        return this.handleFormattingError(
          new Error(
            `No formatter provider found for language: ${options.languageId}`
          ),
          options
        );
      }

      const preprocessedText = this.preprocess(text, options);

      // **Create a temporary document for formatting**
      const tempUri = vscode.Uri.parse(
        `untitled:temp-${Date.now()}.${this.getFileExtension(options.languageId)}`
      );

      // **Create a text document with the content**
      const document = await vscode.workspace.openTextDocument({
        language: options.languageId,
        content: preprocessedText,
      });

      // **Try to execute built-in formatter**
      const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
        "vscode.executeFormatDocumentProvider",
        document.uri,
        {
          insertSpaces: options.insertSpaces !== false,
          tabSize: options.tabSize || 2,
        }
      );

      if (edits && edits.length > 0) {
        // **Apply edits to get formatted text**
        let formattedText = preprocessedText;

        // **Sort edits by position (reverse order for proper application)**
        const sortedEdits = edits.sort((a, b) => {
          const posA = a.range.start.line * 1000000 + a.range.start.character;
          const posB = b.range.start.line * 1000000 + b.range.start.character;
          return posB - posA; // Reverse order
        });

        for (const edit of sortedEdits) {
          const startOffset = this.getOffsetFromPosition(
            formattedText,
            edit.range.start
          );
          const endOffset = this.getOffsetFromPosition(
            formattedText,
            edit.range.end
          );

          formattedText =
            formattedText.substring(0, startOffset) +
            edit.newText +
            formattedText.substring(endOffset);
        }

        // **Post-process the result**
        const finalText = this.postprocess(formattedText, options);
        const normalizedText = this.normalizeIndentation(finalText, options);

        return this.createSuccessResult(normalizedText, edits.length);
      }

      // **No edits returned - document might already be formatted**
      const finalText = this.postprocess(preprocessedText, options);
      const normalizedText = this.normalizeIndentation(finalText, options);

      return this.createSuccessResult(normalizedText, 0);
    } catch (error) {
      return this.handleFormattingError(error, options);
    }
  }

  /**
   * **Handle formatting errors**
   */
  private handleFormattingError(
    error: unknown,
    options: FormatOptions
  ): FormatResult {
    const baseMessage =
      error instanceof Error ? error.message : "Unknown formatting error";
    const errorType = error instanceof Error ? error.constructor.name : "Error";

    let enhancedMessage = `Universal Formatter Error (${errorType}): ${baseMessage}`;
    enhancedMessage += `\nLanguage: ${options.languageId}`;

    // **Add specific error suggestions**
    if (
      baseMessage.includes("No provider") ||
      baseMessage.includes("No formatter")
    ) {
      enhancedMessage += `\nNo built-in formatter provider found for ${options.languageId}.`;
      enhancedMessage += `\nSuggestions:`;
      enhancedMessage += `\n  - Install a formatter extension for ${options.languageId}`;
      enhancedMessage += `\n  - Check if the language ID is correct`;
      enhancedMessage += `\n  - Enable format on save for this language`;
    } else if (baseMessage.includes("timeout")) {
      enhancedMessage += `\nFormatter timed out. Try again or check your configuration.`;
    }

    const formattingError = new FormatError(
      enhancedMessage,
      options.languageId,
      error instanceof Error ? error : undefined
    );

    return this.createErrorResult(formattingError);
  }

  /**
   * **Get file extension for language ID**
   */
  private getFileExtension(languageId: string): string {
    const extensionMap: Record<string, string> = {
      // Web开发
      javascript: "js",
      typescript: "ts",
      html: "html",
      css: "css",
      scss: "scss",
      sass: "sass",
      less: "less",
      json: "json",
      jsonc: "jsonc",
      xml: "xml",
      yaml: "yaml",
      yml: "yml",
      markdown: "md",

      // 系统编程
      python: "py",
      java: "java",
      csharp: "cs",
      cpp: "cpp",
      c: "c",
      go: "go",
      rust: "rs",
      swift: "swift",
      kotlin: "kt",
      scala: "scala",

      // 脚本语言
      php: "php",
      ruby: "rb",
      perl: "pl",
      lua: "lua",
      r: "r",

      // 函数式语言
      haskell: "hs",
      erlang: "erl",
      elixir: "ex",
      fsharp: "fs",
      ocaml: "ml",
      clojure: "clj",

      // Shell和配置
      shellscript: "sh",
      bash: "sh",
      zsh: "zsh",
      fish: "fish",
      powershell: "ps1",
      dockerfile: "dockerfile",
      ini: "ini",
      toml: "toml",
      properties: "properties",
      env: "env",

      // 数据库
      sql: "sql",
      mysql: "sql",
      postgresql: "sql",
      sqlite: "sql",

      // 其他
      dart: "dart",
      vue: "vue",
      svelte: "svelte",
      razor: "razor",
      handlebars: "hbs",
      mustache: "mustache",
      latex: "tex",
      bibtex: "bib",
      makefile: "mk",
      cmake: "cmake",
      gradle: "gradle",
      protobuf: "proto",
      graphql: "graphql",
      prisma: "prisma",
    };

    return extensionMap[languageId] || "txt";
  }

  /**
   * **Convert position to offset in text**
   */
  private getOffsetFromPosition(
    text: string,
    position: vscode.Position
  ): number {
    const lines = text.split("\n");
    let offset = 0;

    for (let i = 0; i < position.line && i < lines.length; i++) {
      offset += lines[i].length + 1; // +1 for newline character
    }

    return offset + position.character;
  }

  /**
   * **Check if this formatter can handle a language by trying to detect a provider**
   */
  async canFormatLanguage(languageId: string): Promise<boolean> {
    return await this.isLanguageSupported(languageId);
  }

  /**
   * **获取格式化统计信息**
   */
  async getFormattingStats(): Promise<{
    totalLanguages: number;
    supportedLanguages: string[];
    discoveredLanguages: string[];
    cachedResults: number;
  }> {
    if (this.scanPromise) {
      await this.scanPromise;
    }

    return {
      totalLanguages: this.getCommonLanguages().length,
      supportedLanguages: [...this.supportedLanguages],
      discoveredLanguages: Array.from(this.discoveredLanguages),
      cachedResults: this.providerCache.size,
    };
  }

  /**
   * **清除缓存**
   */
  clearCache(): void {
    this.providerCache.clear();
    this.discoveredLanguages.clear();
  }

  public async validateSyntax(
    content: string,
    languageId: string
  ): Promise<ValidationResult> {
    // Universal formatter doesn't provide syntax validation
    return {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
      executionTime: 0,
    };
  }
}
