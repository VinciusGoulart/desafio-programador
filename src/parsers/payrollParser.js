// src/parsers/payrollParser.js
import { extractTextFromPDF } from "../utils/pdfutils.js";

const NUM_RE_G = /-?\d{1,3}(?:\.\d{3})*,\d{2}/g;
const toFloat = (s) =>
  s ? parseFloat(String(s).replace(/\./g, "").replace(",", ".")) : null;

const normSpace = (s) =>
  String(s).replace(/[ \t]+/g, " ").replace(/\r/g, "").trim();

/** Títulos canônicos solicitados (sem código e só valor) */
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
 * Divide por períodos considerando que "Mês/Ano: mm/aaaa" aparece NO FINAL do bloco.
 */
function splitByPeriods(raw) {
  const text = normSpace(raw);
  const re = /Mês\/Ano:\s*([0-1]\d)\/(\d{4})/g;
  const marks = [];
  let m;

  while ((m = re.exec(text)) !== null) {
    marks.push({ idx: m.index, endIdx: re.lastIndex, mes: m[1], ano: m[2] });
  }

  if (marks.length === 0) {
    return [{ mes: "", ano: "", chunk: text }];
  }

  const out = [];
  let prevEnd = 0;
  for (let i = 0; i < marks.length; i++) {
    const { idx, endIdx, mes, ano } = marks[i];
    const chunk = normSpace(text.slice(prevEnd, idx));
    out.push({ mes, ano, chunk });
    prevEnd = endIdx;
  }
  if (prevEnd < text.length && out.length > 0) {
    out[out.length - 1].chunk = normSpace(out[out.length - 1].chunk + " " + text.slice(prevEnd));
  }
  return out.filter(p => p.chunk && p.chunk.length > 0);
}

/** Itens com código */
const CODE_RE = /(?:^|\s)(?<code>\/\d{3}|[A-Z]?\d{4,5}|M\d{3})(?=\s)/g;

function extractItems(chunk) {
  const text = normSpace(chunk);

  // 1) "mata" o cabeçalho da tabela, se vier
  const headerRX = /P R O V E N T O S[\s\S]*?C[oó]digo Descri[cç][aã]o Qtde\. Valor Qtde\. Valor/i;
  const cleaned = text.replace(headerRX, (m) => m.replace(/./g, " "));

  // 2) acha o início do RODAPÉ e corta a região de itens ANTES dele
  const footerAnchors = [
    /T\s*O\s*T\s*A\s*L\b/i,                          // T O T A L
    /13[\.\º]?\s*Sal[aá]rio\s*Antecipado/i,          // 13. Salário Antecipado...
    /Base\s*C[aá]lculo\s*IRRF/i,                     // Base Cálculo IRRF
    /Base\s*C[aá]lculo\s*FGTS/i,                     // Base Cálculo FGTS
    /FGTS\s*a\s*ser\s*Depositado/i,                  // FGTS a ser Depositado
    /M[eê]s\/Ano:/i                                  // Mês/Ano:
  ];
  let footerIdx = cleaned.length;
  for (const rx of footerAnchors) {
    const m = cleaned.match(rx);
    if (m) footerIdx = Math.min(footerIdx, m.index);
  }
  const tableRegion = cleaned.slice(0, footerIdx);

  // 3) encontra os códigos DENTRO da região de itens
  const hits = [];
  let m;
  CODE_RE.lastIndex = 0;
  while ((m = CODE_RE.exec(tableRegion)) !== null) {
    hits.push({ idx: m.index + (m[0].startsWith(" ") ? 1 : 0), code: m.groups.code });
  }
  if (hits.length === 0) return [];

  const items = [];

  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].idx;
    const end = i + 1 < hits.length ? hits[i + 1].idx : tableRegion.length;
    const seg = normSpace(tableRegion.slice(start, end));
    const code = hits[i].code;

    // números presentes (pegamos todos)
    const numbers = seg.match(NUM_RE_G) || [];

    // VALOR = último número; QUANTIDADE = penúltimo (se houver)
    const valorStr = numbers.length >= 1 ? numbers[numbers.length - 1] : null;
    const qtdeStr = numbers.length >= 2 ? numbers[numbers.length - 2] : null;
    const valor = toFloat(valorStr);
    const quantidade = toFloat(qtdeStr);

    // descrição: entre o code e o primeiro número (se houver)
    let descPart = seg.replace(new RegExp("^" + code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s+"), "");
    if (numbers.length) {
      const firstNum = numbers[0];
      const cutAt = descPart.indexOf(firstNum);
      if (cutAt >= 0) descPart = descPart.slice(0, cutAt);
    }
    const desc = normSpace(descPart).replace(/\s{2,}/g, " ").replace(/^\.|\.$/g, "");

    // desc vazia ou "TOTAL" → ignora
    if (!desc || /T O T A L|^TOTAL\b/i.test(desc)) continue;

    items.push({
      code,
      desc,
      quantidade,     // se só houver um número na linha (ex.: "M503 ... 14,00"), fica null
      valor           // e o número único vira VALOR (=> 14,00)
    });
  }

  return items;
}

