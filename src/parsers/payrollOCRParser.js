// src/parsers/payrollOCRParser.js
const NUM_RE_G = /-?\d{1,3}(?:\.\d{3})*,\d{2}/g;
const toFloat = s => s ? parseFloat(String(s).replace(/\./g, "").replace(",", ".")) : null;
const normSpace = s => String(s).replace(/[ \t]+/g, " ").replace(/\r/g, "").trim();

// 7 campos canônicos sem código (apenas VALOR)
const FOOTER_LABELS = [
  "13º Salário Antecipado em Férias",
  "Saldo Devedor",
  "Base Cálculo INSS",
  "Líquido a Receber",
  "Base Cálculo IRRF",
  "Base Cálculo FGTS",
  "FGTS a ser Depositado",
];

function incMonth({ mes, ano }) {
  // mes e ano como strings "05", "2019"
  let m = parseInt(mes, 10);
  let y = parseInt(ano, 10);
  m += 1;
  if (m === 13) { m = 1; y += 1; }
  return { mes: String(m).padStart(2, "0"), ano: String(y) };
}

function monthKey(mes, ano) { return `${ano}-${mes}`; }

function isPipeOnly(line) {
  return /^[\s|]+$/.test(line);
}

function findInlineMonth(line) {
  // captura mm/aaaa fora de rodapé ("Base", "Dep.", etc.)
  if (/Base\s|Dep\.\s*I\.?R\.?R\.?F/i.test(line)) return null;
  const m = line.match(/\b([0-1]\d)\/(\d{4})\b/);
  return m ? { mes: m[1], ano: m[2] } : null;
}

function monthsBetween(aMes, aAno, bMes, bAno) {
  const am = parseInt(aMes, 10), ay = parseInt(aAno, 10);
  const bm = parseInt(bMes, 10), by = parseInt(bAno, 10);
  return (by - ay) * 12 + (bm - am);
}

// -------- split por "Período : mm/aaaa" (o cabeçalho do tipo 2) ----------
function splitByPeriodoBlocks(raw) {
  // mantenha \n do OCR e limpe “|” isolados para análise de conteúdo,
  // mas sem perder a linha inteira (usamos isPipeOnly antes)
  const lines = String(raw).replace(/\r/g, "").split("\n").map(l => l.trim());

  const blocks = []; // { mes, ano, start, lines:[], candidates: Map<mm/aaaa, count> }
  let cur = { mes: "", ano: "", lines: [], candidates: new Map() };

  const pushBlock = () => {
    if (cur.lines.length) blocks.push(cur);
    cur = { mes: "", ano: "", lines: [], candidates: new Map() };
  };

  for (let i = 0; i < lines.length; i++) {
    const lineRaw = lines[i];
    const line = normSpace(lineRaw.replace(/[|[\]]/g, " ")); // conteúdo para regex

    // 1) marcador explícito "Período : mm/aaaa"
    const m = line.match(/Per[ií]odo\s*:\s*([0-1]\d)\/(\d{4})/i);
    if (m) {
      // fecha bloco anterior e inicia um novo
      pushBlock();
      cur.mes = m[1];
      cur.ano = m[2];
      continue; // não incluímos a linha de cabeçalho no conteúdo do bloco
    }

    // 2) marcador pipe-only -> assume novo bloco (OCR perdeu o "Período")
    if (isPipeOnly(lineRaw)) {
      pushBlock();
      continue;
    }

    // acumula linha no bloco atual
    cur.lines.push(lineRaw);

    // 3) se mês ainda não setado, tente inferir por mm/aaaa “no corpo”
    if (!cur.mes) {
      const cand = findInlineMonth(line);
      if (cand) {
        const key = monthKey(cand.mes, cand.ano);
        cur.candidates.set(key, (cur.candidates.get(key) || 0) + 1);
      }
    }
  }
  // último bloco
  pushBlock();

  // Passo 2: atribuir mes/ano a blocos sem cabeçalho
  // estratégia: usar candidatos (top-1) das primeiras N linhas; se não houver, interpolar
  const N = 12;

  // pega candidatos só das primeiras N linhas de cada bloco
  const pickTopCandidate = (b) => {
    if (b.mes) return null;
    const counts = new Map();
    for (let i = 0; i < Math.min(N, b.lines.length); i++) {
      const cand = findInlineMonth(normSpace(b.lines[i].replace(/[|[\]]/g, " ")));
      if (cand) {
        const key = monthKey(cand.mes, cand.ano);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    if (counts.size === 0) return null;

    // top-1
    let best = null, bestC = -1;
    for (const [k, c] of counts) {
      if (c > bestC) { best = k; bestC = c; }
    }
    let [ano, mes] = best.split("-");
    // 👇 regra de negócio: candidato é retroativo → período do bloco = candidato + 1 mês
    const next = incMonth({ mes, ano });
    return next; // { mes: "06", ano: "2019" } se candidato era 05/2019
  };

  // primeiro, tente candidatos
  for (const b of blocks) {
    if (!b.mes) {
      const cand = pickTopCandidate(b);
      if (cand) { b.mes = cand.mes; b.ano = cand.ano; }
    }
  }

  // interpolação FORTE: garanta sequência mês a mês entre blocos conhecidos
  let lastKnownIdx = -1;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].mes) {
      if (lastKnownIdx >= 0) {
        const prev = blocks[lastKnownIdx];
        const gap = i - lastKnownIdx - 1;
        if (gap > 0) {
          let walk = { mes: prev.mes, ano: prev.ano };
          for (let k = lastKnownIdx + 1; k < i; k++) {
            walk = incMonth(walk);
            blocks[k].mes = walk.mes;   // sobrescreve candidato, se preciso
            blocks[k].ano = walk.ano;
          }
        }
      }
      lastKnownIdx = i;
    }
  }

  // monta saída no formato [{mes, ano, chunk}]
  return blocks
    .filter(b => b.lines.length)
    .map(b => ({
      mes: b.mes || "",
      ano: b.ano || "",
      chunk: normSpace(b.lines.join("\n"))
    }));
}

