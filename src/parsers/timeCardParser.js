import { extractTextFromPDF } from "../utils/pdfutils.js";

/**
 * Helpers
 */
const DIA_SEMANA = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];

const isTime = (tok) => /^\d{2}:\d{2}$/.test(tok);
const isDash = (tok) => tok === "-" || tok === "–" || tok === "—";
const isDecimalPtBr = (tok) => /^-?\d+,\d+$/.test(tok);
const isInt = (tok) => /^\d+$/.test(tok);
const isDiaSemana = (tok) => DIA_SEMANA.includes(tok);
const cleanToken = (t) => t.replace(/\(\*\)/g, "").trim();


function takeTimeRange(tokens, i) {
  // captura "HH:MM - HH:MM"
  if (isTime(tokens[i]) && isDash(tokens[i + 1]) && isTime(tokens[i + 2])) {
    const start = tokens[i];
    const end = tokens[i + 2];
    return { range: `${start} - ${end}`, jump: 3 };
  }
  return { range: "", jump: 0 };
}

/**
 * Quebra o texto em blocos por mês/ano e retorna [{month, year, chunkText}]
 */
function splitByMonths(raw) {
  const re = /Mês\/Ano:\s*(\d{2})\/(\d{4})/g;
  const out = [];
  let m;
  const idxs = [];
  while ((m = re.exec(raw)) !== null) {
    idxs.push({ index: m.index, month: m[1], year: m[2] });
  }
  for (let i = 0; i < idxs.length; i++) {
    const start = idxs[i].index;
    const end = i + 1 < idxs.length ? idxs[i + 1].index : raw.length;
    out.push({
      month: idxs[i].month,
      year: idxs[i].year,
      chunkText: raw.slice(start, end),
    });
  }
  return out;
}

/**
 * Encontra offsets de cada dia dentro do bloco do mês
 */
function findDayOffsets(text) {
  const re = /(\d{2})\s+(SAB|DOM|SEG|TER|QUA|QUI|SEX)\b/g;
  const hits = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    hits.push({ index: m.index, dia: m[1], semana: m[2] });
  }
  return hits;
}

/**
 * Tokeniza com base em espaços e preserva sinais relevantes
 */
function tokenize(segment) {
  // normaliza quebras e múltiplos espaços
  const cleaned = segment
    .replace(/\s+/g, " ")
    .replace(/[–—]/g, "-")
    .trim();
  // separa para manter "-" como token
  return cleaned
    .split(" ")
    .map(cleanToken)
    .filter(Boolean);
}

/**
 * Faz o parse de um "segmento" (um dia) para um registro padronizado
 */
function parseDaySegment(segment, month, year) {
  const tokens = tokenize(segment);
  // detecta se a linha contém o marcador de noturno "(*)"
  const hasNoturnoMark = /\(\*\)/.test(segment);

  // Esperado início: [DD, DDD, ...]
  const diaTok = tokens[0];
  const semanaTok = tokens[1];
  if (!/^\d{2}$/.test(diaTok) || !isDiaSemana(semanaTok)) return null;

  let i = 2;

  // 1) Entrada/Saída (opcional)
  let entradaSaida = "";
  const es = takeTimeRange(tokens, i);
  if (es.jump) {
    entradaSaida = es.range; // "HH:MM - HH:MM"
    i += es.jump;
  }

  // 2) Intervalos (até 3)
  const intervalos = [];
  for (let k = 0; k < 3; k++) {
    const iv = takeTimeRange(tokens, i);
    if (iv.jump) {
      intervalos.push(iv.range);
      i += iv.jump;
    } else {
      break;
    }
  }
  const intervalo1 = intervalos[0] || "";
  const intervalo2 = intervalos[1] || "";
  const intervalo3 = intervalos[2] || "";

  // 3) Valor decimal opcional (ex.: 0,2 ou -0,5) => vamos mapear em "HE Diurno"
  let heDiurno = "";
  if (isDecimalPtBr(tokens[i])) {
    heDiurno = tokens[i];
    i += 1;
  }

  // 4) (geralmente "Func" e "Situac") — na ordem que vem no PDF
  let func = "";
  let situac = "";
  if (isInt(tokens[i])) {
    func = tokens[i];
    i += 1;
  }
  if (isInt(tokens[i])) {
    situac = tokens[i];
    i += 1;
  }

  // 5) Conc (S|N)
  let conc = "";
  if (tokens[i] === "S" || tokens[i] === "N") {
    conc = tokens[i];
    i += 1;
  }

  // 6) Tentar capturar um decimal logo após Situação → HE Noturno explícito
  let heNoturno = "";
  if (isDecimalPtBr(tokens[i])) {
    heNoturno = tokens[i];
    i += 1;
  }

  // 7) Se não veio decimal para HE Noturno, mas há marcador "(*)",
  if (!heNoturno && hasNoturnoMark) {
    heNoturno = "(*)";
  }

  // 8) Observação/Tipo de dia (Descanso Semanal | Feriado | ABONO AUSENCIA-ACT)
  // Pode vir separado, então juntamos o restante até bater em outra âncora.
  let observacao = "";
  if (i < tokens.length) {
    const tail = tokens.slice(i).join(" ").trim();
    // mantenha apenas as palavras-chave conhecidas
    const known = ["DESCANSO SEMANAL", "FERIADO", "ABONO AUSENCIA-ACT"];
    const upperTail = tail.toUpperCase();
    for (const kw of known) {
      if (upperTail.includes(kw)) {
        observacao = kw
          .split(" ")
          .map((w) => w[0] + w.slice(1).toLowerCase())
          .join(" ");
        break;
      }
    }
  }


  // 9) ATN/Insalub não aparecem explicitamente em todas as linhas.
  const atn = "";
  const insalub = "";

  // Monta data dd/mm/yyyy
  const data = `${diaTok}/${month}/${year}`;

  // Retorno na ORDEM esperada
  return {
    Dia: data,
    "Entrada Saida": entradaSaida,
    "Intervalo 1": intervalo1,
    "Intervalo 2": intervalo2,
    "Intervalo 3": intervalo3,
    "HE Diurno": heDiurno,
    "HE Noturno": heNoturno,
    ATN: atn,
    "Func": func,
    "Situac": situac,
    "Insalub": insalub,
    Conc: conc,
    _DiaSemana: semanaTok,
    _Obs: observacao, // "Descanso Semanal", "Feriado", "Abono Ausencia-Act"
  };
}

/**
 * Parser principal
 */
export async function parseTimeCard(pdfPath) {
  const raw = await extractTextFromPDF(pdfPath);

  const months = splitByMonths(raw);
  const results = [];

  for (const { month, year, chunkText } of months) {
    const dayAnchors = findDayOffsets(chunkText);
    if (dayAnchors.length === 0) continue;

    for (let idx = 0; idx < dayAnchors.length; idx++) {
      const start = dayAnchors[idx].index;
      const end =
        idx + 1 < dayAnchors.length ? dayAnchors[idx + 1].index : chunkText.length;
      const segment = chunkText.slice(start, end);

      const rec = parseDaySegment(segment, month, year);
      if (rec) results.push(rec);
    }
  }

  return results;
}