import { jest, describe, test, expect } from "@jest/globals";

// mocka a leitura do PDF para devolver o raw de teste
jest.unstable_mockModule("../../src/utils/pdfutils.js", () => ({
  extractTextFromPDF: jest.fn(async () => RAW),
}));

// RAW com dois meses e sem quebras de linha “reais”
const RAW = `
QUALQUER CABEÇALHO QUE O PARSER IGNORA Mês/Ano:   10/2011  Entrada Saida   Intervalo 3 Intervalo 2 Dia   Intervalo 1   Situaç Funç ATN HE Diurno HE Noturno   Conc Insalub  01 SAB   610   100   N Descanso Semanal  02 DOM   610   100   N Descanso Semanal  03 SEG   09:50 - 16:06   13:45 - 14:00   610   100   S 04 TER   09:59 - 16:14   13:45 - 14:00   610   100   S 05 QUA   10:07 - 16:22   13:45 - 14:00   610   100   S 06 QUI   09:58 - 16:15   13:45 - 14:00   610   100   S 07 SEX   09:53 - 16:09   13:45 - 14:00   610   100   S 08 SAB   610   100   N Descanso Semanal  09 DOM   610   100   N Descanso Semanal  10 SEG   09:58 - 16:25   13:45 - 14:00   0,2   610   100   S 11 TER   09:55 - 16:07   13:45 - 14:00   610   100   S 12 QUA   610   100   N Feriado  13 QUI   610   100   N Feriado  14 SEX   10:00 - 15:40   13:45 - 14:00   -0,5   610   100   S (*) 15 SAB   610   100   N Descanso Semanal  16 DOM   610   100   N Descanso Semanal  17 SEG   09:56 - 16:11   13:45 - 14:00   610   100   S 18 TER   09:50 - 16:06   13:45 - 14:00   610   100   S 19 QUA   09:59 - 16:14   13:45 - 14:00   610   100   S 20 QUI   09:53 - 16:09   13:45 - 14:00   610   100   S 21 SEX   09:54 - 16:09   13:45 - 14:00   610   263   S 22 SAB   610   100   N Descanso Semanal  23 DOM   610   100   N Descanso Semanal  24 SEG   09:58 - 16:10   13:45 - 14:00   610   263   S 25 TER   09:54 - 16:09   13:45 - 14:00   610   263   S 26 QUA   09:54 - 16:09   13:45 - 14:00   610   263   S 27 QUI   09:51 - 16:07   13:45 - 14:00   610   263   S 28 SEX   09:52 - 16:07   13:45 - 14:00   610   263   S 29 SAB   610   100   N Descanso Semanal  30 DOM   610   100   N Descanso Semanal  31 SEG   09:45 - 16:00   13:45 - 14:00   610   100   S
QUALQUER CABEÇALHO QUE O PARSER IGNORA Mês/Ano:   11/2011  Entrada Saida   Intervalo 3 Intervalo 2 Dia   Intervalo 1   Situaç Funç ATN HE Diurno HE Noturno   Conc Insalub  01 TER   09:52 - 16:07   13:45 - 14:00   610   100   S 02 QUA   610   100   N Feriado  03 QUI   09:57 - 16:54   13:45 - 14:00   0,7   610   100   S 04 SEX   09:54 - 16:43   13:45 - 14:00   0,5   610   100   S 05 SAB   610   100   N Descanso Semanal  06 DOM   610   100   N Descanso Semanal  07 SEG   09:50 - 16:12   13:45 - 14:00   0,1   610   100   S 08 TER   09:58 - 16:19   13:45 - 14:00   0,1   610   100   S 09 QUA   10:00 - 16:23   13:45 - 14:00   0,1   610   100   S 10 QUI   09:53 - 16:50   13:45 - 14:00   0,7   610   100   S 11 SEX   09:56 - 16:14   13:45 - 14:00   610   100   S 12 SAB   610   100   N Descanso Semanal  13 DOM   610   100   N Descanso Semanal  14 SEG   610   401   S ABONO AUSENCIA-ACT  15 TER   610   100   N Feriado  16 QUA   10:29 - 16:45   13:45 - 14:00   610   100   S 17 QUI   09:58 - 16:13   13:45 - 14:00   610   100   S 18 SEX   09:57 - 16:13   13:45 - 14:00   610   100   S 19 SAB   610   100   N Descanso Semanal  20 DOM   610   100   N Descanso Semanal  21 SEG   09:50 - 16:05   13:45 - 14:00   610   100   S 22 TER   09:53 - 16:08   13:45 - 14:00   610   100   S 23 QUA   09:57 - 16:12   13:45 - 14:00   610   100   S 24 QUI   09:57 - 16:12   13:45 - 14:00   610   100   S 25 SEX   09:51 - 16:08   13:45 - 14:00   610   100   S 26 SAB   610   100   N Descanso Semanal  27 DOM   610   100   N Descanso Semanal  28 SEG   09:54 - 16:10   13:45 - 14:00   610   100   S 29 TER   09:53 - 16:08   13:45 - 14:00   610   100   S 30 QUA   09:56 - 16:11   13:45 - 14:00   610   100   S
`;

