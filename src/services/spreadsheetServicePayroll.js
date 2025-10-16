import * as XLSX from "xlsx";
import fs from "fs-extra";
import path from "path";

/** 7 colunas simples, sem código e apenas VALOR */
const FOOTER_LABELS = [
  "13º Salário Antecipado em Férias",
  "Saldo Devedor",
  "Base Cálculo INSS",
  "Líquido a Receber",
  "Base Cálculo IRRF",
  "Base Cálculo FGTS",
  "FGTS a ser Depositado",
];

/**
 * months = [{ mes, ano, items: [{ baseKey, quantidade, valor }], footers: {label: number|null} }]
 * Saída:
 * Ano | Mes | (code) desc QUANTIDADE | (code) desc VALOR | ... | 13º Salário Antecipado em Férias | ... (7 labels)
 */
export async function writePayrollPivotXlsx(months, outputPath) {
  // 1) coleciona todas as chaves com código (baseKey) para pares QTD/VALOR
  const baseKeysSet = new Set();
  for (const m of months) {
    for (const it of m.items) {
      if (it.baseKey) baseKeysSet.add(it.baseKey);
    }
  }
  const baseKeys = Array.from(baseKeysSet).sort((a, b) => {
    // ordena por código, depois descrição; "(00000) ..." (se existisse) iria ao final
    const ca = a.match(/^\((.*?)\)/)?.[1] ?? "";
    const cb = b.match(/^\((.*?)\)/)?.[1] ?? "";
    if (ca === "00000" && cb !== "00000") return 1;
    if (cb === "00000" && ca !== "00000") return -1;
    return a.localeCompare(b, "pt-BR");
  });

  // 2) header
  const header = ["Ano", "Mes"];
  for (const k of baseKeys) {
    header.push(`${k} QUANTIDADE`, `${k} VALOR`);
  }
  // adiciona as 7 colunas simples (na ordem pedida)
  header.push(...FOOTER_LABELS);

  // 3) linhas
  const aoa = [header];
  for (const m of months) {
    const row = new Array(header.length).fill("");
    row[0] = m.ano;
    row[1] = m.mes;

    // agrega itens com código
    const agg = new Map(); // baseKey -> {qtd, val, hasQtd, hasVal}
    for (const it of m.items) {
      const prev = agg.get(it.baseKey) || { qtd: 0, val: 0, hasQtd: false, hasVal: false };
      if (typeof it.quantidade === "number") {
        prev.qtd += it.quantidade;
        prev.hasQtd = true;
      }
      if (typeof it.valor === "number") {
        prev.val += it.valor;
        prev.hasVal = true;
      }
      agg.set(it.baseKey, prev);
    }

    // preenche pares QTD/VALOR
    let col = 2;
    for (const k of baseKeys) {
      const rec = agg.get(k);
      row[col] = rec?.hasQtd ? rec.qtd : ""; col++;
      row[col] = rec?.hasVal ? rec.val : ""; col++;
    }

    // preenche as 7 colunas simples (apenas VALOR)
    for (const label of FOOTER_LABELS) {
      const v = m.footers?.[label];
      row[col] = typeof v === "number" ? v : "";
      col++;
    }

    aoa.push(row);
  }

  // 4) escreve XLSX
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "HoleritePivot");

  await fs.ensureDir(path.dirname(outputPath));
  XLSX.writeFile(wb, outputPath, { bookType: "xlsx" });
}
