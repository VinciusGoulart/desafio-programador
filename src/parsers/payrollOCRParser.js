import { ocrPdfToText } from "../utils/ocrUtils.js";

const NUM_RE_G = /-?\d{1,3}(?:\.\d{3})*,\d{2}/g;
const toFloat = s => s ? parseFloat(String(s).replace(/\./g, "").replace(",", ".")) : null;
const normSpace = s => String(s).replace(/[ \t]+/g, " ").replace(/\r/g, "").trim();


// ——— helpers ———
function codeVariantsForDesc(code) {
  const raw = code.replace(/[()]/g, ""); // "0101" ou "/314"
  const withSlash = raw.startsWith("/") ? raw : "/" + raw; // "/0101"
  const noSlash = raw.startsWith("/") ? raw.slice(1) : raw; // "0101"

  const variants = new Set([withSlash, noSlash]);

  // Trocas O↔0 (combinatórias simples úteis ao OCR)
  // 1) apenas o primeiro zero vira 'O' (0101 → O101)
  if (/^0\d/.test(noSlash)) {
    variants.add("O" + noSlash.slice(1));
    variants.add("/" + "O" + noSlash.slice(1));
  }
  // 2) versão “flip total” (0101 → O1O1) — cobre alguns OCRs
  const flip = s => s.replace(/[0O]/g, ch => (ch === "0" ? "O" : "0"));
  [withSlash, noSlash].forEach(s => variants.add(flip(s)));

  // Casos específicos frequentes
  variants.add("/B002"); variants.add("B002");
  variants.add("/BO02"); variants.add("BO02");

  // Ordene maiores primeiro para remover o mais específico
  return Array.from(variants).sort((a, b) => b.length - a.length);
}

function stripDupCodePrefix(desc, normCode) {
  let d = desc.trim();
  const variants = codeVariantsForDesc(normCode);
  for (const v of variants) {
    // remove: [opcional '|' + espaços] + variante + [barra opcional logo depois] + espaços
    const re = new RegExp(
      "^\\s*(?:\\|\\s*)?" +
      v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
      "(?:\\s*\\/)?\\s*",
      "i"
    );
    if (re.test(d)) {
      d = d.replace(re, "");
      break;
    }
  }
  return d.trim();
}

function incMonth({ mes, ano }) {
  let m = parseInt(mes, 10);
  let y = parseInt(ano, 10);
  m += 1;
  if (m === 13) { m = 1; y += 1; }
  return { mes: String(m).padStart(2, "0"), ano: String(y) };
}
function monthKey(mes, ano) { return `${ano}-${mes}`; }
function isPipeOnly(line) { return /^[\s|]+$/.test(line); }
function findInlineMonth(line) {
  // ignore rodapé
  if (/Base\s|Dep\.\s*I\.?R\.?R\.?F/i.test(line)) return null;
  const m = line.match(/\b([0-1]\d)\/(\d{4})\b/);
  return m ? { mes: m[1], ano: m[2] } : null;
}

// -------- Split via OCR --------
function splitByPeriodsSmart(raw) {
  const lines = String(raw).replace(/\r/g, "").split("\n").map(l => l.trim());

  const blocks = []; // { mes, ano, lines:[], candidates: Map }
  let cur = { mes: "", ano: "", lines: [], candidates: new Map() };
  const pushBlock = () => { if (cur.lines.length) blocks.push(cur); cur = { mes: "", ano: "", lines: [], candidates: new Map() }; };

  for (let i = 0; i < lines.length; i++) {
    const lineRaw = lines[i];
    const line = normSpace(lineRaw.replace(/[|[\]]/g, " "));

    // (A) Tipo 2: "Período : mm/aaaa"
    let m = line.match(/Per[ií]odo\s*:\s*([0-1]\d)\/(\d{4})/i);
    if (m) { pushBlock(); cur.mes = m[1]; cur.ano = m[2]; continue; }

    // (B) Tipo 1: "Mês/Ano:" seguido de linha "mm/aaaa" (às vezes “06/2012)”)
    if (/M[eê]s\/Ano\s*:/i.test(line)) {
      // vasculha as próximas 3 linhas
      for (let j = 1; j <= 3 && i + j < lines.length; j++) {
        const cand = lines[i + j].replace(/[()]/g, "");
        const mm = cand.match(/\b([0-1]\d)\/(\d{4})\b/);
        if (mm) { pushBlock(); cur.mes = mm[1]; cur.ano = mm[2]; break; }
      }
      continue;
    }

    // (C) Pipe-only marca um novo bloco (quando cabeçalho sumiu)
    if (isPipeOnly(lineRaw)) { pushBlock(); continue; }

    // acumula conteúdo
    cur.lines.push(lineRaw);

    // (D) Candidato (retroativo) dentro do item → usamos para estimar período, com +1
    if (!cur.mes) {
      const cand = findInlineMonth(line);
      if (cand) {
        const key = monthKey(cand.mes, cand.ano);
        cur.candidates.set(key, (cur.candidates.get(key) || 0) + 1);
      }
    }
  }
  pushBlock();

  // Candidato top-1 (primeiras N linhas) → período = candidato +1 mês (retroativo)
  const N = 12;
  const pickTopCandidatePlusOne = (b) => {
    if (b.mes) return null;
    const counts = new Map();
    for (let i = 0; i < Math.min(N, b.lines.length); i++) {
      const ln = normSpace(b.lines[i].replace(/[|[\]]/g, " "));
      const cand = findInlineMonth(ln);
      if (cand) {
        const key = monthKey(cand.mes, cand.ano);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    if (!counts.size) return null;
    let best = null, bestC = -1;
    for (const [k, c] of counts) if (c > bestC) { best = k; bestC = c; }
    let [ano, mes] = best.split("-");
    return incMonth({ mes, ano }); // +1 mês
  };

  for (const b of blocks) {
    if (!b.mes) {
      const cand = pickTopCandidatePlusOne(b);
      if (cand) { b.mes = cand.mes; b.ano = cand.ano; }
    }
  }

  // Interpolação FORTE entre blocos conhecidos (garante sequência 05,06,07…)
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
            blocks[k].mes = walk.mes;
            blocks[k].ano = walk.ano;
          }
        }
      }
      lastKnownIdx = i;
    }
  }

  return blocks
    .filter(b => b.lines.length)
    .map(b => ({ mes: b.mes || "", ano: b.ano || "", chunk: normSpace(b.lines.join("\n")) }));
}