// 1) Mock do módulo utilitário ANTES de importar o parser
await jest.unstable_mockModule("../../src/utils/pdfutils.js", () => ({
  extractTextFromPDF: jest.fn(async () => RAW),
}));

// 2) Import dinâmico do módulo sob teste (agora já pega o mock)
const { parseTimeCard } = await import("../../src/parsers/timeCardParser.js");

describe("parseTimeCard (cartão de ponto)", () => {
  test("jornada com 1 intervalo", async () => {
    const rows = await parseTimeCard("dummy.pdf");
    const r = rows.find((x) => x.Dia === "03/10/2011");
    expect(r["Entrada Saida"]).toBe("09:50 - 16:06");
    expect(r["Intervalo 1"]).toBe("13:45 - 14:00");
    expect(r["HE Diurno"]).toBe("");
    expect(r["HE Noturno"]).toBe("");
    expect(r.Func).toBe("610");
    expect(r.Situac).toBe("100");
    expect(r.Conc).toBe("S");
  });

  test("descanso semanal sem horários", async () => {
    const rows = await parseTimeCard("dummy.pdf");
    const r = rows.find((x) => x.Dia === "01/10/2011");
    expect(r["Entrada Saida"]).toBe("");
    expect(r._Obs).toMatch(/Descanso Semanal/i);
    expect(r.Conc).toBe("N");
  });

  test("feriado sem horários", async () => {
    const rows = await parseTimeCard("dummy.pdf");
    const r = rows.find((x) => x.Dia === "12/10/2011");
    expect(r._Obs).toBe("Feriado");
    expect(r["Entrada Saida"]).toBe("");
  });

  test("HE Diurno decimal", async () => {
    const rows = await parseTimeCard("dummy.pdf");
    const r = rows.find((x) => x.Dia === "10/10/2011");
    expect(r["HE Diurno"]).toBe("0,2");
    expect(r["HE Noturno"]).toBe("");
  });

  test("HE Noturno com marcador (*)", async () => {
    const rows = await parseTimeCard("dummy.pdf");
    const r = rows.find((x) => x.Dia === "14/10/2011");
    expect(r["HE Diurno"]).toBe("-0,5");
    expect(r["HE Noturno"]).toBe("(*)");
  });

  test("normaliza traço longo", async () => {
    const rows = await parseTimeCard("dummy.pdf");
    const r = rows.find((x) => x.Dia === "04/10/2011");
    expect(r["Entrada Saida"]).toBe("09:59 - 16:14");
  });

  test("múltiplos meses", async () => {
    const rows = await parseTimeCard("dummy.pdf");
    const r2 = rows.find((x) => x.Dia === "01/11/2011");
    expect(r2).toBeTruthy();
    expect(r2["Entrada Saida"]).toBe("09:52 - 16:07");
  });
});