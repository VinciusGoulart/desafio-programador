import * as XLSX from "xlsx";
import fs from "fs-extra";
import path from "path";

/**
 * months = [{
 *   mes, ano,
 *   items: [{ baseKey, quantidade, valor }],
 *   footers?: { label: number|null }  // v001 apenas
 * }]
 *
 * Regras:
 * - (0000) ...  e ... "mm/aaaa VALOR" => coluna só VALOR (sem QUANTIDADE)
 * - Colunas inteiramente vazias são removidas.
 * - Footers (v001) só viram colunas se tiverem algum valor em algum mês; entram como "(0000) <label>" VALOR.
 * - Normalização de baseKey para evitar duplicatas de OCR.
 */

function normSpace(s) {
  return String(s || "").replace(/[ \t]+/g, " ").trim();
}

// Normaliza baseKey para evitar colunas duplicadas por ruído do OCR
function canonicalizeBaseKey(key) {
  let k = normSpace(key).replace(/[[]]/g, ""); // tira colchetes soltos
  // se for retroativo, preserve o sufixo "mm/aaaa VALOR" separadamente
  let retroSuffix = "";
  const mRetro = k.match(/\b([0-1]\d)\/(\d{4})\s+VALOR$/i);
  if (mRetro) {
    retroSuffix = ` ${mRetro[1]}/${mRetro[2]} VALOR`;
    k = k.slice(0, k.length - retroSuffix.length).trim();
  }

  // separa "(code) desc"
  const m = k.match(/^\(([^)]+)\)\s*(.+)$/);
  if (!m) return normSpace(key); // fallback
  let code = m[1].toUpperCase();
  let desc = m[2];

  // Corrige código com letra O virando 0 quando houver dígitos (ex.: O101 -> 0101)
  if (/\d/.test(code)) code = code.replace(/O/g, "0");

  // Compacta múltiplos zeros comuns em OCR de códigos do tipo /B002 -> /B02 (opcional, seguro caso específico)
  code = code.replace(/^\/B0+2$/i, "/B02");

  // Normaliza a descrição:
  desc = desc
    .replace(/^[\/\\]+/, "")       // remove "/" no início
    .replace(/\s*\/\s*/g, "/")     // "/ DSR" -> "/DSR"
    .replace(/\s{2,}/g, " ")       // espaços múltiplos
    .replace(/^\//, "")            // "/" sobrando
    .trim();

  // Alguns ruídos comuns:
  desc = desc.replace(/^\/?Assist\s+/i, s => s.replace("/", "")); // "/Assist" -> "Assist"
  desc = desc.replace(/^I\/I?DSR\b/i, "DSR"); // "I/IDSR" -> "DSR" (se você preferir manter, remova esta linha)

  // Remonta
  const base = `(${code}) ${desc}`;
  return retroSuffix ? `${base}${retroSuffix}` : base;
}

function isValueOnlyKey(baseKey) {
  // (0000) ... => só valor
  if (/^\(0000\)\s/i.test(baseKey)) return true;
  // retroativo "... mm/aaaa VALOR" => só valor
  if (/\b([0-1]\d)\/\d{4}\s+VALOR$/i.test(baseKey)) return true;
  return false;
}

