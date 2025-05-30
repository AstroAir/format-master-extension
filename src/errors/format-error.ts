/**
 * Custom error class for formatting errors
 */
export class FormatError extends Error {
  /**
   * Creates a new FormatError instance
   * @param message - The error message
   * @param languageId - The language identifier where the error occurred
   * @param originalError - The original error that caused this format error
   */
  constructor(
    message: string,
    public readonly languageId: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = "FormatError";
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error thrown when a language is not supported by any formatter
 */
export class UnsupportedLanguageError extends FormatError {
  /**
   * Creates a new UnsupportedLanguageError instance
   * @param languageId - The unsupported language identifier
   */
  constructor(languageId: string) {
    super(`No formatter available for language: ${languageId}`, languageId);
    this.name = "UnsupportedLanguageError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
