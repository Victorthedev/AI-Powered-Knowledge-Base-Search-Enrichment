import fs from "fs/promises";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import sharp from "sharp";
import { env } from "../config/env.js";

const execFileAsync = promisify(execFile);

function normalizeText(t: string): string {
  return t
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function guessKind(mimeType: string, storagePath: string): "pdf" | "docx" | "image" | "txt" {
  const ext = path.extname(storagePath).toLowerCase();

  if (mimeType === "application/pdf" || ext === ".pdf") return "pdf";
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === ".docx"
  ) return "docx";

  if (
    mimeType.startsWith("image/") ||
    [".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp"].includes(ext)
  ) return "image";

  return "txt";
}

async function ocrImagePathToText(imagePath: string): Promise<string> {
  const { stdout } = await execFileAsync("tesseract", [imagePath, "stdout", "-l", "eng"], {
    maxBuffer: 20 * 1024 * 1024
  });
  return normalizeText(stdout || "");
}

async function ocrImageBufferToText(buf: Buffer): Promise<string> {
  const processed = await sharp(buf).grayscale().normalize().png().toBuffer();

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wand-ocr-img-"));
  const imgPath = path.join(tmpDir, "img.png");

  await fs.writeFile(imgPath, processed);

  try {
    return await ocrImagePathToText(imgPath);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function ocrScannedPdfToText(pdfPath: string): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wand-ocr-pdf-"));
  const outPrefix = path.join(tmpDir, "page");

  try {
    await execFileAsync(
      "pdftoppm",
      [
        "-png",
        "-r",
        String(env.OCR_PDF_DPI),
        "-f",
        "1",
        "-l",
        String(env.OCR_PDF_MAX_PAGES),
        pdfPath,
        outPrefix
      ],
      { maxBuffer: 20 * 1024 * 1024 }
    );

    const files = (await fs.readdir(tmpDir))
      .filter((f) => f.startsWith("page-") && f.endsWith(".png"))
      .sort((a, b) => {
        const ai = parseInt(a.replace(/[^\d]/g, ""), 10);
        const bi = parseInt(b.replace(/[^\d]/g, ""), 10);
        return ai - bi;
      });

    let full = "";
    for (let i = 0; i < files.length; i++) {
      const p = path.join(tmpDir, files[i]);
      const pageText = await ocrImagePathToText(p);
      if (pageText) {
        full += `\n\n[PAGE ${i + 1}]\n${pageText}\n`;
      }
    }

    return normalizeText(full);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

export async function extractText(mimeType: string, storagePath: string): Promise<string> {
  const kind = guessKind(mimeType, storagePath);

  if (kind === "pdf") {
    const buf = await fs.readFile(storagePath);
    const data = await pdfParse(buf);
    const parsedText = normalizeText(data.text || "");

    if (
      env.SCANNED_PDF_OCR_ENABLED &&
      parsedText.length < env.OCR_MIN_TEXT_CHARS_BEFORE_OCR
    ) {
      const ocrText = await ocrScannedPdfToText(storagePath);
      return ocrText.length > parsedText.length ? ocrText : parsedText;
    }

    return parsedText;
  }

  const buf = await fs.readFile(storagePath);

  if (kind === "docx") {
    const result = await mammoth.extractRawText({ buffer: buf });
    return normalizeText(result.value || "");
  }

  if (kind === "image") {
    return await ocrImageBufferToText(buf);
  }

  return normalizeText(buf.toString("utf-8"));
}
