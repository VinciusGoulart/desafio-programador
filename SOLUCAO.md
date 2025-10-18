# 🧩 SOLUÇÃO — Desafio Programador (Holerites e Cartões de Ponto)

## 📘 Contexto do Problema

O desafio consistia em desenvolver **parsers robustos** capazes de extrair informações de **holerites (tipos 1 e 2)** e **cartões de ponto**, gerando posteriormente uma **planilha consolidada (`XLSX`)** com todos os dados tratados e normalizados.

Os documentos de entrada apresentam variações estruturais — alguns seguem um padrão tabular legível diretamente, enquanto outros dependem de **OCR** (reconhecimento óptico de caracteres).
Nosso objetivo foi unificar e automatizar esse processo garantindo consistência e testes completos.

---

## 🧠 Abordagem Geral

A solução foi dividida em **três módulos principais**, cada um com responsabilidades bem definidas:

### 1. `parsePayrollPDF.js` — Holerites Tipo 1 (sem OCR)

* Extrai texto diretamente via `pdfjsLib` (`extractTextFromPDF`).
* Divide o documento em períodos com base em **“Mês/Ano: mm/aaaa”**.
* Identifica **itens** (linhas com códigos, descrições e valores) e **rodapés** (campos de totais).
* Faz a normalização de valores decimais e quantidades (ex.: `1.234,56 → 1234.56`).
* Gera uma estrutura uniforme:

  ```js
  [
    {
      mes: "08",
      ano: "2012",
      items: [{ baseKey, quantidade, valor }],
      footers: { "Base Cálculo INSS": 1115.31, ... }
    }
  ]
  ```

### 2. `parsePayrollOCR.js` — Holerites Tipo 2 (com OCR)

* Utiliza `ocrUtils.js` para extrair texto de PDFs escaneados.
* Implementa heurísticas para reconhecer linhas OCR imperfeitas:

  * Corrige `O→0` em códigos (ex.: `O101 → 0101`);
  * Colapsa códigos duplicados (`/BO02` → `/B02`);
  * Detecta períodos retroativos (`05/2019`, `06/2019`...).
* Realiza parsing linha a linha, agrupando itens por período.
* Resulta em uma estrutura idêntica à do tipo 1, permitindo reaproveitamento de downstream.

### 3. `spreadsheetServicePayroll.js` — Geração de Planilha

* Recebe os objetos `months[]` vindos dos parsers.
* Gera um **pivot dinâmico** em formato Excel:

  * Cada `baseKey` (ex.: `(0100) Horas Trabalhadas`) vira uma ou duas colunas (`QUANTIDADE` / `VALOR`);
  * Rodapés (`footers`) são convertidos em colunas `(0000) <Label> VALOR`;
  * Colunas totalmente vazias são removidas.
* Inclui **normalização canônica** de chaves via `canonicalizeBaseKey()`:

  * Corrige ruídos OCR (`O→0`, `/BO02` → `/B02`);
  * Remove “eco” do código no início da descrição (`(/B02) BO02 Adiantamento pago` → `(/B02) Adiantamento pago`);
  * Uniformiza retroativos (`mm/aaaa VALOR`).

---

## 🧪 Estratégia de Testes

Os testes foram estruturados com **Jest (ESM)** e cobrindo os seguintes níveis:

### 🔹 1. Testes de Parser OCR (`payrollOCRParser.test.js`)

* Validam normalização de códigos (`O→0`, `/BO02→/B02`);
* Confirmam agrupamento correto por períodos (`05/2019 → 07/2019`);
* Testam rodapés e itens retroativos (`05/2019` dentro de `06/2019`).

### 🔹 2. Testes de Parser PDF (`payrollPDFParser.test.js`)

* Simulam `extractTextFromPDF` com `jest.unstable_mockModule`;
* Validam:

  * Identificação de períodos múltiplos;
  * Extração correta de `quantidade` e `valor`;
  * Ignorar cabeçalhos/linhas “TOTAL”;
  * Conversão de campos do rodapé.

### 🔹 3. Testes de Planilha (`spreadsheetServicePayroll.test.js`)

* Usam `xlsx` para leitura da planilha gerada;
* Confirmam:

  * Geração dinâmica de colunas conforme os dados;
  * Conversão de `footers` para colunas `(0000)`;
  * Remoção de colunas vazias;
  * Colapso de variações OCR em uma única chave (`/B02`);
  * Correção de ecos de código (`BO02` na descrição).

### 🔹 4. Testes de Cartão de Ponto (`timeCardParser.test.js` e `spreadsheetService.test.js`)

* Validam cálculo de horas, normalização de dias, e consistência de formatação no XLSX.

---

## ⚙️ Decisões Técnicas Importantes

| Questão                               | Decisão Tomada                                                               | Justificativa                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Diferenciar Holerites Tipo 1 e Tipo 2 | Mantivemos **dois parsers separados** (`parsePayrollPDF`, `parsePayrollOCR`) | Tipos 1 e 2 têm origens e estruturas distintas; unificar introduziria complexidade desnecessária. |
| OCR vs PDF direto                     | OCR apenas quando necessário                                                 | Evita perda de precisão e aumenta a performance.                                                  |
| Colunas de saída (XLSX)               | Dinâmicas com base nos dados                                                 | Flexibiliza novos campos sem alterar o código.                                                    |
| Testes                                | 100% unitários com `jest.unstable_mockModule`                                | Permite isolamento completo e previsibilidade.                                                    |
| Normalização OCR                      | Regex avançada e heurísticas canônicas                                       | Evita colunas duplicadas e inconsistências nos nomes.                                             |

---

## 🧾 Estrutura Final do Projeto

```
src/
 ├─ parsers/
 │   ├─ payrollPDFParser.js
 │   ├─ payrollOCRParser.js
 │   └─ timeCardParser.js
 ├─ utils/
 │   ├─ pdfUtils.js
 │   ├─ ocrUtils.js
 │   └─ common.js
 ├─ services/
 │   ├─ spreadsheetService.js
 │   └─ spreadsheetServicePayroll.js
tests/
 ├─ payrollTests/
 │   ├─ payrollPDFParser.test.js
 │   ├─ payrollOCRParser.test.js
 │   └─ spreadsheetServicePayroll.test.js
 └─ timeCardTests/
     ├─ timeCardParser.test.js
     └─ spreadsheetService.test.js
```

---

## ✅ Conclusão

A abordagem escolhida combina **clareza modular**, **normalização robusta** e **testabilidade total**.
O projeto agora é capaz de:

* Extrair informações tanto de PDFs nativos quanto OCRizados;
* Padronizar e limpar ruídos de leitura;
* Consolidar todos os resultados em uma planilha confiável e escalável.

O sistema foi estruturado para fácil manutenção e futura integração com pipelines automatizados ou interfaces web.

---
