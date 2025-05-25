import * as vscode from "vscode";
import { ConfigurationService } from "./services/configuration-service";
import { LoggingService } from "./services/logging-service";
import { FormatService } from "./services/format-service";
import { PerformanceMonitoringService } from "./services/performance-monitoring-service";
import { PreviewService } from "./services/preview-service";
import { DocumentFormatProvider } from "./providers/document-format-provider";
import { JavaScriptFormatter } from "./formatters/javascript-formatter";
import { JsonFormatter } from "./formatters/json-formatter";
import { XmlFormatter } from "./formatters/xml-formatter";
import { HtmlFormatter } from "./formatters/html-formatter";
import { PythonFormatter } from "./formatters/python-formatter";
import { MarkdownFormatter } from "./formatters/markdown-formatter";
import { YamlFormatter } from "./formatters/yaml-formatter";
import { UniversalFormatter } from "./formatters/universal-formatter";
import {
  IConfigurationService,
  ILoggingService,
  IFormatService,
  IPerformanceMonitoringService,
  IPreviewService,
  FormatConfig,
  PerformanceMetrics,
} from "./types";

/**
 * **Extension context and services**
 */
class ExtensionContext {
  private _statusBar?: vscode.StatusBarItem;
  
  constructor(
    public readonly configService: IConfigurationService,
    public readonly loggingService: ILoggingService,
    public readonly formatService: IFormatService,
    public readonly performanceService: IPerformanceMonitoringService,
    public readonly previewService: IPreviewService
  ) {}

