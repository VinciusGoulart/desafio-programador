import { jest, describe, test, expect, beforeAll } from "@jest/globals";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// RAW do tipo 1: "Mês/Ano" aparece ao FINAL do bloco
const RAW = `0020   Horas   Normais   169,75   702,18 0060   Desc.   Semanal Remunerado   42,50   172,90 1000   Auxílio   Doença   6,00   22,44 1510   Integração Médias   D.S.R.   8,10   29,66 1550   Horas   Extras 100%   12,50   97,83 1554   Hs.Extras   100%   Dom/Fer   18,75   145,22 /314   INSS - Remuneração   7,00   84,56 5020   Adiantamento Salarial   128,40 5260   Energia   Elétrica   14,98 5270   Mensalid.   BarracredCosan   10,00 5280   Financiam. BarracredCosan   141,56 5360   Promoção Páscoa   11,23 5378   Refeição IND   19,00   8,76 5393   Seguro de   Vida   Zanin   5,10 5430   Convênio Farmácia   26,47 5716   Sta   Casa de   NSRA.Benefic.   54,60 M502   Contribuição Confederat.   7,32 M503   Mensalidade   Sindical   14,00  P R O V E N T O S   D E S C O N T O S Código   Descrição   Qtde.   Valor   Qtde.   Valor  T   O   T   A   L   . .   . . .   . . . .   . . .   .   . . .   .   .   1.228,09   444,39  13. Salário Antecipado em Férias   Saldo Devedor   Base Cálculo INSS   Líquido a Receber  0,00   0,00   1.228,09   783,70  Base Cálculo IRRF   Base Cálculo FGTS   FGTS a ser Depositado   % Direito PPR Acumulado %   Rateio  942,15   1.228,09   98,25  BARRACRED COSAN Saldo Capital   Limite Crédito   Informações  Mensagens  Mês/Ano:  08/2012 Fls.: 340
0020   Horas   Normais   172,40   728,55 0060   Desc.   Semanal Remunerado   39,80   165,44 0045   Adicional   Noturno   12,00   52,36 1000   Auxílio   Doença   4,00   15,92 1510   Integração Médias   D.S.R.   6,45   24,87 1550   Horas   Extras 100%   10,25   83,12 1553   Horas   Extras 50%   8,00   47,86 1554   Hs.Extras   100%   Dom/Fer   19,40   157,74 /314   INSS - Remuneração   8,00   93,12 5020   Adiantamento Salarial   136,72 5260   Energia   Elétrica   15,60 5270   Mensalid.   BarracredCosan   10,00 5280   Financiam. BarracredCosan   148,23 5360   Promoção Páscoa   10,80 5378   Refeição IND   21,00   9,22 5393   Seguro de   Vida   Zanin   5,41 5430   Convênio Farmácia   18,35 5716   Sta   Casa de   NSRA.Benefic.   63,78 M502   Contribuição Confederat.   7,58 M503   Mensalidade   Sindical   14,00  P R O V E N T O S   D E S C O N T O S Código   Descrição   Qtde.   Valor   Qtde.   Valor  T   O   T   A   L   . .   . . .   . . . .   . . .   .   . . .   .   .   1.293,61   457,01  13. Salário Antecipado em Férias   Saldo Devedor   Base Cálculo INSS   Líquido a Receber  0,00   0,00   1.293,61   836,60  Base Cálculo IRRF   Base Cálculo FGTS   FGTS a ser Depositado   % Direito PPR Acumulado %   Rateio  987,20   1.293,61   103,49  BARRACRED COSAN Saldo Capital   Limite Crédito   Informações  Mensagens  Mês/Ano:  09/2012 Fls.: 341
`

// 1) Resolva os ids exatos que o Node/Jest usa
const utilsId = require.resolve("../../src/utils/pdfutils.js");
const parserId = require.resolve("../../src/parsers/payrollPDFParser.js");

// 2) Mock do extrator PDF usando o MESMO id
await jest.unstable_mockModule(utilsId, () => ({
    extractTextFromPDF: jest.fn(async () => RAW),
}));

// 3) Importe o parser PELO id resolvido (depois do mock)
const { parsePayrollPDF } = await import(parserId);

describe("parsePayrollPDF (tipo 1, sem OCR)", () => {
    test("divide por período quando 'Mês/Ano: mm/aaaa' vem no final", async () => {
        const months = await parsePayrollPDF("dummy.pdf");
        expect(months.map(m => `${m.ano}-${m.mes}`)).toEqual(["2012-08", "2012-09"]);
    });

    test("itens: quantidade/valor e item com um único número vira VALOR", async () => {
        const [jun] = await parsePayrollPDF("dummy.pdf");
        const kv = Object.fromEntries(jun.items.map(i => [i.baseKey, i]));
        expect(kv["(0020) Horas Normais"].quantidade).toBeCloseTo(169.75, 2);
        expect(kv["(0020) Horas Normais"].valor).toBeCloseTo(702.18, 2);
        expect(kv["(/314) INSS - Remuneração"].quantidade).toBeCloseTo(7.00, 2);
        expect(kv["(/314) INSS - Remuneração"].valor).toBeCloseTo(84.56, 2);
        expect(kv["(M503) Mensalidade Sindical"].quantidade).toBeNull();
        expect(kv["(M503) Mensalidade Sindical"].valor).toBeCloseTo(14.00, 2);
    });

    test("corta cabeçalho e 'TOTAL' do corpo de itens", async () => {
        const [jun] = await parsePayrollPDF("dummy.pdf");
        const joined = jun.items.map(i => i.baseKey).join(" | ");
        expect(/TOTAL/i.test(joined)).toBe(false);
        expect(/Código\s+Descrição/i.test(joined)).toBe(false);
    });

    test("rodapé: mapeia os 7 campos canônicos", async () => {
        const [jun] = await parsePayrollPDF("dummy.pdf");
        const f = jun.footers;
        expect(f["13º Salário Antecipado em Férias"]).toBeCloseTo(0.00, 2);
        expect(f["Saldo Devedor"]).toBeCloseTo(0.00, 2);
        expect(f["Base Cálculo INSS"]).toBeCloseTo(1228.09, 2);
        expect(f["Líquido a Receber"]).toBeCloseTo(783.70, 2);
        expect(f["Base Cálculo IRRF"]).toBeCloseTo(942.15, 2);
        expect(f["Base Cálculo FGTS"]).toBeCloseTo(1228.09, 2);
        expect(f["FGTS a ser Depositado"]).toBeCloseTo(98.25, 2);
    });

    test("segundo período também parseado", async () => {
        const [, jul] = await parsePayrollPDF("dummy.pdf");
        const kv = Object.fromEntries(jul.items.map(i => [i.baseKey, i]));
        expect(kv["(0020) Horas Normais"].quantidade).toBeCloseTo(172.40, 2);
        expect(kv["(0020) Horas Normais"].valor).toBeCloseTo(728.55, 2);
        const f = jul.footers;
        expect(f["Base Cálculo INSS"]).toBeCloseTo(1293.61, 2);
        expect(f["Líquido a Receber"]).toBeCloseTo(836.60, 2);
        expect(f["Base Cálculo IRRF"]).toBeCloseTo(987.20, 2);
        expect(f["Base Cálculo FGTS"]).toBeCloseTo(1293.61, 2);
        expect(f["FGTS a ser Depositado"]).toBeCloseTo(103.49, 2);
    });
});
