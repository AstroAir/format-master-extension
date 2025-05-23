import * as vscode from "vscode";
import { ConfigurationService } from "./services/configuration-service";
import { LoggingService } from "./services/logging-service";
import { FormatService } from "./services/format-service";
import { DocumentFormatProvider } from "./providers/document-format-provider";
import { JavaScriptFormatter } from "./formatters/javascript-formatter";
import { JsonFormatter } from "./formatters/json-formatter";
import { XmlFormatter } from "./formatters/xml-formatter";
import {
  IConfigurationService,
  ILoggingService,
  IFormatService,
} from "./types";

/**
 * **Extension context and services**
 */
class ExtensionContext {
  constructor(
    public readonly configService: IConfigurationService,
    public readonly loggingService: ILoggingService,
    public readonly formatService: IFormatService
  ) {}
}

let extensionContext: ExtensionContext;

/**
 * **Extension activation function**
 */
export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  try {
    // **Initialize services**
    const loggingService = new LoggingService("Format Master");
    const configService = new ConfigurationService();
    const formatService = new FormatService(loggingService);

    extensionContext = new ExtensionContext(
      configService,
      loggingService,
      formatService
    );

    loggingService.info("🚀 Format Master extension is activating...");

    // **Register formatters**
    await registerFormatters();

    // **Register format providers**
    await registerFormatProviders(context);

    // **Register commands**
    await registerCommands(context);

    // **Setup format on save**
    await setupFormatOnSave(context);

    // **Register configuration change handler**
    setupConfigurationWatcher(context);

    loggingService.info("✅ Format Master extension activated successfully");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Failed to activate Format Master: ${message}`
    );
    throw error;
  }
}

/**
 * **Register all available formatters**
 */
async function registerFormatters(): Promise<void> {
  const { formatService, loggingService } = extensionContext;

  try {
    // **Register built-in formatters**
    formatService.registerFormatter(new JavaScriptFormatter());
    formatService.registerFormatter(new JsonFormatter());
    formatService.registerFormatter(new XmlFormatter());

    loggingService.info("📝 Formatters registered successfully");
  } catch (error) {
    loggingService.error("Failed to register formatters", error);
    throw error;
  }
}

/**
 * **Register format providers for supported languages**
 */
async function registerFormatProviders(
  context: vscode.ExtensionContext
): Promise<void> {
  const { configService, loggingService, formatService } = extensionContext;

  try {
    const config = configService.getConfig();
    const provider = new DocumentFormatProvider(formatService);

    // **Register for each enabled language**
    for (const languageId of config.enabledLanguages) {
      const disposable =
        vscode.languages.registerDocumentFormattingEditProvider(
          languageId,
          provider
        );
      context.subscriptions.push(disposable);

      const rangeDisposable =
        vscode.languages.registerDocumentRangeFormattingEditProvider(
          languageId,
          provider
        );
      context.subscriptions.push(rangeDisposable);

      loggingService.debug(`Registered format provider for: ${languageId}`);
    }

    loggingService.info("🔗 Format providers registered successfully");
  } catch (error) {
    loggingService.error("Failed to register format providers", error);
    throw error;
  }
}

/**
 * **Register extension commands**
 */
async function registerCommands(
  context: vscode.ExtensionContext
): Promise<void> {
  const { loggingService, formatService } = extensionContext;

  try {
    // **Format Document Command**
    const formatDocumentCommand = vscode.commands.registerCommand(
      "formatMaster.formatDocument",
      async () => {
        await executeFormatDocument();
      }
    );

    // **Format Selection Command**
    const formatSelectionCommand = vscode.commands.registerCommand(
      "formatMaster.formatSelection",
      async () => {
        await executeFormatSelection();
      }
    );

    // **Toggle Format on Save Command**
    const toggleFormatOnSaveCommand = vscode.commands.registerCommand(
      "formatMaster.toggleFormatOnSave",
      async () => {
        await toggleFormatOnSave();
      }
    );

    context.subscriptions.push(
      formatDocumentCommand,
      formatSelectionCommand,
      toggleFormatOnSaveCommand
    );

    loggingService.info("⌨️ Commands registered successfully");
  } catch (error) {
    loggingService.error("Failed to register commands", error);
    throw error;
  }
}

/**
 * **Execute format document command**
 */
async function executeFormatDocument(): Promise<void> {
  const { loggingService, formatService } = extensionContext;
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showWarningMessage("No active editor found");
    return;
  }

  try {
    loggingService.info(`Formatting document: ${editor.document.fileName}`);

    const startTime = Date.now();
    const edits = await formatService.formatDocument(editor.document);
    const duration = Date.now() - startTime;

    if (edits.length > 0) {
      const workspaceEdit = new vscode.WorkspaceEdit();
      workspaceEdit.set(editor.document.uri, edits);

      const success = await vscode.workspace.applyEdit(workspaceEdit);

      if (success) {
        loggingService.info(
          `Document formatted successfully in ${duration}ms (${edits.length} changes)`
        );
        vscode.window.showInformationMessage(
          `Document formatted (${edits.length} changes)`
        );
      } else {
        throw new Error("Failed to apply formatting changes");
      }
    } else {
      vscode.window.showInformationMessage("Document is already formatted");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    loggingService.error("Format document failed", error);
    vscode.window.showErrorMessage(`Formatting failed: ${message}`);
  }
}

/**
 * **Execute format selection command**
 */
async function executeFormatSelection(): Promise<void> {
  const { loggingService, formatService } = extensionContext;
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showWarningMessage("No active editor found");
    return;
  }

  if (editor.selection.isEmpty) {
    vscode.window.showWarningMessage("No text selected");
    return;
  }

  try {
    loggingService.info("Formatting selection...");

    const startTime = Date.now();
    const edits = await formatService.formatRange(
      editor.document,
      editor.selection
    );
    const duration = Date.now() - startTime;

    if (edits.length > 0) {
      const workspaceEdit = new vscode.WorkspaceEdit();
      workspaceEdit.set(editor.document.uri, edits);

      const success = await vscode.workspace.applyEdit(workspaceEdit);

      if (success) {
        loggingService.info(
          `Selection formatted successfully in ${duration}ms`
        );
        vscode.window.showInformationMessage(
          "Selection formatted successfully"
        );
      } else {
        throw new Error("Failed to apply formatting changes");
      }
    } else {
      vscode.window.showInformationMessage("Selection is already formatted");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    loggingService.error("Format selection failed", error);
    vscode.window.showErrorMessage(`Formatting failed: ${message}`);
  }
}

/**
 * **Toggle format on save setting**
 */
async function toggleFormatOnSave(): Promise<void> {
  const { loggingService } = extensionContext;

  try {
    const config = vscode.workspace.getConfiguration("formatMaster");
    const currentValue = config.get<boolean>("formatOnSave", true);

    await config.update(
      "formatOnSave",
      !currentValue,
      vscode.ConfigurationTarget.Workspace
    );

    const newStatus = !currentValue ? "enabled" : "disabled";
    loggingService.info(`Format on save ${newStatus}`);
    vscode.window.showInformationMessage(`Format on save ${newStatus}`);
  } catch (error) {
    loggingService.error("Failed to toggle format on save", error);
    vscode.window.showErrorMessage("Failed to toggle format on save setting");
  }
}

/**
 * **Setup format on save functionality**
 */
async function setupFormatOnSave(
  context: vscode.ExtensionContext
): Promise<void> {
  const { loggingService, configService, formatService } = extensionContext;

  try {
    const onSaveDisposable = vscode.workspace.onWillSaveTextDocument(
      async (event) => {
        const config = configService.getConfig();

        if (!config.formatOnSave) {
          return;
        }

        const document = event.document;

        if (!config.enabledLanguages.includes(document.languageId)) {
          return;
        }

        event.waitUntil(
          (async () => {
            try {
              loggingService.debug(
                `Auto-formatting on save: ${document.fileName}`
              );
              const edits = await formatService.formatDocument(document);
              return edits;
            } catch (error) {
              loggingService.error("Auto-format on save failed", error);
              return [];
            }
          })()
        );
      }
    );

    context.subscriptions.push(onSaveDisposable);
    loggingService.info("💾 Format on save enabled");
  } catch (error) {
    loggingService.error("Failed to setup format on save", error);
    throw error;
  }
}

/**
 * **Setup configuration change watcher**
 */
function setupConfigurationWatcher(context: vscode.ExtensionContext): void {
  const { loggingService } = extensionContext;

  try {
    const configWatcher = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("formatMaster")) {
        loggingService.info("⚙️ Configuration changed, reloading...");
        // **Configuration will be reloaded automatically by ConfigurationService**
      }
    });

    context.subscriptions.push(configWatcher);
    loggingService.info("👀 Configuration watcher enabled");
  } catch (error) {
    loggingService.error("Failed to setup configuration watcher", error);
  }
}

/**
 * **Extension deactivation function**
 */
export function deactivate(): void {
  extensionContext?.loggingService.info(
    "👋 Format Master extension deactivated"
  );
}
