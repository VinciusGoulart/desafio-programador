import { parsePayrollOCR } from "../parsers/payrollOCRParser.js";
import { parsePayrollPDF } from "../parsers/payrollPDFParser.js";
import { extractTextFromPDF } from "../utils/pdfutils.js";

function looksLikeType2(rawText) {
    const t = rawText.toUpperCase();
    if (/PER[ÍI]ODO\s*:\s*[0-1]\d\/\d{4}/i.test(t)) return true;
    // muitos pipes vazios | | aparecem no OCR do tipo 2:
    const pipeBlocks = (rawText.match(/^\s*\|\s*\|/gm) || []).length;
    if (pipeBlocks >= 2) return true;
    return false;
}

function looksLikeType1(rawText) {
    const t = rawText.toUpperCase();
    const hasProvHeader = /P\s+R\s+O\s+V\s+E\s+N\s+T\s+O\s+S/i.test(t)
        && /C[ÓO]DIGO\s+DESCRI[ÇC][AÃ]O\s+QTDE\.\s+VALOR/i.test(t);
    const hasMesAno = /M[ÊE]S\/ANO\s*:/.test(t);
    return hasProvHeader || hasMesAno;
}

function codeCount(rawText) {
    const m = rawText.match(/(?:^|\s)(\/[A-Z0-9]{2,5}|[A-Z]?\d{3,5}|M\d{3,5})(?=$|[\s\/\|\[\(])/g);
    return m ? m.length : 0;
}

export async function parsePayrollAuto(pdfPath) {
    // tenta extrair texto rápido
    const raw = await extractTextFromPDF(pdfPath);
    const cc = codeCount(raw);

    if (looksLikeType2(raw)) {
        return parsePayrollOCR(pdfPath);
    }

    if (looksLikeType1(raw) && cc >= 5) {
        const months = await parsePayrollPDF(pdfPath);
        if (months && months.length) return months;
    }

    // 3) fallback OCR
    return parsePayrollOCR(pdfPath);
}
