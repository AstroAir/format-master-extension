import * as vscode from "vscode";
import {
  ILoggingService,
  BuiltInFormatterInfo,
  ExtendedFormatOptions,
  FormatterExecutionResult,
  FormatterIntegrationOptions,
  FormatterPriority,
} from "../types";

/**
 * **Service for integrating with existing VSCode formatters**
 */
export class FormatterIntegrationService {
  private builtInFormatters = new Map<string, BuiltInFormatterInfo>();
  private formatterCache = new Map<
    string,
    vscode.DocumentFormattingEditProvider[]
  >();

  constructor(private loggingService: ILoggingService) {
    this.initializeFormatterDetection();
  }

  /**
   * **Initialize detection of built-in formatters**
   */
  private async initializeFormatterDetection(): Promise<void> {
    try {
      // **Detect formatters for common languages**
      const languages = [
        "javascript",
        "typescript",
        "json",
        "html",
        "css",
        "xml",
      ];

      for (const languageId of languages) {
        await this.detectBuiltInFormatter(languageId);
      }

      this.loggingService.info("🔍 Formatter detection completed");
    } catch (error) {
      this.loggingService.error(
        "Failed to initialize formatter detection",
        error
      );
    }
  }

  /**
   * **Detect built-in formatter for a specific language**
   */
  async detectBuiltInFormatter(
    languageId: string
  ): Promise<BuiltInFormatterInfo> {
    try {
      // **Check if formatter is cached**
      if (this.builtInFormatters.has(languageId)) {
        return this.builtInFormatters.get(languageId)!;
      }

      // **Create a temporary document to test formatting**
      const tempUri = vscode.Uri.parse(
        `untitled:temp.${this.getFileExtension(languageId)}`
      );
      const tempContent = this.getTestContent(languageId);

      // **Try to get formatting edits**
      const formattingEdits = await vscode.commands.executeCommand<
        vscode.TextEdit[]
      >("vscode.executeFormatDocumentProvider", tempUri, {
        insertSpaces: true,
        tabSize: 2,
      });

      const formatterInfo: BuiltInFormatterInfo = {
        available: formattingEdits !== undefined && formattingEdits.length >= 0,
        supportsRange: await this.testRangeFormatting(languageId),
      };

      // **Try to identify the specific formatter**
      if (formatterInfo.available) {
        formatterInfo.extension =
          await this.identifyFormatterExtension(languageId);
      }

      this.builtInFormatters.set(languageId, formatterInfo);
      this.loggingService.debug(
        `Built-in formatter for ${languageId}: ${formatterInfo.available ? "available" : "not available"}`
      );

      return formatterInfo;
    } catch (error) {
      this.loggingService.error(
        `Failed to detect formatter for ${languageId}`,
        error
      );

      const fallbackInfo: BuiltInFormatterInfo = {
        available: false,
        supportsRange: false,
      };

      this.builtInFormatters.set(languageId, fallbackInfo);
      return fallbackInfo;
    }
  }

  /**
   * **Test if range formatting is supported**
   */
  private async testRangeFormatting(languageId: string): Promise<boolean> {
    try {
      const tempUri = vscode.Uri.parse(
        `untitled:temp.${this.getFileExtension(languageId)}`
      );
      const range = new vscode.Range(0, 0, 0, 10);

      const rangeEdits = await vscode.commands.executeCommand<
        vscode.TextEdit[]
      >("vscode.executeFormatRangeProvider", tempUri, range, {
        insertSpaces: true,
        tabSize: 2,
      });

      return rangeEdits !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * **Attempt to identify the formatter extension**
   */
  private async identifyFormatterExtension(
    languageId: string
  ): Promise<string | undefined> {
    // **Check common formatter extensions**
    const commonFormatters = {
      javascript: [
        "esbenp.prettier-vscode",
        "ms-vscode.vscode-typescript-next",
      ],
      typescript: [
        "esbenp.prettier-vscode",
        "ms-vscode.vscode-typescript-next",
      ],
      json: ["esbenp.prettier-vscode", "ms-vscode.json"],
      html: ["esbenp.prettier-vscode", "ms-vscode.html"],
      css: ["esbenp.prettier-vscode", "ms-vscode.css"],
      xml: ["redhat.vscode-xml"],
    };

    const possibleFormatters =
      commonFormatters[languageId as keyof typeof commonFormatters] || [];

    for (const formatterId of possibleFormatters) {
      const extension = vscode.extensions.getExtension(formatterId);
      if (extension?.isActive) {
        return formatterId;
      }
    }

    return undefined;
  }

  /**
   * **Execute built-in formatter**
   */
  async executeBuiltInFormatter(
    document: vscode.TextDocument,
    range?: vscode.Range,
    options?: vscode.FormattingOptions
  ): Promise<vscode.TextEdit[]> {
    try {
      const startTime = Date.now();

      let edits: vscode.TextEdit[] | undefined;

      if (range) {
        edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
          "vscode.executeFormatRangeProvider",
          document.uri,
          range,
          options || { insertSpaces: true, tabSize: 2 }
        );
      } else {
        edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
          "vscode.executeFormatDocumentProvider",
          document.uri,
          options || { insertSpaces: true, tabSize: 2 }
        );
      }

      const executionTime = Date.now() - startTime;
      this.loggingService.debug(
        `Built-in formatter executed in ${executionTime}ms`
      );

      return edits || [];
    } catch (error) {
      this.loggingService.error("Built-in formatter execution failed", error);
      throw error;
    }
  }

