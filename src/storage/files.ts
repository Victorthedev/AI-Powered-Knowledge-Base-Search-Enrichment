import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { env } from "../config/env.js";

export async function ensureDirs() {
  await fs.mkdir(path.join(env.STORAGE_DIR, "uploads"), { recursive: true });
  await fs.mkdir(path.join(env.STORAGE_DIR, "text"), { recursive: true });
}

export function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export async function saveUpload(docId: string, originalName: string, buf: Buffer) {
  await ensureDirs();
  const safeName = originalName.replace(/[^\w.\-]+/g, "_");
  const storagePath = path.join(env.STORAGE_DIR, "uploads", `${docId}-${safeName}`);
  await fs.writeFile(storagePath, buf);
  return storagePath;
}

export async function saveExtractedText(docId: string, text: string) {
  await ensureDirs();
  const textPath = path.join(env.STORAGE_DIR, "text", `${docId}.txt`);
  await fs.writeFile(textPath, text, "utf-8");
  return textPath;
}
