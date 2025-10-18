# Desafio Técnico - Quick Filler

Sistema de extração e processamento de dados de documentos PDF (cartões de ponto e holerites) com geração automática de planilhas estruturadas.

## 📋 Descrição

Esta aplicação processa documentos PDF e extrai informações relevantes de forma estruturada, gerando planilhas Excel (.xlsx) com os dados organizados. O sistema suporta:

- **Cartões de Ponto**: Extração de horários de entrada/saída, total de horas trabalhadas
- **Holerites**: Extração de dados do funcionário, salário, descontos, benefícios

## 🚀 Instalação

### Pré-requisitos

- Node.js (versão 16 ou superior)
- npm ou yarn

### Passos de Instalação

1. **Clone o repositório**
   ```bash
   git clone <url-do-repositorio>
   cd desafio-programador
   ```

2. **Instale as dependências**
   ```bash
   npm install
   ```

3. **Verifique a instalação**
   ```bash
   npm test
   ```

## 🏃‍♂️ Como Executar a Aplicação

### Processamento de Cartão de Ponto

```bash
node src/cli/parse-time-card.js <caminho-do-pdf> [arquivo-saida.xlsx]
```

**Exemplo:**
```bash
node src/cli/parse-time-card.js src/inputs/Exemplo-Cartao-Ponto-01.pdf src/outputs/cartao_ponto_transcrito.xlsx
```

### Processamento de Holerite

```bash
node src/cli/parse-payroll.js <caminho-do-pdf> [arquivo-saida.xlsx]
```

**Exemplo:**
```bash
node src/cli/parse-payroll.js src/inputs/Exemplo-Holerite-01.pdf src/outputs/holerite_transcrito.xlsx
```

### Execução com Arquivos de Exemplo

```bash
# Processar cartão de ponto
node src/cli/parse-time-card.js src/inputs/Exemplo-Cartao-Ponto-01.pdf

# Processar holerite
node src/cli/parse-payroll.js src/inputs/Exemplo-Holerite-01.pdf
```

## 📦 Dependências Necessárias

### Dependências Principais

- **dayjs** (^1.11.18) - Manipulação de datas
- **fs-extra** (^11.3.2) - Operações de sistema de arquivos
- **pdfjs-dist** (^5.4.296) - Processamento de PDFs
- **sharp** (^0.34.4) - Processamento de imagens
- **tesseract.js** (^6.0.1) - OCR (Reconhecimento Óptico de Caracteres)
- **xlsx** (^0.18.5) - Geração de planilhas Excel

### Dependências de Desenvolvimento

- **jest** (^30.2.0) - Framework de testes

### Instalação Manual (se necessário)

```bash
npm install dayjs fs-extra pdfjs-dist sharp tesseract.js xlsx
npm install --save-dev jest
```

### ⚠️ Instalação do Poppler no Windows

Para o processamento de PDFs no Windows, é recomendado instalar o Poppler manualmente:

1. **Baixe o Poppler para Windows**
   - Acesse: [https://github.com/oschwartz10612/poppler-windows/releases/tag/v25.07.0-0](https://github.com/oschwartz10612/poppler-windows/releases/tag/v25.07.0-0)
   - Baixe o arquivo `poppler-25.07.0-0.zip`

2. **Extraia o arquivo**
   - Extraia o conteúdo para uma pasta (ex: `C:\poppler-25.07.0-0\`)

3. **Configure as variáveis de ambiente**
   - Abra "Variáveis de Ambiente" no Windows
   - Adicione `C:\poppler-25.07.0-0\Library\bin` ao PATH
   - Reinicie o terminal/IDE após a configuração

4. **Verifique a instalação**
   ```bash
   pdftoppm -h
   ```

**Nota**: A instalação manual do Poppler é necessária no Windows para evitar problemas de compatibilidade com bibliotecas de processamento de PDF.

## 💡 Exemplos de Uso

### 1. Processamento Básico

```bash
# Processar um cartão de ponto
node src/cli/parse-time-card.js documento.pdf

# Processar um holerite
node src/cli/parse-payroll.js holerite.pdf
```

### 2. Especificando Arquivo de Saída

```bash
# Cartão de ponto com saída personalizada
node src/cli/parse-time-card.js documento.pdf minha_planilha.xlsx

# Holerite com saída personalizada
node src/cli/parse-payroll.js holerite.pdf relatorio_salario.xlsx
```

### 3. Processamento em Lote

```bash
# Processar múltiplos cartões de ponto
for file in documentos/*.pdf; do
  node src/cli/parse-time-card.js "$file" "outputs/$(basename "$file" .pdf).xlsx"
done
```

### 4. Executando Testes

```bash
# Executar todos os testes
npm test

# Executar testes específicos
npm test -- --testNamePattern="payroll"
```

## 📁 Estrutura do Projeto

```
desafio-programador/
├── src/
│   ├── cli/                    # Scripts de linha de comando
│   │   ├── parse-payroll.js    # Processamento de holerites
│   │   └── parse-time-card.js  # Processamento de cartões de ponto
│   ├── inputs/                 # Arquivos PDF de entrada
│   ├── outputs/                # Planilhas geradas
│   ├── parsers/                # Módulos de parsing
│   ├── services/               # Serviços de planilha
│   ├── utils/                  # Utilitários
│   └── tessdata/               # Dados de treinamento OCR
├── tests/                      # Testes automatizados
├── package.json               # Configurações do projeto
└── README.md                  # Este arquivo
```

## 🔧 Funcionalidades

### Cartão de Ponto
- Extração automática de horários
- Cálculo de horas trabalhadas
- Identificação de períodos de trabalho
- Geração de planilha estruturada

### Holerite
- Extração de dados do funcionário
- Processamento de valores salariais
- Identificação de descontos e benefícios
- Geração de relatório consolidado

## 🐛 Solução de Problemas

### Erro de Dependências
```bash
# Limpar cache e reinstalar
rm -rf node_modules package-lock.json
npm install
```

### Erro de OCR
- Verifique se o arquivo `tessdata/por.traineddata` está presente
- Para PDFs escaneados, o sistema usa OCR automaticamente

### Erro de Permissão
```bash
# No Windows (PowerShell como administrador)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

## 📊 Saída Esperada

A aplicação gera planilhas Excel (.xlsx) com:

- **Cartão de Ponto**: Horários, datas, totais de horas
- **Holerite**: Dados pessoais, valores, descontos, benefícios

## 🧪 Testes

```bash
# Executar todos os testes
npm test
```

## 📝 Notas Importantes

- A aplicação suporta PDFs tanto com texto quanto escaneados (imagens)
- Para PDFs escaneados, o sistema utiliza OCR (Tesseract.js)
- Os arquivos de saída são salvos na pasta `src/outputs/` por padrão
- O sistema é otimizado para documentos em português

## 🤝 Contribuição

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -am 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

---

**Desenvolvido para Quick Filler** 🚀