// -------- Itens (genérico p/ tipo 1 e 2) --------
const CODE_RE = /(?:^|\s)(?<code>\/[A-Z0-9]{2,5}|[A-Z]?\d{3,5}|M\d{3,5})(?=$|[\s\/\|\[\(])/g;

// âncoras que marcam o início do rodapé em ambos os tipos
const FOOTER_ANCHOR_RE =
  /(Base\s*I\.?N\.?S\.?S\.?|Base\s*C[aá]lculo\s*INSS|F\.?G\.?T\.?S\.?\s*do\s*M[eê]s|FGTS\s*a\s*ser\s*Depositado|Base\s*I\.?R\.?R\.?F\.?|Base\s*C[aá]lculo\s*IRRF|Dep\.\s*I\.?R\.?R\.?F\.?|L[ií]quido\s*a\s*Receber|13[\.\º]?\s*Sal[aá]rio\s*Antecipado)/i;


function normalizeCode(code) {
  if (!code) return code;
  let c = code.toUpperCase().trim();
  if (/\d/.test(c)) c = c.replace(/O/g, "0"); // O→0 se houver dígitos (ex: O101→0101)
  // caso específico: /B002 -> /B02 (OCR comum de "/B02")
  c = c.replace(/^\/B0+2$/i, "/B02");
  return c.replace(/[|]/g, "");
}

function stripInlineMonth(seg) {
  return seg.replace(/\b([0-1]\d)\/(\d{4})\b/g, " ").replace(/\s{2,}/g, " ");
}

function extractItemsUniversal(chunk, ctx) {
  const { mes: ctxMes, ano: ctxAno } = ctx || {};
  const tableRegion = normSpace(chunk.replace(/[|]/g, " "));

  // Encontra o início do rodapé para não “vazar” números
  const footerMatch = tableRegion.match(FOOTER_ANCHOR_RE);
  const footerStartIdx = footerMatch ? footerMatch.index : tableRegion.length;

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
    const nextIdx = i + 1 < hits.length ? hits[i + 1].idx : tableRegion.length;
    const hardEnd = Math.min(nextIdx, footerStartIdx); // <<< CORTA ANTES DO RODAPÉ
    if (hardEnd <= start) continue;

    let seg = normSpace(tableRegion.slice(start, hardEnd));

    // captura possível mm/aaaa do retroativo, antes de limpar
    const inline = seg.match(/\b([0-1]\d)\/(\d{4})\b/);
    const inlineMes = inline ? inline[1] : null;
    const inlineAno = inline ? inline[2] : null;

    seg = stripInlineMonth(seg).replace(/[[]+/g, " ").replace(/\s{2,}/g, " ");
    const code = hits[i].code;

    const numbers = seg.match(NUM_RE_G) || [];
    const valorStr = numbers.length >= 1 ? numbers[numbers.length - 1] : null;
    const qtdeStr = numbers.length >= 2 ? numbers[numbers.length - 2] : null;
    const valor = toFloat(valorStr);
    const quantidade = toFloat(qtdeStr);

    let descPart = seg.replace(new RegExp("^" + code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s+"), "");
    if (numbers.length) {
      const firstNum = numbers[0];
      const cutAt = descPart.indexOf(firstNum);
      if (cutAt >= 0) descPart = descPart.slice(0, cutAt);
    }

    let desc = normSpace(descPart).replace(/\s{2,}/g, " ").replace(/^\.|\.$/g, "");
    desc = stripDupCodePrefix(desc, `(${code})`);

    // Padronize "/D.S.R" para "D.S.R"
    desc = desc.replace(/^\/D\.?S\.?R\.?\b/i, "D.S.R");
    // Se sobrou um "/" inicial qualquer, remova
    if (/^\//.test(desc)) desc = desc.replace(/^\//, "").trim();
    
    if (!desc || /^TOTAL\b/i.test(desc)) continue;

    const isRetro = inlineMes && inlineAno && (inlineMes !== ctxMes || inlineAno !== ctxAno);

    if (isRetro) {
      items.push({ baseKey: `(${code}) ${desc} ${inlineMes}/${inlineAno}`, quantidade: null, valor });
    } else {
      // se só houver 1 número → é VALOR; QTD fica null (ex.: 7083 = 16,99)
      items.push({ baseKey: `(${code}) ${desc}`, quantidade, valor });
    }
  }

  // dedup (mantém quem tem mais info; funde faltantes)
  const map = new Map();
  for (const it of items) {
    const k = it.baseKey;
    const prev = map.get(k);
    if (!prev) { map.set(k, it); continue; }
    const score = x => (x.quantidade != null ? 1 : 0) + (x.valor != null ? 2 : 0);
    if (score(it) > score(prev)) map.set(k, it);
    else map.set(k, { baseKey: k, quantidade: prev.quantidade ?? it.quantidade ?? null, valor: prev.valor ?? it.valor ?? null });
  }
  return Array.from(map.values());
}

// -------- Rodapé (mapeia sinônimos para rótulos finais) --------
function extractFootersUniversal(chunk) {
  const t = " " + normSpace(chunk) + " ";
  const pick = (regex) => { const m = t.match(regex); return m ? toFloat(m[1]) : null; };

  // cada entrada tem o rótulo final desejado e os regex de captura (tipo1/tipo2)
  const defs = [
    {
      label: "Base I.N.S.S.",
      regexes: [
        /Base\s*I\.?N\.?S\.?S\.?\s*:\s*([-\d\.,]+)/i,         // tipo 2
        /Base\s*C[aá]lculo\s*INSS\s*[:\-]?\s*([-\d\.,]+)/i,   // tipo 1
      ]
    },
    {
      label: "F.G.T.S. do Mês",
      regexes: [
        /F\.?G\.?T\.?S\.?\s*do\s*M[eê]s\s*:\s*([-\d\.,]+)/i,  // tipo 2
        /FGTS\s*a\s*ser\s*Depositado\s*[:\-]?\s*([-\d\.,]+)/i // tipo 1
      ]
    },
    {
      label: "Base I.R.R.F.",
      regexes: [
        /Base\s*I\.?R\.?R\.?F\.?\s*:\s*([-\d\.,]+)/i,         // tipo 2
        /Base\s*C[aá]lculo\s*IRRF\s*[:\-]?\s*([-\d\.,]+)/i    // tipo 1
      ]
    },
    {
      label: "Dep. I.R.R.F.",
      regexes: [
        /Dep\.\s*I\.?R\.?R\.?F\.?\s*:\s*([-\d\.,]+)/i         // tipo 2
      ]
    },
    {
      label: "Base FGTS",
      regexes: [
        /Base\s*FGTS\s*:\s*([-\d\.,]+)/i,                     // ambos
        /Base\s*C[aá]lculo\s*FGTS\s*[:\-]?\s*([-\d\.,]+)/i    // tipo 1
      ]
    },
    // Se quiser manter também (opcional) no v002:
    {
      label: "Líquido a Receber",
      regexes: [/L[ií]quido\s*a\s*Receber\s*[:\-]?\s*([-\d\.,]+)/i]
    },
    {
      label: "13º Salário Antecipado em Férias",
      regexes: [/13[\.\º]?\s*Sal[aá]rio\s*Antecipado[\s\w]*?\s*([-\d\.,]+)/i]
    },
  ];

  const items = [];
  for (const def of defs) {
    let val = null;
    for (const rx of def.regexes) {
      val = pick(rx);
      if (val != null) break;
    }
    if (val != null && val !== 0) {
      items.push({
        baseKey: `(0000) ${def.label}`,
        quantidade: null,
        valor: val,
      });
    }
  }
  return items;
}
export async function parsePayrollOCR(pdfPath) {
  const raw = await ocrPdfToText(pdfPath);
  const periods = splitByPeriodsSmart(raw);

  return periods.map(({ mes, ano, chunk }) => {
    const itemsMain = extractItemsUniversal(chunk, { mes, ano });
    const itemsFooter = extractFootersUniversal(chunk); // já volta items (0000)
    return {
      mes,
      ano,
      items: [...itemsMain, ...itemsFooter],
    };
  });
}