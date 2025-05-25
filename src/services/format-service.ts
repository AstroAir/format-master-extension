import * as vscode from 'vscode';
import { 
  IFormatService, 
  IFormatter, 
  ILoggingService, 
  ExtendedFormatOptions,
  FormattingError,
  UnsupportedLanguageError,
  FormatOptions,
  FormatterIntegrationOptions,
  FormatterPriority
} from '../types';
import { FormatterIntegrationService } from './formatter-integration-service';

/**
 * **Enhanced format service with built-in formatter integration**
 */
export class FormatService implements IFormatService {
  private formatters = new Map<string, IFormatter>();
  private integrationService: FormatterIntegrationService;

  constructor(private loggingService: ILoggingService) {
    this.integrationService = new FormatterIntegrationService(loggingService);
  }
  /**
   * **Register a formatter for specific languages**
   */
  registerFormatter(formatter: IFormatter): void {
    try {
      for (const languageId of formatter.supportedLanguages) {
        this.formatters.set(languageId, formatter);
        this.loggingService.debug(`Registered formatter for language: ${languageId}`);
      }
      
      // **For Universal Formatter, also register discovered languages**
      if ('getDiscoveredLanguages' in formatter) {
        const universalFormatter = formatter as any;
        universalFormatter.getDiscoveredLanguages().then((languages: string[]) => {
          for (const languageId of languages) {
            if (!this.formatters.has(languageId)) {
              this.formatters.set(languageId, formatter);
              this.loggingService.debug(`Auto-registered formatter for discovered language: ${languageId}`);
            }
          }
        }).catch((error: any) => {
          this.loggingService.warn('Failed to get discovered languages from Universal Formatter', error);
        });
      }
    } catch (error) {
      this.loggingService.error('Failed to register formatter', error);
      throw error;
    }
  }

  /**
   * **Get formatter for a specific language**
   */
  getFormatter(languageId: string): IFormatter | undefined {
    return this.formatters.get(languageId);
  }

  /**
   * **动态检查语言支持并自动注册**
   */
  async checkLanguageSupport(languageId: string): Promise<boolean> {
    // 检查是否已有注册的格式化程序
    if (this.formatters.has(languageId)) {
      return true;
    }

    // 寻找能够处理该语言的Universal Formatter
    for (const [, formatter] of this.formatters) {
      if ('isLanguageSupported' in formatter) {
        const universalFormatter = formatter as any;
        try {
          const isSupported = await universalFormatter.isLanguageSupported(languageId);
          if (isSupported) {
            // 自动注册该语言
            this.formatters.set(languageId, formatter);
            this.loggingService.debug(`Auto-registered language support: ${languageId}`);
            return true;
          }
        } catch (error) {
          this.loggingService.warn(`Failed to check language support for ${languageId}`, error);
        }
      }
    }

    return false;
  }

  /**
   * **获取当前已知支持的语言列表（同步版本，符合接口要求）**
   */
  getSupportedLanguages(): string[] {
    const languages = new Set<string>();
    
    // 添加已注册的自定义格式化程序语言
    for (const languageId of this.formatters.keys()) {
      languages.add(languageId);
    }

    // 添加内置格式化程序支持的语言（同步获取）
    try {
      const builtInLanguages = Array.from(this.integrationService['builtInFormatters'].keys())
        .filter(lang => this.integrationService.hasBuiltInFormatter(lang));
      for (const languageId of builtInLanguages) {
        languages.add(languageId);
      }
    } catch (error) {
      this.loggingService.warn('Failed to get built-in formatter languages', error);
    }

    return Array.from(languages).sort();
  }

  /**
   * **获取所有支持的语言列表（包括动态发现的语言，异步版本）**
   */
  async getExtendedSupportedLanguages(): Promise<string[]> {
    const languages = new Set<string>();
    
    // 添加当前已知的语言
    const knownLanguages = this.getSupportedLanguages();
    for (const languageId of knownLanguages) {
      languages.add(languageId);
    }

    // 添加Universal Formatter发现的语言
    for (const [, formatter] of this.formatters) {
      if ('getDiscoveredLanguages' in formatter) {
        const universalFormatter = formatter as any;
        try {
          const discoveredLanguages = await universalFormatter.getDiscoveredLanguages();
          for (const languageId of discoveredLanguages) {
            languages.add(languageId);
          }
        } catch (error) {
          this.loggingService.warn('Failed to get discovered languages', error);
        }
      }
    }

    return Array.from(languages).sort();
  }

