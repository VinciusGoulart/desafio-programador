import fs from "fs-extra";
import { writePayrollPivotXlsx } from "../services/spreadsheetServicePayroll.js";
import { extractTextFromPDF } from "../utils/pdfutils.js";
import { parsePayrollV2 } from "../parsers/payrollparserv2.js";
// import { parsePayroll } from "../parsers/payRollParser.js";
// import { ocrPdfToText } from "../utils/ocfUtils.js";
// import { parsePayrollFromText } from "../parsers/payrollOCRParser.js";

const [, , pdfPath, outPathArg] = process.argv;
const outputXlsx = outPathArg || "holerite_transcrito.xlsx";

if (!pdfPath) {
    console.error("Uso: node src/cli/parse-payroll.js <holerite.pdf> [saida.xlsx]");
    process.exit(1);
}

(async () => {
    try {
        let raw = "";
        let months = null;
        raw = await extractTextFromPDF(pdfPath);

        // const hasMesAno = /M[eê]s\/Ano\s*:\s*[0-1]\d\/\d{4}/i.test(raw);
        // const hasPeriodo = /Per[ií]odo\s*:\s*[0-1]\d\/\d{4}/i.test(raw);
        // if (raw && raw.length > 10 && (hasMesAno || hasPeriodo)) {
        //     months = await parsePayroll(pdfPath);
        //     await fs.writeJson("output-holerite.json", months, { spaces: 2 });
        // } else {
        // raw = await ocrPdfToText(pdfPath, { dpi: 300, lang: "por" });
        // await fs.writeFile("raw-holerite-ocr.txt", raw);

        // months = parsePayrollFromText(raw);
        // await fs.writeJson("output-holerite-ocr.json", months, { spaces: 2 });
        // }
        // await writePayrollPivotXlsx(months, outputXlsx);

        months = await parsePayrollV2(pdfPath);
        await fs.writeJson("output-holerite-v002.json", months, { spaces: 2 });
        await writePayrollPivotXlsx(months, outputXlsx);

        console.log("Planilha gerada:", outputXlsx);
    } catch (err) {
        console.error("Erro:", err.message);
        process.exit(1);
    }
})();
