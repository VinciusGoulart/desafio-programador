import { writePayrollPivotXlsx } from "../services/spreadsheetServicePayroll.js";
import fs from "fs-extra";
import { extractTextFromPDF } from "../utils/pdfutils.js";
import { parsePayroll } from "../parsers/payRollParser.js";

const [, , pdfPath, outPathArg] = process.argv;
const outputXlsx = outPathArg || "holerite_transcrito.xlsx";

if (!pdfPath) {
  console.error("Uso: node src/cli/parse-payroll.js <holerite.pdf> [saida.xlsx]");
  process.exit(1);
}

(async () => {
  try {
    // dump raw (útil para diagnosticar PDFs novos)
    // const raw = await extractTextFromPDF(pdfPath);
    // await fs.writeFile("raw-holerite.txt", raw);

    const months = await parsePayroll(pdfPath);
    await fs.writeJson("output-holerite.json", months, { spaces: 2 });

    await writePayrollPivotXlsx(months, outputXlsx);

    console.log("Planilha gerada:", outputXlsx);
  } catch (err) {
    console.error("Erro:", err.message);
    process.exit(1);
  }
})();