  /**
   * **刷新语言支持（重新扫描）**
   */
  async refreshLanguageSupport(): Promise<void> {
    for (const [, formatter] of this.formatters) {
      if ('refreshLanguageSupport' in formatter) {
        const universalFormatter = formatter as any;
        try {
          await universalFormatter.refreshLanguageSupport();
          this.loggingService.debug('Refreshed language support for Universal Formatter');
        } catch (error) {
          this.loggingService.warn('Failed to refresh language support', error);
        }
      }
    }
  }

  /**
   * **Enhanced format document with integration support**
   */
  async formatDocument(
    document: vscode.TextDocument, 
    options?: FormatOptions | ExtendedFormatOptions
  ): Promise<vscode.TextEdit[]> {
    return this.executeFormattingWithIntegration(document, options);
  }

  /**
   * **Enhanced format range with integration support**
   */
  async formatRange(
    document: vscode.TextDocument, 
    range: vscode.Range, 
    options?: FormatOptions | ExtendedFormatOptions
  ): Promise<vscode.TextEdit[]> {
    return this.executeFormattingWithIntegration(document, options, range);
  }

  /**
   * **Execute formatting with built-in formatter integration**
   */
  private async executeFormattingWithIntegration(
    document: vscode.TextDocument,
    options?: FormatOptions | ExtendedFormatOptions,
    range?: vscode.Range
  ): Promise<vscode.TextEdit[]> {
    try {
      this.loggingService.debug(
        `Formatting ${range ? 'range' : 'document'}: ${document.fileName} (${document.languageId})`
      );

      const extendedOptions = this.ensureExtendedOptions(options, document);
      const integration = extendedOptions.integration!;

      // **Determine formatting strategy**
      const strategy = await this.determineFormattingStrategy(document.languageId, integration);
      this.loggingService.debug(`Using formatting strategy: ${strategy}`);

      switch (strategy) {
        case 'builtin-only':
          return await this.executeBuiltInOnly(document, range, extendedOptions);
          
        case 'custom-only':
          return await this.executeCustomOnly(document, range, extendedOptions);
          
        case 'custom-with-builtin-fallback':
          return await this.executeCustomWithFallback(document, range, extendedOptions);
          
        case 'builtin-then-custom':
          return await this.executeBuiltInThenCustom(document, range, extendedOptions);
          
        case 'custom-then-builtin':
          return await this.executeCustomThenBuiltIn(document, range, extendedOptions);
          
        default:
          throw new FormattingError(`Unknown formatting strategy: ${strategy}`, document.languageId);
      }

    } catch (error) {
      if (error instanceof FormattingError) {
        this.loggingService.error('Formatting error', error);
        throw error;
      }
      
      const formattingError = new FormattingError(
        `Unexpected error during formatting: ${error instanceof Error ? error.message : 'Unknown error'}`,
        document.languageId,
        error instanceof Error ? error : undefined
      );
      
      this.loggingService.error('Unexpected formatting error', formattingError);
      throw formattingError;
    }
  }

  /**
   * **Determine the best formatting strategy**
   */
  private async determineFormattingStrategy(
    languageId: string, 
    integration: NonNullable<ExtendedFormatOptions['integration']> // integration is now non-nullable here
  ): Promise<string> {
    const hasCustomFormatter = this.formatters.has(languageId);
    const hasBuiltInFormatter = this.integrationService.hasBuiltInFormatter(languageId);

    // **Handle explicit preferences**
    if (integration?.preferredFormatter === 'builtin' && hasBuiltInFormatter) {
      return hasCustomFormatter && integration.fallbackToBuiltIn ? 'builtin-with-custom-fallback' : 'builtin-only';
    }

    if (integration?.preferredFormatter === 'formatMaster' && hasCustomFormatter) {
      return hasBuiltInFormatter && integration.fallbackToBuiltIn ? 'custom-with-builtin-fallback' : 'custom-only';
    }

    // **Handle chaining**
    if (integration?.chainFormatters && hasBuiltInFormatter && hasCustomFormatter) {
      return 'builtin-then-custom';
    }

    // **Auto mode - choose best available**
    if (integration?.preferredFormatter === 'auto' || !integration?.preferredFormatter) {
      if (hasCustomFormatter && hasBuiltInFormatter) {
        return integration?.fallbackToBuiltIn ? 'custom-with-builtin-fallback' : 'custom-only';
      } else if (hasCustomFormatter) {
        return 'custom-only';
      } else if (hasBuiltInFormatter) {
        return 'builtin-only';
      }
    }

    // **Fallback**
    if (hasCustomFormatter) {
      return 'custom-only';
    } else if (hasBuiltInFormatter && integration?.useBuiltInFormatter) {
      return 'builtin-only';
    }

    throw new UnsupportedLanguageError(languageId);
  }