  get statusBar(): vscode.StatusBarItem {
    if (!this._statusBar) {
      this._statusBar = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
      );
      this._statusBar.command = "formatMaster.showStatus";
      this._statusBar.tooltip = "Format Master Status";
      this._statusBar.show();
    }
    return this._statusBar;
  }

  dispose(): void {
    this._statusBar?.dispose();
  }
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
    const loggingService = new LoggingService({ channelName: "Format Master" });
    const configService = new ConfigurationService();
    const formatService = new FormatService(loggingService);
    const performanceService = new PerformanceMonitoringService(loggingService);
    const previewService = new PreviewService(context, loggingService);

    extensionContext = new ExtensionContext(
      configService,
      loggingService,
      formatService,
      performanceService,
      previewService
    );

    loggingService.info("🚀 Format Master extension is activating...");

    // **Initialize status bar**
    updateStatusBar();

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

    // **Setup format on paste/type handlers**
    await setupAdvancedFormatting(context);

    // **Show welcome message for first-time users**
    await showWelcomeMessage(context);

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
  const { formatService, loggingService, configService } = extensionContext;

  try {
    const config = configService.getConfig();
    
    // **Register built-in formatters**
    formatService.registerFormatter(new JavaScriptFormatter());
    formatService.registerFormatter(new JsonFormatter());
    formatService.registerFormatter(new XmlFormatter());
    formatService.registerFormatter(new HtmlFormatter());
    formatService.registerFormatter(new PythonFormatter());
    formatService.registerFormatter(new MarkdownFormatter());
    formatService.registerFormatter(new YamlFormatter());

    // **Register Universal Formatter with configuration-based discovery**
    if (config.enableAutoFormatterDiscovery) {
      const universalFormatter = new UniversalFormatter();
      formatService.registerFormatter(universalFormatter);
      
      // **Perform initial scan if enabled**
      if (config.formatterScanOnStartup) {
        loggingService.info("🔍 Starting automatic formatter discovery...");
        
        await universalFormatter.refreshLanguageSupport();
        
        const discoveredLanguages = await universalFormatter.getDiscoveredLanguages();
        loggingService.info(`🔍 Discovered ${discoveredLanguages.length} language formatters: ${discoveredLanguages.join(', ')}`);
        
        if (config.showFormatterSuggestions && discoveredLanguages.length > 0) {
          vscode.window.showInformationMessage(
            `Format Master discovered ${discoveredLanguages.length} additional formatters!`,
            'View Languages',
            'Don\'t Show Again'
          ).then(result => {
            if (result === 'View Languages') {
              vscode.commands.executeCommand('formatMaster.showDiscoveredLanguages');
            } else if (result === 'Don\'t Show Again') {
              vscode.workspace.getConfiguration('formatMaster').update('showFormatterSuggestions', false, true);
            }
          });
        }
      }
    } else {
      loggingService.info("📝 Automatic formatter discovery disabled");
    }

    loggingService.info("📝 All formatters registered successfully");
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
  const { loggingService, formatService, configService, performanceService, previewService } = extensionContext;

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

    // **Configuration Wizard Command**
    const configWizardCommand = vscode.commands.registerCommand(
      "formatMaster.configurationWizard",
      async () => {
        await showConfigurationWizard();
      }
    );

    // **Preview Formatting Command**
    const previewFormattingCommand = vscode.commands.registerCommand(
      "formatMaster.previewFormatting",
      async () => {
        await executePreviewFormatting();
      }
    );

    // **Validate Configuration Command**
    const validateConfigCommand = vscode.commands.registerCommand(
      "formatMaster.validateConfiguration",
      async () => {
        await validateConfiguration();
      }
    );

    // **Export Configuration Command**
    const exportConfigCommand = vscode.commands.registerCommand(
      "formatMaster.exportConfiguration",
      async () => {
        await exportConfiguration();
      }
    );

    // **Import Configuration Command**
    const importConfigCommand = vscode.commands.registerCommand(
      "formatMaster.importConfiguration",
      async () => {
        await importConfiguration();
      }
    );

    // **Format Workspace Command**
    const formatWorkspaceCommand = vscode.commands.registerCommand(
      "formatMaster.formatWorkspace",
      async () => {
        await formatWorkspace();
      }
    );

    // **Performance Metrics Command**
    const performanceMetricsCommand = vscode.commands.registerCommand(
      "formatMaster.performanceMetrics",
      async () => {
        await showPerformanceMetrics();
      }
    );

    // **Show Status Command**
    const showStatusCommand = vscode.commands.registerCommand(
      "formatMaster.showStatus",
      async () => {
        await showStatus();
      }
    );

    // **Smart Format Document Command**
    const smartFormatDocumentCommand = vscode.commands.registerCommand(
      "formatMaster.smartFormatDocument",
      async () => {
        await executeSmartFormatDocument();
      }
    );

    // **Detect and Install Formatters Command**
    const detectFormattersCommand = vscode.commands.registerCommand(
      "formatMaster.detectFormatters",
      async () => {
        await detectAndSuggestFormatters();
      }
    );

    // **Refresh Language Support Command**
    const refreshLanguageSupportCommand = vscode.commands.registerCommand(
      "formatMaster.refreshLanguageSupport",
      async () => {
        await refreshLanguageSupport();
      }
    );

    // **Show Discovered Languages Command**
    const showDiscoveredLanguagesCommand = vscode.commands.registerCommand(
      "formatMaster.showDiscoveredLanguages",
      async () => {
        await showDiscoveredLanguages();
      }
    );

    context.subscriptions.push(
      formatDocumentCommand,
      formatSelectionCommand,
      toggleFormatOnSaveCommand,
      configWizardCommand,
      previewFormattingCommand,
      validateConfigCommand,
      exportConfigCommand,
      importConfigCommand,
      formatWorkspaceCommand,
      performanceMetricsCommand,
      showStatusCommand,
      smartFormatDocumentCommand,
      detectFormattersCommand,
      refreshLanguageSupportCommand,
      showDiscoveredLanguagesCommand
    );

    loggingService.info("⌨️ All commands registered successfully");
  } catch (error) {
    loggingService.error("Failed to register commands", error);
    throw error;
  }
}

/**
 * **Execute format document command**
 */
