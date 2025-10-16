import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { createRequire } from "node:module";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const require = createRequire(import.meta.url);
const pdfjsEntryPath = require.resolve("pdfjs-dist/legacy/build/pdf.mjs");
const pdfjsRootDir = path.resolve(pdfjsEntryPath, "..", "..");
const baseUrl = pathToFileURL(pdfjsRootDir + path.sep).href;

const cMapUrl = new URL("cmaps/", baseUrl).href; 

export async function extractTextFromPDF(filePath) {
  const data = new Uint8Array(fs.readFileSync(filePath));

  const pdf = await pdfjsLib.getDocument({
    data,
    cMapUrl,
    cMapPacked: true,
    useSystemFonts: true,
    CMapReaderFactory: pdfjsLib.DefaultCMapReaderFactory,
    StandardFontDataFactory: pdfjsLib.DefaultStandardFontDataFactory,
    verbosity: pdfjsLib.VerbosityLevel.ERRORS,
  }).promise;

  let text = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(" ") + "\n";
  }
  return text;
}