  /**
   * **Execute built-in formatter only**
   */
  private async executeBuiltInOnly(
    document: vscode.TextDocument,
    range: vscode.Range | undefined,
    options: ExtendedFormatOptions
  ): Promise<vscode.TextEdit[]> {
    this.loggingService.debug('Executing built-in formatter only');
    
    const formatOptions = this.createVSCodeFormatOptions(options);
    return await this.integrationService.executeBuiltInFormatter(document, range, formatOptions);
  }

  /**
   * **Execute custom formatter only**
   */
  private async executeCustomOnly(
    document: vscode.TextDocument,
    range: vscode.Range | undefined,
    options: ExtendedFormatOptions
  ): Promise<vscode.TextEdit[]> {
    this.loggingService.debug('Executing custom formatter only');
    
    const formatter = this.getFormatter(document.languageId);
    if (!formatter) {
      throw new UnsupportedLanguageError(document.languageId);
    }

    const text = range ? document.getText(range) : document.getText();
    const result = await formatter.formatText(text, options);

    if (!result.success || !result.text) {
      throw new FormattingError(
        result.error?.message || 'Custom formatting failed',
        document.languageId,
        result.error
      );
    }

    if (result.text !== text) {
      const editRange = range || new vscode.Range(
        document.positionAt(0),
        document.positionAt(text.length)
      );
      
      return [vscode.TextEdit.replace(editRange, result.text)];
    }

    return [];
  }

  /**
   * **Execute custom formatter with built-in fallback**
   */
  private async executeCustomWithFallback(
    document: vscode.TextDocument,
    range: vscode.Range | undefined,
    options: ExtendedFormatOptions
  ): Promise<vscode.TextEdit[]> {
    this.loggingService.debug('Executing custom formatter with built-in fallback');
    
    try {
      return await this.executeCustomOnly(document, range, options);
    } catch (error) {
      this.loggingService.warn('Custom formatter failed, falling back to built-in', error);
      
      if (this.integrationService.hasBuiltInFormatter(document.languageId)) {
        return await this.executeBuiltInOnly(document, range, options);
      }
      
      throw error;
    }
  }

  /**
   * **Execute built-in formatter then custom**
   */
  private async executeBuiltInThenCustom(
    document: vscode.TextDocument,
    range: vscode.Range | undefined,
    options: ExtendedFormatOptions
  ): Promise<vscode.TextEdit[]> {
    this.loggingService.debug('Executing chained formatting: built-in then custom');
    
    const result = await this.integrationService.executeChainedFormatting(
      document,
      async (doc, opts) => await this.executeCustomOnly(doc, range, this.ensureExtendedOptions(opts, doc)),
      options,
      range
    );

    if (!result.success) {
      throw new FormattingError(
        result.error?.message || 'Chained formatting failed',
        document.languageId,
        result.error
      );
    }

    // **The chained formatting applies edits directly, so we return empty array**
    // **to prevent double application**
    return [];
  }

  /**
   * **Execute custom formatter then built-in**
   */
  private async executeCustomThenBuiltIn(
    document: vscode.TextDocument,
    range: vscode.Range | undefined,
    options: ExtendedFormatOptions
  ): Promise<vscode.TextEdit[]> {
    this.loggingService.debug('Executing custom formatter then built-in');
    
    // **First apply custom formatting**
    let edits = await this.executeCustomOnly(document, range, options);
    
    if (edits.length > 0) {
      // **Apply custom edits**
      const workspaceEdit = new vscode.WorkspaceEdit();
      workspaceEdit.set(document.uri, edits);
      await vscode.workspace.applyEdit(workspaceEdit);
      
      // **Then apply built-in formatting to the result**
      const builtInEdits = await this.executeBuiltInOnly(document, range, options);
      edits.push(...builtInEdits);
    } else {
      // **If no custom changes, just use built-in**
      edits = await this.executeBuiltInOnly(document, range, options);
    }
    
    return edits;
  }

