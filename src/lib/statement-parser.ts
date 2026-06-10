// Parser de extratos bancários para o módulo financeiro.
// Suporta OFX (formato padrão de exportação do Banco Inter e da maioria dos
// bancos) e CSV no layout do extrato do Inter
// ("Data Lançamento;Descrição;Valor;Saldo").

export interface ParsedTransaction {
  transactionDate: string; // YYYY-MM-DD
  amount: number; // sempre positivo
  direction: "in" | "out";
  description: string;
  externalId: string | null; // FITID do OFX, quando houver
}

export function parseStatement(filename: string, content: string): ParsedTransaction[] {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".ofx") || content.includes("<OFX")) {
    return parseOfx(content);
  }
  return parseCsv(content);
}

export function parseOfx(content: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  const blocks = content.split(/<STMTTRN>/i).slice(1);
  for (const block of blocks) {
    const tag = (name: string): string | null => {
      const m = block.match(new RegExp(`<${name}>([^<\r\n]+)`, "i"));
      return m ? m[1].trim() : null;
    };
    const rawDate = tag("DTPOSTED");
    const rawAmount = tag("TRNAMT");
    if (!rawDate || !rawAmount) continue;

    const date = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
    const amount = parseFloat(rawAmount.replace(",", "."));
    if (Number.isNaN(amount)) continue;

    transactions.push({
      transactionDate: date,
      amount: Math.abs(amount),
      direction: amount >= 0 ? "in" : "out",
      description: tag("MEMO") ?? tag("NAME") ?? "Lançamento",
      externalId: tag("FITID"),
    });
  }
  return transactions;
}

export function parseCsv(content: string): ParsedTransaction[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const sep = lines[0].includes(";") ? ";" : ",";
  const header = lines[0].toLowerCase();
  const cols = header.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));

  const dateIdx = cols.findIndex((c) => c.includes("data"));
  const descIdx = cols.findIndex(
    (c) => c.includes("descri") || c.includes("hist") || c.includes("lançamento")
  );
  const amountIdx = cols.findIndex((c) => c.includes("valor") || c.includes("amount"));
  if (dateIdx === -1 || amountIdx === -1) {
    throw new Error(
      "CSV não reconhecido: esperado cabeçalho com colunas de data e valor (ex.: extrato do Inter)."
    );
  }

  const transactions: ParsedTransaction[] = [];
  for (const line of lines.slice(1)) {
    const parts = line.split(sep).map((p) => p.trim().replace(/^"|"$/g, ""));
    if (parts.length <= Math.max(dateIdx, amountIdx)) continue;

    const date = parseBrDate(parts[dateIdx]);
    const amount = parseBrNumber(parts[amountIdx]);
    if (!date || amount === null || amount === 0) continue;

    transactions.push({
      transactionDate: date,
      amount: Math.abs(amount),
      direction: amount >= 0 ? "in" : "out",
      description: descIdx !== -1 ? parts[descIdx] : "Lançamento",
      externalId: null,
    });
  }
  return transactions;
}

function parseBrDate(value: string): string | null {
  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return value.slice(0, 10);
  return null;
}

function parseBrNumber(value: string): number | null {
  // "R$ 1.234,56" -> 1234.56 ; "-150,00" -> -150
  const cleaned = value
    .replace(/R\$\s?/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? null : n;
}
