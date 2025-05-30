import * as vscode from "vscode";

/**
 * Interface for code analysis service
 */
export interface ICodeAnalysisService {
  registerAnalyzer(analyzer: ICodeAnalyzer): void;
  unregisterAnalyzer(name: string): void;
  analyzeDocument(document: vscode.TextDocument): Promise<AnalysisResult>;
  readonly onAnalysisComplete: vscode.Event<AnalysisResult>;
}

/**
 * Interface for code analyzer
 */
export interface ICodeAnalyzer {
  name: string;
  supportedLanguages: string[];
  analyze(content: string, languageId: string): Promise<AnalysisResult>;
  dispose?(): void;
}

/**
 * Analysis result interface
 */
export interface AnalysisResult {
  metrics: CodeMetrics;
  suggestions: StyleSuggestion[];
  errors: vscode.Diagnostic[];
  executionTime: number;
}

/**
 * Code metrics interface
 */
export interface CodeMetrics {
  linesOfCode: number;
  complexity: number;
  maintainability: number;
}

/**
 * Style suggestion interface
 */
export interface StyleSuggestion {
  type: SuggestionType;
  message: string;
  range: vscode.Range;
  severity: DiagnosticLevel;
  fix?: vscode.CodeAction;
}

/**
 * Suggestion types
 */
export enum SuggestionType {
  FORMATTING = "formatting",
  STYLE = "style",
  CONVENTION = "convention",
  PERFORMANCE = "performance",
}

/**
 * Diagnostic levels
 */
export enum DiagnosticLevel {
  ERROR = "error",
  WARNING = "warning",
  INFO = "info",
}

/**
 * Analysis options
 */
export interface AnalysisOptions {
  timeout?: number;
  maxSuggestions?: number;
}

/**
 * **Enhanced code analysis service with multi-analyzer support**
 */
export class CodeAnalysisService implements ICodeAnalysisService {
  private _onAnalysisComplete = new vscode.EventEmitter<AnalysisResult>();
  public readonly onAnalysisComplete = this._onAnalysisComplete.event;

  private analyzers: Map<string, ICodeAnalyzer> = new Map();
  private analysisQueue: Map<string, Promise<AnalysisResult>> = new Map();

  constructor() {
    // Register built-in analyzers
    this.registerBuiltInAnalyzers();
  }

  /**
   * **Register a new code analyzer**
   */
  registerAnalyzer(analyzer: ICodeAnalyzer): void {
    this.analyzers.set(analyzer.name, analyzer);
  }

  /**
   * **Unregister a code analyzer**
   */
  unregisterAnalyzer(name: string): void {
    const analyzer = this.analyzers.get(name);
    if (analyzer && analyzer.dispose) {
      analyzer.dispose();
    }
    this.analyzers.delete(name);
  }

  /**
   * **Get available analyzers for a language**
   */
  getAvailableAnalyzers(languageId?: string): ICodeAnalyzer[] {
    if (!languageId) {
      return Array.from(this.analyzers.values());
    }
    return Array.from(this.analyzers.values()).filter((analyzer) =>
      analyzer.supportedLanguages.includes(languageId)
    );
  }

  /**
   * **Analyze a document**
   */
  async analyzeDocument(
    document: vscode.TextDocument,
    options: AnalysisOptions = {}
  ): Promise<AnalysisResult> {
    const languageId = document.languageId;
    const content = document.getText();
    const uri = document.uri.toString();

    // Check if there's an ongoing analysis for this document
    if (this.analysisQueue.has(uri)) {
      return this.analysisQueue.get(uri)!;
    }

    const analyzers = this.getAvailableAnalyzers(languageId);
    if (analyzers.length === 0) {
      throw new Error(`No analyzers available for language: ${languageId}`);
    }

    // Use the first analyzer that supports the language
    const analyzer = analyzers[0];
    const analysisPromise = this.runAnalyzerSafe(
      analyzer,
      content,
      languageId,
      options
    );

    this.analysisQueue.set(uri, analysisPromise);

    try {
      const result = await analysisPromise;
      this._onAnalysisComplete.fire(result);
      return result;
    } finally {
      this.analysisQueue.delete(uri);
    }
  }

