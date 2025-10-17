import * as XLSX from "xlsx";
import fs from "fs-extra";
import path from "path";

/** regex "HH:MM - HH:MM" */
const RANGE_RE = /^\s*(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s*$/;

/** parse "HH:MM - HH:MM" -> ["HH:MM","HH:MM"] | null */
function parseRange(rangeStr = "") {
    const m = String(rangeStr || "").match(RANGE_RE);
    if (!m) return null;
    return [m[1], m[2]];
}

/** parse número pt-BR "0,2" -> 0.2 (ou retorna "" se vazio/não numérico) */
function parsePtBrNumber(s) {
    if (s == null) return "";
    const t = String(s).trim();
    if (!t) return "";
    // mantém o marcador especial "(*)" como está
    if (t === "(*)") return t;
    // "-0,5" -> -0.5 ; "0,2" -> 0.2
    const num = Number(t.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(num) ? num : t;
}

/**
 * Converte um registro do parser (um dia) para uma linha:
 * [Data, E1,S1,E2,S2,E3,S3,E4,S4,E5,S5,E6,S6, HE Diurno, HE Noturno, ATN, Func, Situac, Insalub, Conc, DiaSemana, Obs]
 */
export function recordToRow(rec) {
    const data = rec.Dia; // dd/mm/yyyy

    const main = parseRange(rec["Entrada Saida"]); // expediente
    const iv1 = parseRange(rec["Intervalo 1"]);
    const iv2 = parseRange(rec["Intervalo 2"]);
    const iv3 = parseRange(rec["Intervalo 3"]);

    // Monta sequência cronológica de batidas
    // start, [iv1.start, iv1.end], [iv2...], [iv3...], end
    const stamps = [];
    if (main) {
        const [start, end] = main;
        stamps.push(start);

        [iv1, iv2, iv3].forEach((iv) => {
            if (iv) {
                stamps.push(iv[0]);
                stamps.push(iv[1]);
            }
        });

        // fim do expediente
        stamps.push(end);
    }

    // Pairing: [E1,S1,E2,S2, ...]
    const MAX_PAIRS = 6;
    const pairs = [];
    for (let i = 0; i < MAX_PAIRS; i++) {
        const e = stamps[i * 2] ?? "";
        const s = stamps[i * 2 + 1] ?? "";
        pairs.push(e, s);
    }

    // Campos adicionais (meta)
    const heDiurno = parsePtBrNumber(rec["HE Diurno"]);
    const heNoturno = parsePtBrNumber(rec["HE Noturno"]);
    const atn = rec.ATN || "";
    const func = rec["Func"] || "";
    const situac = rec["Situac"] || "";
    const insalub = rec["Insalub"] || "";
    const conc = rec["Conc"] || "";
    const diaSemana = rec["_DiaSemana"] || "";
    const obs = rec["_Obs"] || "";

    return [
        data,
        ...pairs,
        heDiurno,
        heNoturno,
        atn,
        func,
        situac,
        insalub,
        conc,
        diaSemana,
        obs,
    ];
}

/** Cabeçalho exigido + colunas adicionais */
export const HEADER = [
    "Data",
    "Entrada1", "Saída1",
    "Entrada2", "Saída2",
    "Entrada3", "Saída3",
    "Entrada4", "Saída4",
    "Entrada5", "Saída5",
    "Entrada6", "Saída6",
    "HE Diurno",
    "HE Noturno",
    "ATN",
    "Func",
    "Situac",
    "Insalub",
    "Conc",
    "DiaSemana",
    "Obs",
];

/** Escreve XLSX com as linhas */
export async function writeTimecardXlsx(records, outputPath) {
    const rows = records.map(recordToRow);

    // Monta planilha (AOA = Array of Arrays)
    const aoa = [HEADER, ...rows];

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "CartaoPonto");

    await fs.ensureDir(path.dirname(outputPath));
    XLSX.writeFile(wb, outputPath, { bookType: "xlsx" });
}