// -------- normalizações específicas do OCR ----------
function normalizeCode(rawCode) {
  if (!rawCode) return rawCode;
  let c = rawCode.toUpperCase().trim();
  // O (letra O) virando 0 quando há dígitos próximos
  if (/\d/.test(c)) c = c.replace(/O/g, "0");
  // remove barras verticais e sobras
  c = c.replace(/[|]/g, "");
  return c;
}
function stripInlineMonth(seg) {
  // remove "mm/aaaa" quando vier no MEIO da linha (artefato de OCR de duas colunas)
  return seg.replace(/\b([0-1]\d)\/(\d{4})\b/g, " ").replace(/\s{2,}/g, " ");
}

// códigos no começo do segmento: "/314", "0100", "M503", "A1234", etc.
const CODE_RE = /(?:^|\s)(?<code>\/[A-Z0-9]{3,5}|[A-Z]?\d{3,5}|M\d{3,5})(?=\s)/g;

// -------- extrai itens de um bloco OCR ----------
function extractItemsOCR(chunk, ctx) {
  const { mes: ctxMes, ano: ctxAno } = ctx || {};
  const tableRegion = normSpace(chunk.replace(/[|]/g, " "));
  const hits = [];
  let m;
  CODE_RE.lastIndex = 0;
  while ((m = CODE_RE.exec(tableRegion)) !== null) {
    hits.push({ idx: m.index + (m[0].startsWith(" ") ? 1 : 0), code: normalizeCode(m.groups.code) });
  }
  if (!hits.length) return [];

  const items = [];
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].idx;
    const end = i + 1 < hits.length ? hits[i + 1].idx : tableRegion.length;
    let seg = normSpace(tableRegion.slice(start, end));

    // 👇 capture o mês inline ANTES de remover
    const inline = seg.match(/\b([0-1]\d)\/(\d{4})\b/);
    const inlineMes = inline ? inline[1] : null;
    const inlineAno = inline ? inline[2] : null;

    // limpa lixo (mas só depois de capturar o inline month)
    seg = stripInlineMonth(seg);            // remove mm/aaaa do texto
    seg = seg.replace(/[[]+/g, " ").replace(/\s{2,}/g, " ");

    const code = hits[i].code;

    // números na cauda
    const numbers = seg.match(NUM_RE_G) || [];
    const valorStr = numbers.length >= 1 ? numbers[numbers.length - 1] : null;
    const qtdeStr = numbers.length >= 2 ? numbers[numbers.length - 2] : null;
    const valor = toFloat(valorStr);
    const quantidade = toFloat(qtdeStr);

    // descrição: após code até o primeiro número
    let descPart = seg.replace(new RegExp("^" + code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s+"), "");
    if (numbers.length) {
      const firstNum = numbers[0];
      const cutAt = descPart.indexOf(firstNum);
      if (cutAt >= 0) descPart = descPart.slice(0, cutAt);
    }
    const desc = normSpace(descPart).replace(/\s{2,}/g, " ").replace(/^\.|\.$/g, "");
    if (!desc || /^TOTAL\b/i.test(desc)) continue;

    // 👇 decide se é retroativo (inline month diferente do período do bloco)
    const isRetro = inlineMes && inlineAno && (inlineMes !== ctxMes || inlineAno !== ctxAno);

    if (isRetro) {
      // retroativo → só VALOR, em coluna separada com sufixo "mm/aaaa VALOR"
      items.push({
        baseKey: `(${code}) ${desc} ${inlineMes}/${inlineAno} VALOR`,
        quantidade: null,
        valor,
      });
    } else {
      // período corrente → QTD/VALOR normais
      items.push({
        baseKey: `(${code}) ${desc}`,
        quantidade,
        valor,
      });
    }
  }

  // deduplicação (mesma de antes)
  const map = new Map();
  for (const it of items) {
    const k = it.baseKey;
    const prev = map.get(k);
    if (!prev) { map.set(k, it); continue; }
    const score = x => (x.quantidade != null ? 1 : 0) + (x.valor != null ? 2 : 0);
    if (score(it) > score(prev)) map.set(k, it);
    else {
      map.set(k, {
        baseKey: k,
        quantidade: prev.quantidade ?? it.quantidade ?? null,
        valor: prev.valor ?? it.valor ?? null,
      });
    }
  }

  return Array.from(map.values());
}

// -------- rodapé do tipo 2 → mapeia para 7 canônicos ----------
function extractFootersOCR(chunk) {
  const t = " " + normSpace(chunk) + " ";

  function pick(regex) {
    const m = t.match(regex);
    return m ? toFloat(m[1]) : null;
  }

  // sinônimos/variações comuns no OCR
  const valINSS = pick(/Base\s*I\.?N\.?S\.?S\.?\s*:\s*([-\d\.,]+)/i);
  const valFGTSbase = pick(/Base\s*FGTS\s*:\s*([-\d\.,]+)/i);
  const valFGTSmes = pick(/F\.?G\.?T\.?S\.?\s*do\s*M[eê]s\s*:\s*([-\d\.,]+)/i);
  const valIRRFbase = pick(/Base\s*I\.?R\.?R\.?F\.?\s*:\s*([-\d\.,]+)/i);
  const valLiquido = pick(/L[ií]quido\s*a\s*Receber\s*[:\-]?\s*([-\d\.,]+)/i);
  const val13Ferias = pick(/13[\.\º]?\s*Sal[aá]rio\s*Antecipado[\s\w]*?\s*([-\d\.,]+)/i);
  // alguns holerites tipo 2 não trazem Líquido ou 13º nesse quadro → ficam null

  const values = Object.fromEntries(FOOTER_LABELS.map(l => [l, null]));
  values["Base Cálculo INSS"] = valINSS;
  values["Base Cálculo FGTS"] = valFGTSbase;
  values["FGTS a ser Depositado"] = valFGTSmes; // "FGTS do Mês"
  values["Base Cálculo IRRF"] = valIRRFbase;
  values["Líquido a Receber"] = valLiquido;
  values["13º Salário Antecipado em Férias"] = val13Ferias;

  return values;
}

// -------- API principal: recebe rawText (OCR) e retorna estrutura dos meses ----------
export function parsePayrollFromText(rawText) {
  const periods = splitByPeriodoBlocks(rawText);
  return periods.map(({ mes, ano, chunk }) => ({
    mes, ano,
    items: extractItemsOCR(chunk, { mes, ano }),
    footers: extractFootersOCR(chunk),
  }));
}