/** Rodapé → retorna um MAPA label->valor (apenas os 7 títulos canônicos) */
function extractFooterValues(chunk) {
  const text = normSpace(chunk);
  const values = Object.fromEntries(FOOTER_LABELS.map(l => [l, null]));

  // Bloco 1: "13. Salário Antecipado ... Saldo Devedor Base Cálculo INSS Líquido a Receber"
  const blk1 = text.match(/13[\.\º]?\s*Sal[aá]rio\s*Antecipado[\s\S]*?L[ií]quido a Receber\s*([^\n\r]+)/i);
  if (blk1) {
    const nums = blk1[1].match(NUM_RE_G) || [];
    const labels = [
      "13º Salário Antecipado em Férias",
      "Saldo Devedor",
      "Base Cálculo INSS",
      "Líquido a Receber",
    ];
    for (let i = 0; i < Math.min(nums.length, labels.length); i++) {
      values[labels[i]] = toFloat(nums[i]);
    }
  }

  // Bloco 2: "Base Cálculo IRRF Base Cálculo FGTS FGTS a ser Depositado ..."
  const blk2 = text.match(/Base C[aá]lculo IRRF[\s\S]*?FGTS a ser Depositado\s*([^\n\r]+)/i);
  if (blk2) {
    const nums = blk2[1].match(NUM_RE_G) || [];
    const labels = [
      "Base Cálculo IRRF",
      "Base Cálculo FGTS",
      "FGTS a ser Depositado",
    ];
    for (let i = 0; i < Math.min(nums.length, labels.length); i++) {
      values[labels[i]] = toFloat(nums[i]);
    }
    // ignoramos PPR/Rateio aqui (não fazem parte dos 7 solicitados)
  }

  return values;
}

/**
 * Retorna: [{ mes, ano, items, footers }]
 * - items: [{ baseKey="(code) desc", quantidade, valor }]
 * - footers: { "13º Salário Antecipado em Férias": number|null, ... }
 */
export async function parsePayroll(pdfPath) {
  const raw = await extractTextFromPDF(pdfPath);
  const periods = splitByPeriods(raw);
  const months = [];

  for (const p of periods) {
    const { mes, ano, chunk } = p;

    const items = extractItems(chunk).map(it => ({
      baseKey: `(${it.code || "00000"}) ${normSpace(it.desc || "")}`,
      quantidade: typeof it.quantidade === "number" ? it.quantidade : null,
      valor: typeof it.valor === "number" ? it.valor : null,
    }));

    const footers = extractFooterValues(chunk); // {label: number|null}

    months.push({ mes, ano, items, footers });
  }

  return months;
}