  /**
   * **Execute chained formatting (built-in first, then custom)**
   */
  async executeChainedFormatting(
    document: vscode.TextDocument,
    customFormatFunction: (
      doc: vscode.TextDocument,
      opts?: ExtendedFormatOptions
    ) => Promise<vscode.TextEdit[]>,
    options?: ExtendedFormatOptions,
    range?: vscode.Range
  ): Promise<FormatterExecutionResult> {
    const startTime = Date.now();
    let totalEdits: vscode.TextEdit[] = [];
    let formatterUsed: "formatMaster" | "builtin" | "chained" = "formatMaster";

    try {
      const builtInInfo = await this.detectBuiltInFormatter(
        document.languageId
      );

      // **Step 1: Try built-in formatter first if available**
      if (builtInInfo.available && options?.integration?.chainFormatters) {
        this.loggingService.debug(
          "Executing built-in formatter first in chain"
        );

        try {
          const builtInEdits = await this.executeBuiltInFormatter(
            document,
            range
          );

          if (builtInEdits.length > 0) {
            // **Apply built-in edits to create intermediate document**
            const workspaceEdit = new vscode.WorkspaceEdit();
            workspaceEdit.set(document.uri, builtInEdits);

            const applied = await vscode.workspace.applyEdit(workspaceEdit);
            if (applied) {
              totalEdits.push(...builtInEdits);
              formatterUsed = "chained";
              this.loggingService.debug(
                `Applied ${builtInEdits.length} built-in formatting edits`
              );
            }
          }
        } catch (error) {
          this.loggingService.warn(
            "Built-in formatter failed in chain, continuing with custom formatter",
            error
          );
        }
      }

      // **Step 2: Apply custom formatting**
      try {
        const customEdits = await customFormatFunction(document, options);

        if (customEdits.length > 0) {
          totalEdits.push(...customEdits);

          if (formatterUsed !== "chained") {
            formatterUsed = "formatMaster";
          }

          this.loggingService.debug(
            `Applied ${customEdits.length} custom formatting edits`
          );
        }
      } catch (error) {
        if (formatterUsed === "formatMaster") {
          // **If custom formatter fails and no built-in was used, try built-in as fallback**
          if (
            builtInInfo.available &&
            options?.integration?.fallbackToBuiltIn
          ) {
            this.loggingService.info(
              "Custom formatter failed, falling back to built-in formatter"
            );

            const fallbackEdits = await this.executeBuiltInFormatter(
              document,
              range
            );
            totalEdits = fallbackEdits;
            formatterUsed = "builtin";
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        text: undefined, // **Text will be applied via edits**
        changes: totalEdits.length,
        formatterUsed,
        executionTime,
        builtInFormatterInfo: builtInInfo,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      return {
        success: false,
        error:
          error instanceof Error
            ? error
            : new Error("Unknown formatting error"),
        formatterUsed,
        executionTime,
        builtInFormatterInfo: await this.detectBuiltInFormatter(
          document.languageId
        ),
      };
    }
  }

  /**
   * **Get file extension for language ID**
   */
  private getFileExtension(languageId: string): string {
    const extensions: Record<string, string> = {
      javascript: "js",
      typescript: "ts",
      json: "json",
      html: "html",
      css: "css",
      xml: "xml",
    };

    return extensions[languageId] || "txt";
  }

  /**
   * **Get test content for formatter detection**
   */
  private getTestContent(languageId: string): string {
    const testContent: Record<string, string> = {
      javascript: 'function test(){return "hello";}',
      typescript: 'function test():string{return "hello";}',
      json: '{"name":"test","value":123}',
      html: "<div><p>Hello</p></div>",
      css: "body{margin:0;padding:0;}",
      xml: "<root><item>test</item></root>",
    };

    return testContent[languageId] || "test content";
  }

  /**
   * **Get formatter info for language**
   */
  getFormatterInfo(languageId: string): BuiltInFormatterInfo | undefined {
    return this.builtInFormatters.get(languageId);
  }

  /**
   * **Check if built-in formatter is available**
   */
  hasBuiltInFormatter(languageId: string): boolean {
    const info = this.builtInFormatters.get(languageId);
    return info?.available === true;
  }

  /**
   * **Clear formatter cache**
   */
  clearCache(): void {
    this.builtInFormatters.clear();
    this.formatterCache.clear();
    this.loggingService.debug("Formatter cache cleared");
  }
}
