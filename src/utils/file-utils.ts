import { Stats } from "fs";
import * as fsPromises from "fs/promises";
import * as path from "path";
import { EncodingInfo } from "../types";

/**
 * **Utility functions for file operations**
 */
export class FileUtils {
  /**
   * **Detect file encoding**
   */
  static async detectEncoding(filePath: string): Promise<EncodingInfo> {
    try {
      const buffer = await fsPromises.readFile(filePath);

      // **Check for BOM**
      const hasBOM =
        buffer.length >= 3 &&
        buffer[0] === 0xef &&
        buffer[1] === 0xbb &&
        buffer[2] === 0xbf;

      // **Simple encoding detection**
      let encoding = "utf-8";
      let confident = true;

      // **Check for null bytes (potential binary file)**
      if (buffer.includes(0)) {
        encoding = "binary";
        confident = false;
      }

      return {
        encoding,
        hasBOM,
        confident,
      };
    } catch (error) {
      return {
        encoding: "utf-8",
        hasBOM: false,
        confident: false,
      };
    }
  }

  /**
   * **Read file with proper encoding handling**
   */
  static async readFileWithEncoding(
    filePath: string
  ): Promise<{ content: string; encoding: EncodingInfo }> {
    const encoding = await FileUtils.detectEncoding(filePath);

    let content: string;
    try {
      if (encoding.encoding === "binary") {
        throw new Error("Binary file detected");
      }

      content = await fsPromises.readFile(filePath, "utf-8");

      // **Remove BOM if present**
      if (encoding.hasBOM && content.charCodeAt(0) === 0xfeff) {
        content = content.slice(1);
      }
    } catch (error) {
      throw new Error(
        `Failed to read file: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    return { content, encoding };
  }

  /**
   * **Write file with proper encoding handling**
   */
  static async writeFileWithEncoding(
    filePath: string,
    content: string,
    encoding: EncodingInfo
  ): Promise<void> {
    try {
      let finalContent = content;

      // **Add BOM if required**
      if (encoding.hasBOM) {
        finalContent = "\uFEFF" + content;
      }

      await fsPromises.writeFile(filePath, finalContent, "utf-8");
    } catch (error) {
      throw new Error(
        `Failed to write file: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * **Get file extension**
   */
  static getFileExtension(filePath: string): string {
    return path.extname(filePath).toLowerCase();
  }

  /**
   * **Check if file exists**
   */
  static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fsPromises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * **Get file stats**
   */
  static async getFileStats(filePath: string): Promise<Stats | null> {
    try {
      return await fsPromises.stat(filePath);
    } catch {
      return null;
    }
  }

  /**
   * **Create backup file**
   */
  static async createBackup(filePath: string): Promise<string> {
    const backupPath = `${filePath}.backup.${Date.now()}`;

    try {
      await fsPromises.copyFile(filePath, backupPath);
      return backupPath;
    } catch (error) {
      throw new Error(
        `Failed to create backup: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * **Clean up old backup files**
   */
  static async cleanupBackups(
    directory: string,
    maxAge: number = 7 * 24 * 60 * 60 * 1000
  ): Promise<void> {
    try {
      const files = await fsPromises.readdir(directory);
      const backupFiles = files.filter((file) => file.includes(".backup."));

      const now = Date.now();

      for (const backupFile of backupFiles) {
        const filePath = path.join(directory, backupFile);
        const stats = await FileUtils.getFileStats(filePath);

        if (stats && now - stats.mtime.getTime() > maxAge) {
          await fsPromises.unlink(filePath);
        }
      }
    } catch (error) {
      // **Ignore cleanup errors**
    }
  }
}
