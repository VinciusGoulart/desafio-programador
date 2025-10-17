import { jest, describe, test, expect } from "@jest/globals";

// Fixture OCR (recorte do seu exemplo, mantendo quebras)
const RAW = `
Período : 05/2019
0100 Horas Trabalhadas                 183,25        2.037,74
/314 |Contr. INSS Remuneração            11,00                          410,78
Base I.N.S.S. :     3.734,41          F.G.T.S. do Mês   :       298,75
Base I.R.R.F. :     3.323,63          Base FGTS:              3.734,41
Dep. I.R.R.F. :         1,00

| |
0100 Horas Trabalhadas         05/2019                 104,45
/314 |Contr. INSS Remuneração   05/2019                                  21,06
/314 |Contr. INSS Remuneração            11,00                          390,37
Base I.N.S.S. :     3.548,85          F.G.T.S. do Mês   :       283,91
Base I.R.R.F. :     3.328,85          Base FGTS:              3.548,85

Período : 07/2019
0100 Horas Trabalhadas                 190,58        2.227,88
Base I.N.S.S. :     3.928,92          F.G.T.S. do Mês   :       314,31
Base I.R.R.F. :     3.496,74          Base FGTS:              3.928,92
`;

// 1) Mock do OCR antes do import
await jest.unstable_mockModule("../../src/utils/ocrUtils.js", () => ({
  ocrPdfToText: jest.fn(async () => RAW),
}));

// 2) Import dinâmico do parser v2
const { parsePayrollOCR } = await import("../../src/parsers/payrollOCRParser.js");

describe("parsePayrollOCR - períodos, retro e rodapé", () => {
  test("05/2019, 06/2019 (pipe-only + candidato +1), 07/2019", async () => {
    const months = await parsePayrollOCR("dummy.pdf");

    // mapeamento de períodos
    expect(months.map(m => `${m.ano}-${m.mes}`)).toEqual(["2019-05","2019-06","2019-07"]);

    // 05: item normal + rodapé em (0000)
    const may = months[0];
    const ksetMay = new Set(may.items.map(i => i.baseKey));
    expect(ksetMay.has("(0100) Horas Trabalhadas")).toBe(true);
    expect(ksetMay.has("(0000) Base I.N.S.S.")).toBe(true);
    expect(ksetMay.has("(0000) F.G.T.S. do Mês")).toBe(true);
    expect(ksetMay.has("(0000) Base I.R.R.F.")).toBe(true);
    expect(ksetMay.has("(0000) Base FGTS")).toBe(true);
    expect(ksetMay.has("(0000) Dep. I.R.R.F.")).toBe(true);

    // 06: tem retro (05/2019) e também itens normais
    const jun = months[1];
    const keysJun = new Set(jun.items.map(i => i.baseKey));
    expect(keysJun.has("(0100) Horas Trabalhadas 05/2019")).toBe(true);
    expect(keysJun.has("(/314) Contr. INSS Remuneração 05/2019")).toBe(true); 
    expect(keysJun.has("(/314) Contr. INSS Remuneração")).toBe(true); 
  });
});