export async function writePayrollPivotXlsx(months, outputPath) {
  // 1) Converte footers (v001) para itens (0000) apenas quando tiverem valor
  const monthsExpanded = months.map(m => {
    const extra = [];
    if (m.footers && typeof m.footers === "object") {
      for (const [label, val] of Object.entries(m.footers)) {
        if (typeof val === "number" && !Number.isNaN(val) && val !== 0) {
          extra.push({
            baseKey: `(0000) ${label}`,
            quantidade: null,
            valor: val,
          });
        }
      }
    }
    return {
      ...m,
      items: [...(m.items || []), ...extra],
    };
  });

  // 2) Canonicaliza baseKeys e agrega meta (se tem qtd/valor em algum mês)
  const meta = new Map(); // key -> { hasQtdAny, hasValAny }
  for (const m of monthsExpanded) {
    for (const it of m.items || []) {
      if (!it.baseKey) continue;
      const canon = canonicalizeBaseKey(it.baseKey);
      const cur = meta.get(canon) || { hasQtdAny: false, hasValAny: false, valueOnly: false };
      cur.hasQtdAny = cur.hasQtdAny || (typeof it.quantidade === "number");
      cur.hasValAny = cur.hasValAny || (typeof it.valor === "number");
      cur.valueOnly = isValueOnlyKey(canon) || cur.valueOnly;
      meta.set(canon, cur);
    }
  }

  // 3) Define a ordem das colunas:
  //    - (0000) primeiro (ordenados por nome)
  //    - depois códigos "normais" por código/descrição
  const allKeys = Array.from(meta.keys());
  const zeros = allKeys.filter(k => k.startsWith("(0000) ")).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const normals = allKeys.filter(k => !k.startsWith("(0000) ")).sort((a, b) => {
    const ca = a.match(/^\((.*?)\)/)?.[1] ?? "";
    const cb = b.match(/^\((.*?)\)/)?.[1] ?? "";
    return ca.localeCompare(cb, "pt-BR") || a.localeCompare(b, "pt-BR");
  });
  const orderedKeys = [...zeros, ...normals];

  // 4) Monta header dinâmico:
  //    - para valueOnly => só "VALOR"
  //    - senão => "QUANTIDADE" + "VALOR" (se houver valor em algum mês)
  const header = ["Ano", "Mes"];
  const colIndex = new Map(); // mapeia (key, field) -> index
  for (const k of orderedKeys) {
    const m = meta.get(k);
    if (!m) continue;
    if (m.valueOnly || !m.hasQtdAny) {
      // só VALOR
      const colName = `${k} VALOR`;
      colIndex.set(`${k}::VALOR`, header.length);
      header.push(colName);
    } else {
      // par QTD/VALOR
      const qCol = `${k} QUANTIDADE`;
      const vCol = `${k} VALOR`;
      colIndex.set(`${k}::QTD`, header.length);
      header.push(qCol);
      colIndex.set(`${k}::VALOR`, header.length);
      header.push(vCol);
    }
  }

  // 5) Preenche linhas (Ano, Mes + colunas)
  const aoa = [header];
  // para saber colunas em uso, vamos marcar quando preencher algo
  const used = new Array(header.length).fill(false);

  for (const m of monthsExpanded) {
    const row = new Array(header.length).fill("");
    row[0] = m.ano ?? "";
    row[1] = m.mes ?? "";

    // agrega por baseKey canonical
    const agg = new Map(); // key -> { qtdSum, valSum, hasQtd, hasVal }
    for (const it of m.items || []) {
      if (!it.baseKey) continue;
      const k = canonicalizeBaseKey(it.baseKey);
      const prev = agg.get(k) || { qtdSum: 0, valSum: 0, hasQtd: false, hasVal: false };
      if (typeof it.quantidade === "number") { prev.qtdSum += it.quantidade; prev.hasQtd = true; }
      if (typeof it.valor === "number") { prev.valSum += it.valor; prev.hasVal = true; }
      agg.set(k, prev);
    }

    // preenche
    for (const k of orderedKeys) {
      const metaK = meta.get(k);
      const rec = agg.get(k);
      if (!metaK) continue;

      if (metaK.valueOnly || !metaK.hasQtdAny) {
        const idx = colIndex.get(`${k}::VALOR`);
        if (idx != null) {
          const v = rec?.hasVal ? rec.valSum : "";
          row[idx] = v;
          if (v !== "" && v != null) used[idx] = true;
        }
      } else {
        const idxQ = colIndex.get(`${k}::QTD`);
        const idxV = colIndex.get(`${k}::VALOR`);
        if (idxQ != null) {
          const q = rec?.hasQtd ? rec.qtdSum : "";
          row[idxQ] = q;
          if (q !== "" && q != null) used[idxQ] = true;
        }
        if (idxV != null) {
          const v = rec?.hasVal ? rec.valSum : "";
          row[idxV] = v;
          if (v !== "" && v != null) used[idxV] = true;
        }
      }
    }

    aoa.push(row);
  }

  // 6) Remove colunas totalmente vazias (exceto "Ano" e "Mes")
  const keepIdx = header.map((_, i) => i < 2 || used[i]);
  // const finalHeader = header.filter((_, i) => keepIdx[i]);
  const finalAoa = aoa.map((r, rIdx) => r.filter((_, i) => keepIdx[i]));

  // 7) Escreve XLSX
  const ws = XLSX.utils.aoa_to_sheet(finalAoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "HoleritePivot");

  await fs.ensureDir(path.dirname(outputPath));
  XLSX.writeFile(wb, outputPath, { bookType: "xlsx" });
}
