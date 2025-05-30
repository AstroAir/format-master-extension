import * as vscode from "vscode";
import {
  ILoggingService,
  BuiltInFormatterInfo,
  ExtendedFormatOptions,
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
      // **Detect formatters for all supported languages**
      const languages = [
        // **JavaScript/TypeScript family**
        "javascript",
        "typescript",
        "javascriptreact",
        "typescriptreact",
        // **Web technologies**
        "html",
        "css",
        "scss",
        "less",
        "json",
        "jsonc",
        "xml",
        // **Programming languages**
        "python",
        "java",
        "csharp",
        "cpp",
        "c",
        "go",
        "rust",
        "php",
        // **Markup and data**
        "markdown",
        "yaml",
        "yml",
        "toml",
        "ini",
        // **Shell and config**
        "powershell",
        "shellscript",
        "dockerfile",
        "sql",
        // **Other popular languages**
        "ruby",
        "perl",
        "swift",
        "kotlin",
        "scala",
        "r",
        "lua",
      ];

      // **Parallel detection for better performance**
      const detectionPromises = languages.map((lang) =>
        this.detectBuiltInFormatter(lang).catch((error) => {
          this.loggingService.warn(
            `Failed to detect formatter for ${lang}:`,
            error
          );
          return null;
        })
      );

      await Promise.allSettled(detectionPromises);

      // **Also detect any additional formatters from extensions**
      await this.detectExtensionFormatters();

      this.loggingService.info(
        `🔍 Formatter detection completed for ${this.builtInFormatters.size} languages`
      );
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
    // **Use comprehensive language extension mapping**
    const languageExtensionMap = this.getLanguageExtensionMap();
    const possibleFormatters = languageExtensionMap[languageId] || [];

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
  ): Promise<{
    success: boolean;
    text?: string;
    changes: number;
    formatterUsed: "formatMaster" | "builtin" | "chained";
    executionTime: number;
    builtInFormatterInfo: BuiltInFormatterInfo;
    error?: Error;
  }> {
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
        changes: 0,
      };
    }
  }

  /**
   * **Detect formatters provided by extensions**
   */
  private async detectExtensionFormatters(): Promise<void> {
    try {
      // **Get all active extensions**
      const activeExtensions = vscode.extensions.all.filter(
        (ext) => ext.isActive
      );

      // **Check each extension for formatter contributions**
      for (const extension of activeExtensions) {
        const contributes = extension.packageJSON?.contributes;
        if (!contributes) {
          continue;
        }

        // **Check for language contributions**
        const languages = contributes.languages || [];
        for (const language of languages) {
          if (language.id && !this.builtInFormatters.has(language.id)) {
            await this.detectBuiltInFormatter(language.id);
          }
        }

        // **Check for formatting providers in grammars**
        const grammars = contributes.grammars || [];
        for (const grammar of grammars) {
          if (
            grammar.language &&
            !this.builtInFormatters.has(grammar.language)
          ) {
            await this.detectBuiltInFormatter(grammar.language);
          }
        }
      }

      this.loggingService.debug(
        `Detected formatters from ${activeExtensions.length} extensions`
      );
    } catch (error) {
      this.loggingService.warn("Failed to detect extension formatters:", error);
    }
  }

  /**
   * **Get comprehensive language-to-extension mapping**
   */
  private getLanguageExtensionMap(): Record<string, string[]> {
    return {
      // **JavaScript/TypeScript**
      javascript: [
        "esbenp.prettier-vscode",
        "ms-vscode.vscode-typescript-next",
      ],
      typescript: [
        "esbenp.prettier-vscode",
        "ms-vscode.vscode-typescript-next",
      ],
      javascriptreact: [
        "esbenp.prettier-vscode",
        "ms-vscode.vscode-typescript-next",
      ],
      typescriptreact: [
        "esbenp.prettier-vscode",
        "ms-vscode.vscode-typescript-next",
      ],

      // **Web technologies**
      html: ["esbenp.prettier-vscode", "ms-vscode.html-language-features"],
      css: ["esbenp.prettier-vscode", "ms-vscode.css-language-features"],
      scss: ["esbenp.prettier-vscode", "ms-vscode.css-language-features"],
      less: ["esbenp.prettier-vscode", "ms-vscode.css-language-features"],
      json: ["esbenp.prettier-vscode", "ms-vscode.json-language-features"],
      jsonc: ["esbenp.prettier-vscode", "ms-vscode.json-language-features"],
      xml: ["redhat.vscode-xml", "dotjoshjohnson.xml"],

      // **Programming languages**
      python: [
        "ms-python.python",
        "ms-python.autopep8",
        "ms-python.black-formatter",
      ],
      java: ["redhat.java", "vscjava.vscode-java-pack"],
      csharp: ["ms-dotnettools.csharp", "ms-dotnettools.vscode-dotnet-runtime"],
      cpp: ["ms-vscode.cpptools", "ms-vscode.cpptools-extension-pack"],
      c: ["ms-vscode.cpptools"],
      go: ["golang.go"],
      rust: ["rust-lang.rust-analyzer", "vadimcn.vscode-lldb"],
      php: ["bmewburn.vscode-intelephense-client", "xdebug.php-debug"],

      // **Markup and data**
      markdown: ["yzhang.markdown-all-in-one", "esbenp.prettier-vscode"],
      yaml: ["redhat.vscode-yaml", "esbenp.prettier-vscode"],
      yml: ["redhat.vscode-yaml", "esbenp.prettier-vscode"],
      toml: ["tamasfe.even-better-toml"],

      // **Shell and config**
      powershell: ["ms-vscode.powershell"],
      shellscript: ["timonwong.shellcheck"],
      dockerfile: ["ms-azuretools.vscode-docker"],
      sql: ["ms-mssql.mssql"],

      // **Other languages**
      ruby: ["rebornix.ruby", "castwide.solargraph"],
      swift: ["swift-server.swift"],
      kotlin: ["mathiasfrohlich.kotlin"],
      scala: ["scalameta.metals"],
      r: ["ikuyadeu.r"],
      lua: ["sumneko.lua"],
    };
  }

  /**
   * **Enhanced file extension mapping**
   */
  private getFileExtension(languageId: string): string {
    const extensionMap: Record<string, string> = {
      javascript: "js",
      typescript: "ts",
      javascriptreact: "jsx",
      typescriptreact: "tsx",
      html: "html",
      css: "css",
      scss: "scss",
      less: "less",
      json: "json",
      jsonc: "jsonc",
      xml: "xml",
      python: "py",
      java: "java",
      csharp: "cs",
      cpp: "cpp",
      c: "c",
      go: "go",
      rust: "rs",
      php: "php",
      markdown: "md",
      yaml: "yaml",
      yml: "yml",
      toml: "toml",
      powershell: "ps1",
      shellscript: "sh",
      dockerfile: "dockerfile",
      sql: "sql",
      ruby: "rb",
      swift: "swift",
      kotlin: "kt",
      scala: "scala",
      r: "r",
      lua: "lua",
    };

    return extensionMap[languageId] || "txt";
  }

  /**
   * **Enhanced test content generation**
   */
  private getTestContent(languageId: string): string {
    const testContentMap: Record<string, string> = {
      javascript: "const hello = 'world';",
      typescript: "const hello: string = 'world';",
      javascriptreact: "const Component = () => <div>Hello</div>;",
      typescriptreact: "const Component: React.FC = () => <div>Hello</div>;",
      html: "<div>Hello World</div>",
      css: "body { margin: 0; }",
      scss: "$color: red; body { color: $color; }",
      less: "@color: red; body { color: @color; }",
      json: '{"hello": "world"}',
      jsonc: '{"hello": "world", /* comment */}',
      xml: '<?xml version="1.0"?><root>Hello</root>',
      python: "def hello():\n    print('world')",
      java: "public class Hello { public static void main(String[] args) {} }",
      csharp: "namespace Hello { class Program { static void Main() {} } }",
      cpp: "#include <iostream>\nint main() { return 0; }",
      c: "#include <stdio.h>\nint main() { return 0; }",
      go: 'package main\nimport "fmt"\nfunc main() {}',
      rust: 'fn main() { println!("Hello"); }',
      php: "<?php echo 'Hello World'; ?>",
      markdown: "# Hello World\nThis is a test.",
      yaml: "hello: world\nlist:\n  - item1\n  - item2",
      yml: "hello: world",
      toml: "[hello]\nworld = true",
      powershell: "Write-Host 'Hello World'",
      shellscript: "#!/bin/bash\necho 'Hello World'",
      dockerfile: "FROM node:alpine\nRUN echo 'hello'",
      sql: "SELECT * FROM users WHERE id = 1;",
      ruby: "puts 'Hello World'",
      swift: 'print("Hello World")',
      kotlin: 'fun main() { println("Hello") }',
      scala: 'object Hello extends App { println("Hello") }',
      r: "print('Hello World')",
      lua: "print('Hello World')",
    };

    return testContentMap[languageId] || "Hello World";
  } /**
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
