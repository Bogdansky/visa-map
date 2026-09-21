export interface SourceRow {
  passport: string;
  destination: string;
  requirement: string;
}

/** Parses the tidy ISO3 Passport Index CSV (`Passport,Destination,Requirement`, no quoting). */
export function parseTidyCsv(text: string): SourceRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = lines
    .shift()
    ?.split(',')
    .map((h) => h.trim());
  if (!header || header.join() !== 'Passport,Destination,Requirement') {
    throw new Error(`Unexpected CSV header: ${header?.join(',')}`);
  }
  return lines.map((line, i) => {
    const cells = line.split(',');
    if (cells.length !== 3) throw new Error(`Malformed CSV row ${i + 2}: ${line}`);
    return { passport: cells[0].trim(), destination: cells[1].trim(), requirement: cells[2] };
  });
}
