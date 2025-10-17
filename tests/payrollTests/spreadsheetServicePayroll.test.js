import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import * as XLSX from "xlsx";
import fs from "fs-extra";
import path from "path";

import { writePayrollPivotXlsx } from "../../src/services/spreadsheetServicePayroll.js";

const TMP_DIR = path.join(process.cwd(), ".tmp-tests");
const OUT_XLSX = path.join(TMP_DIR, "pivot.xlsx");

beforeAll(async () => {
  await fs.ensureDir(TMP_DIR);
});

afterAll(async () => {
  await fs.remove(TMP_DIR);
});

function readSheetAoA(filename, sheetName = "HoleritePivot") {
  const data = fs.readFileSync(filename);
  const wb = XLSX.read(data, { type: "buffer" });
  const ws = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
}

describe("writePayrollPivotXlsx", () => {
  test("monta header dinâmico, mescla chaves canonizadas, converte footers v001 e remove colunas vazias", async () => {
    // ---------- months sintético ----------
    const months = [
      {
        ano: "2019",
        mes: "05",
        // Itens diversos:
        items: [
          // normal qtd/valor
          { baseKey: "(0100) Horas Trabalhadas", quantidade: 183.25, valor: 2037.74 },
          // variante com O→0 e barra na descrição (deve mesclar)
          { baseKey: "(O101) /D.S.R", quantidade: 43.98, valor: 489.06 },
          // /B002 (deve virar /B02) — valor-only neste mês
          { baseKey: "(/B002) /BO02 Adiantamento pago", quantidade: null, valor: 978.56 },
          // /Assist … precisa normalizar descrição
          { baseKey: "(7083) /Assist Medica Unimed", quantidade: null, valor: 16.99 },
          // retro: só VALOR
          { baseKey: "(0100) Horas Trabalhadas 04/2019 VALOR", quantidade: null, valor: 100.00 },
          // chave que nunca terá números (pra virar coluna 100% vazia e ser removida)
          { baseKey: "(9999) Lixo OCR", quantidade: null, valor: null },
        ],
        // footers v001 → devem virar (0000) …
        footers: {
          "Base Cálculo INSS": 3734.41,
          "Base Cálculo IRRF": 3323.63,
          "Base Cálculo FGTS": 3734.41,
          "FGTS a ser Depositado": 298.75,
          "13º Salário Antecipado em Férias": null,
          "Saldo Devedor": 0,
          "Líquido a Receber": null,
        },
      },
      {
        ano: "2019",
        mes: "06",
        items: [
          // normal do mês seguinte
          { baseKey: "(0100) Horas Trabalhadas", quantidade: 176.02, valor: 2057.67 },
          // a mesma D.S.R agora com código já em “0101” (deve mesclar com O101)
          { baseKey: "(0101) D.S.R", quantidade: 43.98, valor: 514.13 },
          // /B02 forma correta — deve somar com o mês anterior (/B002)
          { baseKey: "(/B02) Adiantamento pago", quantidade: null, valor: 1028.72 },
          // Assist sem barra — deve mesclar
          { baseKey: "(7083) Assist Medica Unimed", quantidade: null, valor: 57.39 },
          // retro 05/2019 só VALOR
          { baseKey: "(/314) Contr. INSS Remuneração 05/2019 VALOR", quantidade: null, valor: 21.06 },
        ],
        footers: {
          "Base Cálculo INSS": 3548.85,
          "Base Cálculo IRRF": 3328.85,
          "Base Cálculo FGTS": 3548.85,
          "FGTS a ser Depositado": 283.91,
          "Saldo Devedor": 0,
        },
      },
    ];

    // ---------- escreve e lê ----------
    await writePayrollPivotXlsx(months, OUT_XLSX);
    const aoa = readSheetAoA(OUT_XLSX);

    // ---------- header ----------
    const header = aoa[0];
    // as 2 primeiras colunas
    expect(header[0]).toBe("Ano");
    expect(header[1]).toBe("Mes");

    // (0000) … só VALOR
    expect(header).toContain("(0000) Base Cálculo INSS VALOR");
    expect(header).toContain("(0000) Base Cálculo IRRF VALOR");
    expect(header).toContain("(0000) Base Cálculo FGTS VALOR");
    expect(header).toContain("(0000) FGTS a ser Depositado VALOR");

    // (0100) Horas Trabalhadas → QTD e VALOR
    const hHas0100Qtd = header.includes("(0100) Horas Trabalhadas QUANTIDADE");
    const hHas0100Val = header.includes("(0100) Horas Trabalhadas VALOR");
    expect(hHas0100Qtd).toBe(true);
    expect(hHas0100Val).toBe(true);

    // retrô → só VALOR (sem QUANTIDADE)
    const retro0100 = header.includes("(0100) Horas Trabalhadas 04/2019 VALOR");
    const retro314 = header.includes("(/314) Contr. INSS Remuneração 05/2019 VALOR");
    expect(retro0100).toBe(true);
    expect(retro314).toBe(true);

    // /B002 e /B02 devem convergir para a MESMA coluna "( /B02 ) Adiantamento pago VALOR"
    const b02Col = header.filter(c => /Adiantamento pago VALOR$/.test(String(c)));
    expect(b02Col.length).toBe(1);

    // O101 → 0101 e “/D.S.R” normalizado → única dupla QTD/VALOR
    const dsrQtdCols = header.filter(c => /\(0101\)\s.*D\.?S\.?R.*QUANTIDADE$/i.test(String(c)));
    const dsrValCols = header.filter(c => /\(0101\)\s.*D\.?S\.?R.*VALOR$/i.test(String(c)));
    expect(dsrQtdCols.length).toBe(1);
    expect(dsrValCols.length).toBe(1);

    // 7083 /Assist … e Assist … devem virar uma única coluna VALOR
    const unimedCols = header.filter(c => /\(7083\)\sAssist Medica Unimed VALOR$/i.test(String(c)));
    expect(unimedCols.length).toBe(1);

    // coluna (9999) Lixo OCR deve sumir (100% vazia)
    expect(header.some(c => String(c).startsWith("(9999)"))).toBe(false);

    // ---------- linhas ----------
    // linha 1 (2019-05)
    const row1 = aoa[1];
    expect(row1[0]).toBe("2019");
    expect(row1[1]).toBe("05");

    // valores do (0000) em maio
    const idxInss = header.indexOf("(0000) Base Cálculo INSS VALOR");
    const idxIrrf = header.indexOf("(0000) Base Cálculo IRRF VALOR");
    const idxFgts = header.indexOf("(0000) Base Cálculo FGTS VALOR");
    const idxFgtsMes = header.indexOf("(0000) FGTS a ser Depositado VALOR");
    expect(row1[idxInss]).toBeCloseTo(3734.41, 2);
    expect(row1[idxIrrf]).toBeCloseTo(3323.63, 2);
    expect(row1[idxFgts]).toBeCloseTo(3734.41, 2);
    expect(row1[idxFgtsMes]).toBeCloseTo(298.75, 2);

    // (0100) maio
    const idx0100Q = header.indexOf("(0100) Horas Trabalhadas QUANTIDADE");
    const idx0100V = header.indexOf("(0100) Horas Trabalhadas VALOR");
    expect(row1[idx0100Q]).toBeCloseTo(183.25, 2);
    expect(row1[idx0100V]).toBeCloseTo(2037.74, 2);

    // retrô "(0100) … 04/2019 VALOR" só em maio
    const idxRetro0100 = header.indexOf("(0100) Horas Trabalhadas 04/2019 VALOR");
    expect(row1[idxRetro0100]).toBeCloseTo(100.0, 2);

    // /B02 agregado (somente VALOR)
    const idxB02 = header.findIndex(c => /\(\/B02\)\sAdiantamento pago VALOR$/.test(String(c)));
    expect(row1[idxB02]).toBeCloseTo(978.56, 2);

    // 7083 (somente VALOR)
    const idxUnimed = header.indexOf("(7083) Assist Medica Unimed VALOR");
    expect(row1[idxUnimed]).toBeCloseTo(16.99, 2);

    // linha 2 (2019-06)
    const row2 = aoa[2];
    expect(row2[0]).toBe("2019");
    expect(row2[1]).toBe("06");

    // (0000) junho
    expect(row2[idxInss]).toBeCloseTo(3548.85, 2);
    expect(row2[idxIrrf]).toBeCloseTo(3328.85, 2);
    expect(row2[idxFgts]).toBeCloseTo(3548.85, 2);
    expect(row2[idxFgtsMes]).toBeCloseTo(283.91, 2);

    // (0100) junho
    expect(row2[idx0100Q]).toBeCloseTo(176.02, 2);
    expect(row2[idx0100V]).toBeCloseTo(2057.67, 2);

    // retrô de /314 só em junho
    const idxRetro314 = header.indexOf("(/314) Contr. INSS Remuneração 05/2019 VALOR");
    expect(row2[idxRetro314]).toBeCloseTo(21.06, 2);

    // /B02 somado (maio + junho)
    expect(row2[idxB02]).toBeCloseTo(1028.72, 2);

    // 7083 somado por mês (não soma entre meses, cada linha tem o seu)
    expect(row2[idxUnimed]).toBeCloseTo(57.39, 2);

    // D.S.R mesclado (O101→0101, "/D.S.R"→"D.S.R")
    const idxDsrQ = header.findIndex(c => /\(0101\)\s.*D\.?S\.?R.*QUANTIDADE$/i.test(String(c)));
    const idxDsrV = header.findIndex(c => /\(0101\)\s.*D\.?S\.?R.*VALOR$/i.test(String(c)));
    expect(row1[idxDsrQ]).toBeCloseTo(43.98, 2);
    expect(row1[idxDsrV]).toBeCloseTo(489.06, 2);
    expect(row2[idxDsrQ]).toBeCloseTo(43.98, 2);
    expect(row2[idxDsrV]).toBeCloseTo(514.13, 2);
  });
});