async function executeFormatDocument(): Promise<void> {
  const { loggingService, formatService, performanceService } = extensionContext;
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

    // **Record performance metrics**
    performanceService.recordFormatOperation(
      editor.document.languageId,
      duration,
      true
    );

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
        updateStatusBar();
      } else {
        throw new Error("Failed to apply formatting changes");
      }
    } else {
      vscode.window.showInformationMessage("Document is already formatted");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    
    // **Record failed operation**
    performanceService.recordFormatOperation(
      editor.document.languageId,
      0,
      false
    );
    
    loggingService.error("Format document failed", error);
    vscode.window.showErrorMessage(`Formatting failed: ${message}`);
  }
}

/**
 * **Execute format selection command**
 */
async function executeFormatSelection(): Promise<void> {
  const { loggingService, formatService, performanceService } = extensionContext;
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

    // **Record performance metrics**
    performanceService.recordFormatOperation(
      editor.document.languageId,
      duration,
      true
    );

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
        updateStatusBar();
      } else {
        throw new Error("Failed to apply formatting changes");
      }
    } else {
      vscode.window.showInformationMessage("Selection is already formatted");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    
    // **Record failed operation**
    performanceService.recordFormatOperation(
      editor.document.languageId,
      0,
      false
    );
    
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
        updateStatusBar();
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
 * **Status bar update function**
 */
function updateStatusBar(): void {
  const { statusBar, configService, performanceService } = extensionContext;
  const config = configService.getConfig();
  
  if (config.statusBarIntegration) {
    const metrics = performanceService.getMetrics();
    statusBar.text = `$(symbol-misc) Format Master (${metrics.totalFormatOperations})`;
    statusBar.show();
  } else {
    statusBar.hide();
  }
}

/**
 * **Show configuration wizard**
 */
async function showConfigurationWizard(): Promise<void> {
  const { loggingService, configService } = extensionContext;
  
  try {
    // **Show a quick pick for configuration options**
    const options = [
      { label: "$(gear) Create New Profile", description: "Create a new configuration profile" },
      { label: "$(list-selection) Switch Profile", description: "Switch to a different profile" },
      { label: "$(settings) Edit Current Profile", description: "Edit the current configuration" },
      { label: "$(export) Export Configuration", description: "Export current configuration" },
      { label: "$(import) Import Configuration", description: "Import configuration from file" }
    ];

    const selected = await vscode.window.showQuickPick(options, {
      placeHolder: "Select a configuration action",
      title: "Format Master Configuration Wizard"
    });

    if (selected) {
      switch (selected.label) {
        case "$(gear) Create New Profile":
          await createNewProfile();
          break;
        case "$(list-selection) Switch Profile":
          await switchProfile();
          break;
        case "$(settings) Edit Current Profile":
          await vscode.commands.executeCommand('workbench.action.openSettings', 'formatMaster');
          break;
        case "$(export) Export Configuration":
          await exportConfiguration();
          break;
        case "$(import) Import Configuration":
          await importConfiguration();
          break;
      }
    }
  } catch (error) {
    loggingService.error("Configuration wizard failed", error);
    vscode.window.showErrorMessage("Configuration wizard failed");
  }
}

/**
 * **Execute preview formatting**
 */
async function executePreviewFormatting(): Promise<void> {
  const { loggingService, previewService } = extensionContext;
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showWarningMessage("No active editor found");
    return;
  }

  try {
    loggingService.info("Generating formatting preview...");
    const previewResult = await previewService.previewFormat(editor.document);
    
    if (previewResult.success) {
      const shouldApply = await previewService.showPreview(previewResult);
      if (shouldApply && previewResult.canApply) {
        await vscode.commands.executeCommand("formatMaster.formatDocument");
      }
    } else {
      vscode.window.showErrorMessage(`Preview failed: ${previewResult.error?.message}`);
    }
  } catch (error) {
    loggingService.error("Preview formatting failed", error);
    vscode.window.showErrorMessage("Preview formatting failed");
  }
}

/**
 * **Validate configuration**
 */
