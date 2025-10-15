import fs from "fs-extra";
import { parseTimeCard } from "../parsers/timeCardParser.js";
import { writeTimecardXlsx } from "../services/spreadsheetService.js";

const [, , pdfPath, outPathArg] = process.argv;
const outputXlsx = outPathArg || "cartao_ponto_transcrito.xlsx";

if (!pdfPath) {
    console.error("Uso: node src/cli/parse-time-card.js <arquivo.pdf> [saida.xlsx]");
    process.exit(1);
}

(async () => {
    try {
        const data = await parseTimeCard(pdfPath);

        // (opcional) também salvar JSON para depuração
        // await fs.writeJson("output-timecard.json", data, { spaces: 2 });

        await writeTimecardXlsx(data, outputXlsx);

        console.log("Planilha gerada:", outputXlsx);
    } catch (err) {
        console.error("Erro:", err.message);
        process.exit(1);
    }
})();