  /**
   * **Ensure options are in ExtendedFormatOptions format**
   */
  private ensureExtendedOptions(
    options: FormatOptions | ExtendedFormatOptions | undefined,
    document: vscode.TextDocument
  ): ExtendedFormatOptions {
    const editorConfigOptions = this.getDocumentOptions(document);

    // Start with base properties and apply overrides from options
    // The type assertion here helps TypeScript understand the shape before 'integration' is conditionally added.
    const combinedOptions = {
        languageId: document.languageId, // Must be present
        tabSize: editorConfigOptions.tabSize,
        insertSpaces: editorConfigOptions.insertSpaces,
        ...(options || {}), // Spread all fields from options. This will include 'integration' if options is ExtendedFormatOptions.
    } as Partial<ExtendedFormatOptions> & { languageId: string };


    // Ensure integration options are present
    // If ExtendedFormatOptions defines 'integration' as optional, this assignment is fine.
    // If 'integration' is non-optional, this ensures it's set.
    if (!combinedOptions.integration) {
      const config = vscode.workspace.getConfiguration('formatMaster');
      
      combinedOptions.integration = {
        useBuiltInFormatter: config.get<boolean>('useBuiltInFormatter', true),
        fallbackToBuiltIn: config.get<boolean>('fallbackToBuiltIn', true),
        preferredFormatter: config.get<'formatMaster' | 'builtin' | 'auto'>('preferredFormatter', 'auto'),
        chainFormatters: config.get<boolean>('chainFormatters', false),
        retryOnFailure: config.get<boolean>('retryOnFailure', true)
      };
    }

    // At this point, combinedOptions has all FormatOptions fields and a defined integration field.
    // So it should conform to ExtendedFormatOptions.
    return combinedOptions as ExtendedFormatOptions;
  }

  /**
   * **Create VSCode formatting options**
   */
  private createVSCodeFormatOptions(options: ExtendedFormatOptions): vscode.FormattingOptions {
    return {
      tabSize: options?.tabSize || options?.indentSize || 2,
      insertSpaces: options?.insertSpaces ?? !options?.useTabs
    };
  }

  /**
   * **Get document-specific formatting options**
   */
  private getDocumentOptions(document: vscode.TextDocument): Partial<FormatOptions> {
    const editorConfig = vscode.workspace.getConfiguration('editor', document.uri);
    
    return {
      tabSize: editorConfig.get<number>('tabSize', 2),
      insertSpaces: editorConfig.get<boolean>('insertSpaces', true)
    };
  }

  /**
   * **Check if a language is supported (including built-in formatters)**
   */
  isLanguageSupported(languageId: string): boolean {
    return this.formatters.has(languageId) || this.integrationService.hasBuiltInFormatter(languageId);
  }

  /**
   * **获取所有动态发现的语言**
   */
  async getDiscoveredLanguages(): Promise<string[]> {
    const discoveredLanguages = new Set<string>();
    
    // 从Universal Formatter获取已发现的语言
    for (const [, formatter] of this.formatters) {
      if ('getDiscoveredLanguages' in formatter) {
        const universalFormatter = formatter as any;
        try {
          const languages = await universalFormatter.getDiscoveredLanguages();
          for (const languageId of languages) {
            discoveredLanguages.add(languageId);
          }
        } catch (error) {
          this.loggingService.warn('Failed to get discovered languages', error);
        }
      }
    }    return Array.from(discoveredLanguages).sort();
  }

  /**
   * **Get integration service for external access**
   */
  getIntegrationService(): FormatterIntegrationService {
    return this.integrationService;
  }

  /**
   * **Smart format document - automatically determines best formatter**
   */
  async smartFormatDocument(
    document: vscode.TextDocument, 
    options?: FormatOptions
  ): Promise<vscode.TextEdit[]> {
    const languageId = document.languageId;
    
    try {
      // **First, check dynamic language support**
      const isSupported = await this.checkLanguageSupport(languageId);
      if (!isSupported) {
        // **Try to refresh formatter detection for this language**
        this.loggingService.debug(`Refreshing formatter detection for ${languageId}`);
        await this.integrationService.detectBuiltInFormatter(languageId);
      }

      // **Create extended options with smart defaults**
      const extendedOptions = this.createSmartFormattingOptions(options, document);
      
      // **Use existing format document logic with enhanced options**
      return await this.formatDocument(document, extendedOptions);

    } catch (error) {
      if (error instanceof UnsupportedLanguageError) {
        // **Try to find alternative formatters**
        const alternativeEdits = await this.tryAlternativeFormatters(document, options);
        if (alternativeEdits.length > 0) {
          return alternativeEdits;
        }
        
        // **Suggest installing relevant extensions**
        await this.suggestFormatterExtensions(languageId);
        throw error;
      }
      throw error;
    }
  }