async function validateConfiguration(): Promise<void> {
  const { loggingService, configService } = extensionContext;
  
  try {
    const validation = await configService.validateConfiguration();
    
    if (validation.isValid) {
      vscode.window.showInformationMessage("✅ Configuration is valid");
    } else {
      const issues = validation.errors.length + validation.warnings.length;
      const message = `⚠️ Found ${issues} configuration issue(s)`;
      
      const details = [
        ...validation.errors.map(e => `Error: ${e.message}`),
        ...validation.warnings.map(w => `Warning: ${w.message}`)
      ].join("\n");
      
      const action = await vscode.window.showWarningMessage(
        message,
        "Show Details",
        "Fix Configuration"
      );
      
      if (action === "Show Details") {
        loggingService.info("Configuration validation details:\n" + details);
        loggingService.show();
      } else if (action === "Fix Configuration") {
        await showConfigurationWizard();
      }
    }
  } catch (error) {
    loggingService.error("Configuration validation failed", error);
    vscode.window.showErrorMessage("Configuration validation failed");
  }
}

/**
 * **Export configuration**
 */
async function exportConfiguration(): Promise<void> {
  const { loggingService, configService } = extensionContext;
  
  try {
    const saveUri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file("format-master-config.json"),
      filters: {
        "JSON files": ["json"],
        "All files": ["*"]
      }
    });
    
    if (saveUri) {
      await configService.exportConfiguration(saveUri.fsPath);
      vscode.window.showInformationMessage(`Configuration exported to ${saveUri.fsPath}`);
    }
  } catch (error) {
    loggingService.error("Export configuration failed", error);
    vscode.window.showErrorMessage("Export configuration failed");
  }
}

/**
 * **Import configuration**
 */
async function importConfiguration(): Promise<void> {
  const { loggingService, configService } = extensionContext;
  
  try {
    const openUri = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        "JSON files": ["json"],
        "All files": ["*"]
      }
    });
    
    if (openUri && openUri[0]) {
      await configService.importConfiguration(openUri[0].fsPath);
      vscode.window.showInformationMessage("Configuration imported successfully");
      updateStatusBar();
    }
  } catch (error) {
    loggingService.error("Import configuration failed", error);
    vscode.window.showErrorMessage("Import configuration failed");
  }
}

/**
 * **Format workspace**
 */
async function formatWorkspace(): Promise<void> {
  const { loggingService, formatService, configService } = extensionContext;
  
  try {
    const config = configService.getConfig();
    const workspaceFolders = vscode.workspace.workspaceFolders;
    
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showWarningMessage("No workspace folder found");
      return;
    }

    const proceed = await vscode.window.showWarningMessage(
      "This will format all supported files in the workspace. Continue?",
      { modal: true },
      "Yes",
      "No"
    );

    if (proceed !== "Yes") {
      return;
    }

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "Formatting workspace...",
      cancellable: true
    }, async (progress, token) => {
      let totalFiles = 0;
      let formattedFiles = 0;

      for (const folder of workspaceFolders) {
        const files = await vscode.workspace.findFiles(
          new vscode.RelativePattern(folder, "**/*.{js,ts,json,xml,css,html,py,md,yml,yaml}"),
          "**/node_modules/**"
        );

        totalFiles += files.length;

        for (let i = 0; i < files.length; i++) {
          if (token.isCancellationRequested) {
            return;
          }

          const file = files[i];
          progress.report({
            increment: (1 / totalFiles) * 100,
            message: `Formatting ${file.fsPath.split('/').pop()}`
          });

          try {
            const document = await vscode.workspace.openTextDocument(file);
            
            if (config.enabledLanguages.includes(document.languageId)) {
              const edits = await formatService.formatDocument(document);
              
              if (edits.length > 0) {
                const workspaceEdit = new vscode.WorkspaceEdit();
                workspaceEdit.set(document.uri, edits);
                await vscode.workspace.applyEdit(workspaceEdit);
                formattedFiles++;
              }
            }
          } catch (error) {
            loggingService.warn(`Failed to format ${file.fsPath}: ${error}`);
          }
        }
      }

      vscode.window.showInformationMessage(
        `Workspace formatting complete: ${formattedFiles}/${totalFiles} files formatted`
      );
    });
  } catch (error) {
    loggingService.error("Workspace formatting failed", error);
    vscode.window.showErrorMessage("Workspace formatting failed");
  }
}

