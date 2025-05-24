import * as vscode from 'vscode';
import { 
  IFormatService, 
  IFormatter, 
  ILoggingService, 
  ExtendedFormatOptions,
  FormattingError,
  UnsupportedLanguageError,
  FormatOptions
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
   * **Get all supported languages (including built-in formatters)**
   */
  getSupportedLanguages(): string[] {
    const customLanguages = Array.from(this.formatters.keys());
    const builtInLanguages = Array.from(this.integrationService['builtInFormatters'].keys())
      .filter(lang => this.integrationService.hasBuiltInFormatter(lang));
    
    return [...new Set([...customLanguages, ...builtInLanguages])];
  }

  /**
   * **Get integration service for external access**
   */
  getIntegrationService(): FormatterIntegrationService {
    return this.integrationService;
  }
}