  /**
   * **Create smart formatting options based on document and context**
   */
  private createSmartFormattingOptions(
    options: FormatOptions | undefined,
    document: vscode.TextDocument
  ): ExtendedFormatOptions {
    const hasCustomFormatter = this.formatters.has(document.languageId);
    const hasBuiltInFormatter = this.integrationService.hasBuiltInFormatter(document.languageId);
    
    // **Smart defaults based on available formatters**
    const smartIntegration: FormatterIntegrationOptions = {
      useBuiltInFormatter: true,
      fallbackToBuiltIn: true,
      preferredFormatter: hasCustomFormatter ? 'formatMaster' : hasBuiltInFormatter ? 'builtin' : 'auto',
      chainFormatters: hasCustomFormatter && hasBuiltInFormatter,
      retryOnFailure: true
    };

    return {
      ...this.ensureExtendedOptions(options, document),
      integration: smartIntegration,
      priority: FormatterPriority.NORMAL,
      timeout: 30000, // 30 seconds timeout
      retryCount: 1
    };
  }

  /**
   * **Try alternative formatters when primary ones fail**
   */
  private async tryAlternativeFormatters(
    document: vscode.TextDocument,
    options?: FormatOptions
  ): Promise<vscode.TextEdit[]> {
    const languageId = document.languageId;
    
    // **Check for similar language formatters**
    const similarLanguages = this.getSimilarLanguages(languageId);
    
    for (const similarLang of similarLanguages) {
      if (this.formatters.has(similarLang)) {
        this.loggingService.debug(`Trying formatter for similar language: ${similarLang}`);
        
        try {
          const formatter = this.formatters.get(similarLang)!;
          const text = document.getText();
          const result = await formatter.formatText(text, options || {
            languageId: similarLang,
            tabSize: 2,
            useTabs: false
          });
          
          if (result.success && result.text) {
            const fullRange = new vscode.Range(
              document.positionAt(0),
              document.positionAt(document.getText().length)
            );
            return [vscode.TextEdit.replace(fullRange, result.text)];
          }
        } catch (error) {
          this.loggingService.debug(`Alternative formatter ${similarLang} failed:`, error);
          continue;
        }
      }
    }
    
    return [];
  }

  /**
   * **Get similar languages for fallback formatting**
   */
  private getSimilarLanguages(languageId: string): string[] {
    const languageFamilies: Record<string, string[]> = {
      javascript: ['typescript', 'javascriptreact', 'typescriptreact'],
      typescript: ['javascript', 'javascriptreact', 'typescriptreact'],
      javascriptreact: ['javascript', 'typescript', 'typescriptreact'],
      typescriptreact: ['typescript', 'javascript', 'javascriptreact'],
      html: ['xml', 'xhtml'],
      xml: ['html', 'xhtml'],
      css: ['scss', 'less'],
      scss: ['css', 'less'],
      less: ['css', 'scss'],
      yaml: ['yml'],
      yml: ['yaml'],
      c: ['cpp'],
      cpp: ['c'],
      json: ['jsonc'],
      jsonc: ['json']
    };
    
    return languageFamilies[languageId] || [];
  }

  /**
   * **Suggest relevant formatter extensions**
   */
  private async suggestFormatterExtensions(languageId: string): Promise<void> {
    const extensionSuggestions: Record<string, { name: string; id: string }> = {
      python: { name: "Python", id: "ms-python.python" },
      java: { name: "Extension Pack for Java", id: "vscjava.vscode-java-pack" },
      csharp: { name: "C#", id: "ms-dotnettools.csharp" },
      go: { name: "Go", id: "golang.go" },
      rust: { name: "Rust Analyzer", id: "rust-lang.rust-analyzer" },
      php: { name: "PHP Intelephense", id: "bmewburn.vscode-intelephense-client" },
      ruby: { name: "Ruby", id: "rebornix.ruby" },
      swift: { name: "Swift", id: "swift-server.swift" },
      kotlin: { name: "Kotlin", id: "mathiasfrohlich.kotlin" },
      scala: { name: "Metals", id: "scalameta.metals" },
      r: { name: "R", id: "ikuyadeu.r" },
      lua: { name: "Lua", id: "sumneko.lua" },
      powershell: { name: "PowerShell", id: "ms-vscode.powershell" },
      shellscript: { name: "ShellCheck", id: "timonwong.shellcheck" },
      dockerfile: { name: "Docker", id: "ms-azuretools.vscode-docker" },
      sql: { name: "SQL Server (mssql)", id: "ms-mssql.mssql" }
    };

    const suggestion = extensionSuggestions[languageId];
    if (suggestion) {
      const action = await vscode.window.showInformationMessage(
        `No formatter found for ${languageId}. Would you like to install the ${suggestion.name} extension?`,
        'Install', 'Not now'
      );
      
      if (action === 'Install') {
        vscode.commands.executeCommand('extension.open', suggestion.id);
      }
    } else {
      vscode.window.showInformationMessage(
        `No formatter available for ${languageId}. Consider installing a relevant extension from the marketplace.`
      );
    }
  }
}