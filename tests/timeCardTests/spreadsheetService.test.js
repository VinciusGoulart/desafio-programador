import { recordToRow, HEADER } from "../../src/services/spreadsheetService.js";

describe("writer (grade de 4 pares)", () => {
  test("header tem só 4 pares e colunas extra de meta", () => {
    expect(HEADER).toEqual([
      "Data",
      "Entrada1","Saída1",
      "Entrada2","Saída2",
      "Entrada3","Saída3",
      "Entrada4","Saída4",
      "HE Diurno","HE Noturno",
      "ATN","Func","Situac","Insalub","Conc","DiaSemana","Obs"
    ]);
  });

  test("dia com jornada + 1 intervalo", () => {
    const rec = {
      Dia: "03/10/2011",
      "Entrada Saida": "09:50 - 16:06",
      "Intervalo 1": "13:45 - 14:00",
      "Intervalo 2": "",
      "Intervalo 3": "",
      "HE Diurno": "",
      "HE Noturno": "",
      ATN: "", Func: "610", Situac: "100", Insalub: "", Conc: "S",
      _DiaSemana: "SEG", _Obs: ""
    };
    const row = recordToRow(rec);
    expect(row.slice(0, 1+8)) // Data + 4 pares
      .toEqual(["03/10/2011", "09:50","13:45","14:00","16:06", "","","",""]); // demais pares vazios
    // metas:
    expect(row).toContain("610");
    expect(row).toContain("100");
    expect(row).toContain("S");
  });

  test("descanso semanal -> pares vazios", () => {
    const rec = {
      Dia: "01/10/2011",
      "Entrada Saida": "",
      "Intervalo 1": "",
      "Intervalo 2": "",
      "Intervalo 3": "",
      "HE Diurno": "",
      "HE Noturno": "",
      ATN: "", Func: "610", Situac: "100", Insalub: "", Conc: "N",
      _DiaSemana: "SAB", _Obs: "Descanso Semanal"
    };
    const row = recordToRow(rec);
    expect(row.slice(0, 1+8)).toEqual(["01/10/2011","","","","","","","",""]);
    expect(row[row.length-1]).toBe("Descanso Semanal");
  });
});
