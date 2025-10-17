import fs from "fs-extra";
import { writePayrollPivotXlsx } from "../services/spreadsheetServicePayroll.js";
import { parsePayrollAuto } from "../routers/payrollRouter.js";

const [, , pdfPath, outPathArg] = process.argv;
const outputXlsx = outPathArg || "src/outputs/holerite_transcrito.xlsx";

if (!pdfPath) {
    console.error("Uso: node src/cli/parse-payroll.js <holerite.pdf> [saida.xlsx]");
    process.exit(1);
}

(async () => {
    try {
        const months = await parsePayrollAuto(pdfPath);
        // await fs.writeJson("output-holerite.json", months, { spaces: 2 });
        await writePayrollPivotXlsx(months, outputXlsx);
        console.log("Planilha gerada:", outputXlsx);
    } catch (err) {
        console.error("Erro:", err.message);
        process.exit(1);
    }
})();