/**
 * **Show performance metrics**
 */
async function showPerformanceMetrics(): Promise<void> {
  const { loggingService, performanceService } = extensionContext;
  
  try {
    const metrics = performanceService.getMetrics();
    const report = performanceService.generateReport();
    
    const panel = vscode.window.createWebviewPanel(
      "formatMasterMetrics",
      "Format Master Performance Metrics",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    panel.webview.html = generateMetricsHTML(metrics, report);
    
    // **Add refresh button**
    panel.webview.onDidReceiveMessage(message => {
      if (message.command === 'refresh') {
        const updatedMetrics = performanceService.getMetrics();
        const updatedReport = performanceService.generateReport();
        panel.webview.html = generateMetricsHTML(updatedMetrics, updatedReport);
      } else if (message.command === 'clear') {
        performanceService.clearMetrics();
        vscode.window.showInformationMessage("Performance metrics cleared");
        panel.webview.html = generateMetricsHTML(performanceService.getMetrics(), "Metrics cleared");
      }
    });
  } catch (error) {
    loggingService.error("Show performance metrics failed", error);
    vscode.window.showErrorMessage("Failed to show performance metrics");
  }
}

/**
 * **Show status**
 */
async function showStatus(): Promise<void> {
  const { configService, performanceService } = extensionContext;
  
  try {
    const config = configService.getConfig();
    const metrics = performanceService.getMetrics();
    
    const statusItems = [
      `Active Profile: ${config.activeProfile || 'Default'}`,
      `Enabled Languages: ${config.enabledLanguages.join(', ')}`,
      `Format on Save: ${config.formatOnSave ? 'Enabled' : 'Disabled'}`,
      `Total Operations: ${metrics.totalFormatOperations}`,
      `Success Rate: ${metrics.successRate.toFixed(1)}%`,
      `Average Time: ${metrics.averageFormatTime.toFixed(1)}ms`
    ];
    
    const selected = await vscode.window.showQuickPick(statusItems, {
      placeHolder: "Format Master Status",
      title: "Current Status and Statistics"
    });
  } catch (error) {
    vscode.window.showErrorMessage("Failed to show status");
  }
}

/**
 * **Create new profile**
 */
async function createNewProfile(): Promise<void> {
  const { configService } = extensionContext;
  
  try {
    const profileName = await vscode.window.showInputBox({
      prompt: "Enter profile name",
      placeHolder: "e.g., TypeScript, Python, etc."
    });
    
    if (profileName) {
      await configService.createProfile(profileName, {});
      vscode.window.showInformationMessage(`Profile '${profileName}' created`);
    }
  } catch (error) {
    vscode.window.showErrorMessage("Failed to create profile");
  }
}

/**
 * **Switch profile**
 */
async function switchProfile(): Promise<void> {
  const { configService } = extensionContext;
  
  try {
    const profiles = await configService.getProfiles();
    const profileItems = profiles.map(p => ({
      label: p.name,
      description: p.description
    }));
    
    const selected = await vscode.window.showQuickPick(profileItems, {
      placeHolder: "Select a profile to switch to"
    });
    
    if (selected) {
      await configService.switchProfile(selected.label);
      vscode.window.showInformationMessage(`Switched to profile '${selected.label}'`);
      updateStatusBar();
    }
  } catch (error) {
    vscode.window.showErrorMessage("Failed to switch profile");
  }
}

/**
 * **Generate metrics HTML**
 */
function generateMetricsHTML(metrics: PerformanceMetrics, report: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Format Master Metrics</title>
        <style>
            body { font-family: var(--vscode-font-family); padding: 20px; }
            .metric-card { 
                background: var(--vscode-editor-background); 
                padding: 15px; 
                margin: 10px 0; 
                border-radius: 5px;
                border: 1px solid var(--vscode-panel-border);
            }
            .metric-value { font-size: 24px; font-weight: bold; color: var(--vscode-charts-blue); }
            .metric-label { color: var(--vscode-foreground); opacity: 0.8; }
            .button { 
                background: var(--vscode-button-background); 
                color: var(--vscode-button-foreground);
                border: none; 
                padding: 8px 16px; 
                margin: 5px; 
                border-radius: 3px; 
                cursor: pointer; 
            }
            .button:hover { background: var(--vscode-button-hoverBackground); }
            pre { 
                background: var(--vscode-textCodeBlock-background); 
                padding: 10px; 
                border-radius: 3px;
                overflow-x: auto;
            }
        </style>
    </head>
    <body>
        <h1>Format Master Performance Metrics</h1>
        
        <div class="metric-card">
            <div class="metric-value">${metrics.totalFormatOperations}</div>
            <div class="metric-label">Total Operations</div>
        </div>
        
        <div class="metric-card">
            <div class="metric-value">${metrics.averageFormatTime.toFixed(1)}ms</div>
            <div class="metric-label">Average Format Time</div>
        </div>
        
        <div class="metric-card">
            <div class="metric-value">${metrics.successRate.toFixed(1)}%</div>
            <div class="metric-label">Success Rate</div>
        </div>
        
        <div class="metric-card">
            <div class="metric-value">${metrics.cacheHitRate.toFixed(1)}%</div>
            <div class="metric-label">Cache Hit Rate</div>
        </div>
        
        <div style="margin: 20px 0;">
            <button class="button" onclick="refresh()">Refresh</button>
            <button class="button" onclick="clearMetrics()">Clear Metrics</button>
        </div>
        
        <h2>Detailed Report</h2>
        <pre>${report}</pre>
        
        <script>
            const vscode = acquireVsCodeApi();
            
            function refresh() {
                vscode.postMessage({ command: 'refresh' });
            }
            
            function clearMetrics() {
                vscode.postMessage({ command: 'clear' });
            }
        </script>
    </body>
    </html>
  `;
}

/**
 * **Setup advanced formatting (format on paste/type)**
 */
async function setupAdvancedFormatting(context: vscode.ExtensionContext): Promise<void> {
  const { loggingService, configService, formatService } = extensionContext;
  
  try {
    // **Format on paste**
    const onPasteDisposable = vscode.workspace.onDidChangeTextDocument(async (event) => {
      const config = configService.getConfig();
      
      if (!config.formatOnPaste) {
        return;
      }
      
      const document = event.document;
      
      if (!config.enabledLanguages.includes(document.languageId)) {
        return;
      }
      
      // **Simple heuristic: if many lines were added at once, it's likely a paste**
      const largeChange = event.contentChanges.some(change => 
        change.text.includes('\n') && change.text.length > 50
      );
      
      if (largeChange) {
        setTimeout(async () => {
          try {
            await vscode.commands.executeCommand("formatMaster.formatDocument");
          } catch (error) {
            loggingService.debug("Auto-format on paste failed", error);
          }
        }, 100);
      }
    });
    
    context.subscriptions.push(onPasteDisposable);
    loggingService.info("📋 Advanced formatting handlers enabled");
  } catch (error) {
    loggingService.error("Failed to setup advanced formatting", error);
  }
}

/**
 * **Show welcome message for first-time users**
 */
async function showWelcomeMessage(context: vscode.ExtensionContext): Promise<void> {
  const { loggingService } = extensionContext;
  
  try {
    const hasShownWelcome = context.globalState.get<boolean>("formatMaster.hasShownWelcome", false);
    
    if (!hasShownWelcome) {
      const action = await vscode.window.showInformationMessage(
        "🎉 Welcome to Format Master! Would you like to configure your formatting preferences?",
        "Configure Now",
        "Later",
        "Don't Show Again"
      );
      
      if (action === "Configure Now") {
        await showConfigurationWizard();
      } else if (action === "Don't Show Again") {
        await context.globalState.update("formatMaster.hasShownWelcome", true);
      }
      
      if (action !== "Later") {
        await context.globalState.update("formatMaster.hasShownWelcome", true);
      }
    }
  } catch (error) {
    loggingService.error("Failed to show welcome message", error);
  }
}

/**
 * **Extension deactivation function**
 */
export function deactivate(): void {
  try {
    extensionContext?.loggingService.info(
      "👋 Format Master extension deactivated"
    );
    
    // **Clean up resources**
    extensionContext?.previewService.disposePreview();
    extensionContext?.dispose();
  } catch (error) {
    console.error("Error during deactivation:", error);
  }
}

/**
 * **Execute smart format document command**
 */
async function executeSmartFormatDocument(): Promise<void> {
  const { loggingService, formatService, performanceService } = extensionContext;
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showWarningMessage("No active editor found");
    return;
  }

  try {
    loggingService.info("Smart formatting document...");
    
    const startTime = Date.now();
    const edits = await formatService.smartFormatDocument(editor.document);
    const duration = Date.now() - startTime;

    // **Record performance metrics**
    performanceService.recordFormatOperation(
      editor.document.languageId,
      duration,
      edits.length > 0
    );

    if (edits.length > 0) {
      const success = await editor.edit((editBuilder) => {
        for (const edit of edits) {
          editBuilder.replace(edit.range, edit.newText);
        }
      });

      if (success) {
        loggingService.info(`Smart document formatted (${edits.length} changes)`);
        vscode.window.showInformationMessage(
          `Document smart formatted (${edits.length} changes)`
        );
        updateStatusBar();
      } else {
        throw new Error("Failed to apply smart formatting changes");
      }
    } else {
      vscode.window.showInformationMessage("Document is already properly formatted");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    
    // **Record failed operation**
    performanceService.recordFormatOperation(
      editor.document.languageId,
      0,
      false
    );
    
    loggingService.error("Smart format document failed", error);
    
    // **If it's an unsupported language error, try to suggest formatters**
    if (message.includes("not supported")) {
      await detectAndSuggestFormatters();
    } else {
      vscode.window.showErrorMessage(`Smart formatting failed: ${message}`);
    }
  }
}

/**
 * **Detect and suggest formatters for current language**
 */
async function detectAndSuggestFormatters(): Promise<void> {
  const { loggingService, formatService } = extensionContext;
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showWarningMessage("No active editor found");
    return;
  }

  const languageId = editor.document.languageId;
  
  try {
    loggingService.info(`Detecting formatters for ${languageId}...`);
    
    // **Get integration service**
    const integrationService = formatService.getIntegrationService();
    
    // **Try to detect built-in formatter**
    const formatterInfo = await integrationService.detectBuiltInFormatter(languageId);
    
    // **Get all supported languages**
    const supportedLanguages = formatService.getSupportedLanguages();
    
    let message = `Formatter Detection Results for ${languageId}:\n\n`;
    
    if (formatterInfo.available) {
      message += `✅ Built-in formatter: Available`;
      if (formatterInfo.extension) {
        message += ` (${formatterInfo.extension})`;
      }
      message += `\n`;
    } else {
      message += `❌ Built-in formatter: Not available\n`;
    }
    
    const hasCustomFormatter = supportedLanguages.includes(languageId);
    if (hasCustomFormatter) {
      message += `✅ Format Master formatter: Available\n`;
    } else {
      message += `❌ Format Master formatter: Not available\n`;
    }
    
    message += `\nTotal supported languages: ${supportedLanguages.length}`;
    
    // **Show detection results**
    const result = await vscode.window.showInformationMessage(
      message,
      { modal: true },
      'View Supported Languages',
      'Search Extensions'
    );
    
    if (result === 'View Supported Languages') {
      await showSupportedLanguages(supportedLanguages);
    } else if (result === 'Search Extensions') {
      vscode.commands.executeCommand('workbench.extensions.search', `@category:"formatters" ${languageId}`);
    }
    
  } catch (error) {
    loggingService.error("Formatter detection failed", error);
    vscode.window.showErrorMessage(
      `Formatter detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * **Show list of supported languages**
 */
async function showSupportedLanguages(supportedLanguages: string[]): Promise<void> {
  const languageList = supportedLanguages.sort().join(', ');
  
  const message = `Format Master supports ${supportedLanguages.length} languages:\n\n${languageList}`;
  
  vscode.window.showInformationMessage(
    message,
    { modal: true },
    'Copy List'
  ).then(result => {
    if (result === 'Copy List') {
      vscode.env.clipboard.writeText(languageList);
      vscode.window.showInformationMessage('Language list copied to clipboard');
    }
  });
}

/**
 * **Refresh language support by re-scanning formatters**
 */
async function refreshLanguageSupport(): Promise<void> {
  const { formatService, loggingService } = extensionContext;

  try {
    loggingService.info("🔄 Refreshing language support...");
    
    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "Refreshing language support...",
      cancellable: false
    }, async (progress) => {
      progress.report({ increment: 0 });
      
      // Refresh language support in format service
      await formatService.refreshLanguageSupport();
      progress.report({ increment: 50 });
      
      // Get updated discovered languages
      const discoveredLanguages = await formatService.getDiscoveredLanguages();
      progress.report({ increment: 100 });
      
      const message = `Language support refreshed! Discovered ${discoveredLanguages.length} formatters.`;
      loggingService.info(message);
      vscode.window.showInformationMessage(message);
    });
    
  } catch (error) {
    const message = `Failed to refresh language support: ${error instanceof Error ? error.message : 'Unknown error'}`;
    loggingService.error("Refresh language support failed", error);
    vscode.window.showErrorMessage(message);
  }
}