  private async runAnalyzerSafe(
    analyzer: ICodeAnalyzer,
    content: string,
    languageId: string,
    options: AnalysisOptions
  ): Promise<AnalysisResult> {
    try {
      const startTime = Date.now();
      const result = await analyzer.analyze(content, languageId);
      result.executionTime = Date.now() - startTime;
      return result;
    } catch (error) {
      return {
        metrics: { linesOfCode: 0, complexity: 0, maintainability: 0 },
        suggestions: [],
        errors: [
          {
            message: `Analysis failed: ${error instanceof Error ? error.message : error}`,
            severity: vscode.DiagnosticSeverity.Error,
            range: new vscode.Range(0, 0, 0, 0),
          },
        ],
        executionTime: 0,
      };
    }
  }

  private registerBuiltInAnalyzers() {
    this.registerAnalyzer(new GeneralCodeAnalyzer());
    this.registerAnalyzer(new JavaScriptAnalyzer());
    this.registerAnalyzer(new TypeScriptAnalyzer());
    this.registerAnalyzer(new PythonAnalyzer());
    this.registerAnalyzer(new JsonAnalyzer());
  }
}

/**
 * **General purpose code analyzer**
 */
class GeneralCodeAnalyzer implements ICodeAnalyzer {
  readonly name = "General";
  readonly supportedLanguages = ["*"];

  async analyze(content: string): Promise<AnalysisResult> {
    const lines = content.split("\n");
    const metrics: CodeMetrics = {
      linesOfCode: lines.length,
      complexity: Math.floor(lines.length / 10),
      maintainability: 100 - Math.min(100, Math.floor(lines.length / 50)),
    };

    return {
      metrics,
      suggestions: [],
      errors: [],
      executionTime: 0,
    };
  }
}

/**
 * **JavaScript code analyzer**
 */
class JavaScriptAnalyzer implements ICodeAnalyzer {
  readonly name = "JavaScript";
  readonly supportedLanguages = ["javascript", "javascriptreact"];

  async analyze(content: string): Promise<AnalysisResult> {
    // Simplified JavaScript analysis
    const lines = content.split("\n");
    const metrics: CodeMetrics = {
      linesOfCode: lines.length,
      complexity: Math.floor(lines.length / 5),
      maintainability: 100 - Math.min(100, Math.floor(lines.length / 20)),
    };

    return {
      metrics,
      suggestions: [],
      errors: [],
      executionTime: 0,
    };
  }
}

/**
 * **TypeScript code analyzer**
 */
class TypeScriptAnalyzer implements ICodeAnalyzer {
  readonly name = "TypeScript";
  readonly supportedLanguages = ["typescript", "typescriptreact"];

  async analyze(content: string): Promise<AnalysisResult> {
    // Simplified TypeScript analysis
    const lines = content.split("\n");
    const metrics: CodeMetrics = {
      linesOfCode: lines.length,
      complexity: Math.floor(lines.length / 7),
      maintainability: 100 - Math.min(100, Math.floor(lines.length / 25)),
    };

    return {
      metrics,
      suggestions: [],
      errors: [],
      executionTime: 0,
    };
  }
}

/**
 * **Python code analyzer**
 */
class PythonAnalyzer implements ICodeAnalyzer {
  readonly name = "Python";
  readonly supportedLanguages = ["python"];

  async analyze(content: string): Promise<AnalysisResult> {
    // Simplified Python analysis
    const lines = content.split("\n");
    const metrics: CodeMetrics = {
      linesOfCode: lines.length,
      complexity: Math.floor(lines.length / 8),
      maintainability: 100 - Math.min(100, Math.floor(lines.length / 30)),
    };

    return {
      metrics,
      suggestions: [],
      errors: [],
      executionTime: 0,
    };
  }
}

/**
 * **JSON code analyzer**
 */
class JsonAnalyzer implements ICodeAnalyzer {
  readonly name = "JSON";
  readonly supportedLanguages = ["json"];

  async analyze(content: string): Promise<AnalysisResult> {
    try {
      JSON.parse(content);
      return {
        metrics: {
          linesOfCode: content.split("\n").length,
          complexity: 0,
          maintainability: 100,
        },
        suggestions: [],
        errors: [],
        executionTime: 0,
      };
    } catch (error) {
      return {
        metrics: {
          linesOfCode: content.split("\n").length,
          complexity: 0,
          maintainability: 0,
        },
        suggestions: [],
        errors: [
          {
            message: `Invalid JSON: ${error instanceof Error ? error.message : error}`,
            severity: vscode.DiagnosticSeverity.Error,
            range: new vscode.Range(0, 0, 0, 0),
          },
        ],
        executionTime: 0,
      };
    }
  }
}
