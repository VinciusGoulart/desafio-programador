// src/utils/ocrUtils.js
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";
import sharp from "sharp";
import { createWorker } from "tesseract.js";

const execFileP = promisify(execFile);

// __dirname em ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ------------------------------------------------------------------ */
/*                    Localização do pdftoppm (Poppler)                */
/* ------------------------------------------------------------------ */
async function findPdftoppm() {
  // 1) var. ambiente explícita
  const envPath = process.env.PDTOPPM_PATH;
  if (envPath && await fs.pathExists(envPath)) return envPath;

  // 2) caminhos comuns no Windows (binários pré-compilados)
  const candidates = [
    "C:\\poppler\\Library\\bin\\pdftoppm.exe",
    "C:\\Program Files\\poppler\\bin\\pdftoppm.exe",
    "C:\\Program Files\\Poppler\\bin\\pdftoppm.exe",
    "C:\\ProgramData\\chocolatey\\lib\\poppler\\tools\\poppler-25.10.0\\Library\\bin\\pdftoppm.exe",
    "C:\\ProgramData\\chocolatey\\lib\\poppler\\tools\\poppler-25.07.0\\Library\\bin\\pdftoppm.exe",
  ];
  for (const c of candidates) {
    if (await fs.pathExists(c)) return c;
  }

  // 3) confia no PATH
  return "pdftoppm";
}

async function ensureDir(dir) {
  await fs.ensureDir(dir);
  return dir;
}

async function pdfToPngsWithPoppler(pdfPath, { dpi = 300, outDir = "tmp_ocr" } = {}) {
  await ensureDir(outDir);
  const outPrefix = path.join(outDir, "page");
  const pdftoppm = await findPdftoppm();

  try {
    // pdftoppm -png -r <dpi> input.pdf outdir/page
    await execFileP(pdftoppm, ["-png", "-r", String(dpi), pdfPath, outPrefix]);
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(
        'pdftoppm não encontrado. Instale o Poppler ou defina PDTOPPM_PATH com o caminho do executável (ex.: "C:\\\\poppler\\\\Library\\\\bin\\\\pdftoppm.exe").'
      );
    }
    throw err;
  }

  const files = (await fs.readdir(outDir))
    .filter((f) => f.startsWith("page-") && f.endsWith(".png"))
    .map((f) => path.join(outDir, f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (!files.length) {
    throw new Error("Falha ao converter PDF em imagens (pdftoppm não gerou PNGs).");
  }
  return files;
}

/* ------------------------------------------------------------------ */
/*                          Pré-processamento                          */
/* ------------------------------------------------------------------ */
async function preprocess(imgPath) {
  // Binarização suave ajuda bastante em holerites digitalizados
  return sharp(imgPath).grayscale().normalize().threshold(180).toBuffer();
}

/* ------------------------------------------------------------------ */
/*                                OCR                                  */
/* ------------------------------------------------------------------ */
export async function ocrPdfToText(
  pdfPath,
  { dpi = 300, lang = "por_fast+eng_fast" } = {}
) {
  const outDir = path.join(process.cwd(), ".ocr_cache");
  const pngs = await pdfToPngsWithPoppler(pdfPath, { dpi, outDir });

  // Se houver tessdata local, use-o (offline). Ex.: <repo>/tessdata/por_fast.traineddata
  const localTessdataDir = path.resolve(__dirname, "..", "tessdata");
  const hasLocalTessdata = await fs.pathExists(localTessdataDir);

  const worker = await createWorker(lang, 1, {
    // langPath só se existir local (evita URLs antigas/404)
    ...(hasLocalTessdata ? { langPath: localTessdataDir } : {}),
    cachePath: path.join(outDir, "tess-cache"),
    gzip: false,
  });

  // Configurações úteis
  await worker.setParameters({
    // PSM 6: bloco único de texto — bom para holerites
    tessedit_pageseg_mode: "6",
    // ajuda o tesseract a calibrar escala
    user_defined_dpi: String(dpi),
    // manter espaços (melhora regex de "código descrição")
    preserve_interword_spaces: "1",
    // dica: se quiser restringir a caracteres de números/pt-br, ative:
    // tessedit_char_whitelist: "0123456789.,-%/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzçÇáàâãéêíóôõúÁÀÂÃÉÊÍÓÔÕÚ",
  });

  let fullText = "";
  for (const imgPath of pngs) {
    const input = await preprocess(imgPath);
    const { data } = await worker.recognize(input);
    fullText += (data.text || "") + "\n";
  }

  await worker.terminate();
  return fullText;
}