/**
 * **Show all discovered languages with formatters**
 */
async function showDiscoveredLanguages(): Promise<void> {
  const { formatService, loggingService } = extensionContext;

  try {
    loggingService.info("📋 Showing discovered languages...");
    
    const discoveredLanguages = await formatService.getDiscoveredLanguages();
    const supportedLanguages = formatService.getSupportedLanguages();
    
    if (discoveredLanguages.length === 0) {
      vscode.window.showInformationMessage(
        "No formatters discovered. Try refreshing language support.",
        'Refresh Now'
      ).then(result => {
        if (result === 'Refresh Now') {
          vscode.commands.executeCommand('formatMaster.refreshLanguageSupport');
        }
      });
      return;
    }
    
    const discoveredList = discoveredLanguages.sort().join(', ');
    const totalSupported = supportedLanguages.length;
    
    const message = `Format Master discovered ${discoveredLanguages.length} formatters:\n\n${discoveredList}\n\nTotal supported languages: ${totalSupported}`;
    
    const result = await vscode.window.showInformationMessage(
      message,
      { modal: true },
      'Copy List',
      'Refresh Support',
      'Show All Supported'
    );
    
    if (result === 'Copy List') {
      await vscode.env.clipboard.writeText(discoveredList);
      vscode.window.showInformationMessage('Discovered languages copied to clipboard');
    } else if (result === 'Refresh Support') {
      await vscode.commands.executeCommand('formatMaster.refreshLanguageSupport');
    } else if (result === 'Show All Supported') {
      await showSupportedLanguages(supportedLanguages);
    }
    
  } catch (error) {
    const message = `Failed to show discovered languages: ${error instanceof Error ? error.message : 'Unknown error'}`;
    loggingService.error("Show discovered languages failed", error);
    vscode.window.showErrorMessage(message);
  }
}
