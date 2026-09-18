/**
 * Lectura de los CSV de contraseñas que exportan los navegadores y gestores:
 *
 * - Chrome, Edge, Brave, Vivaldi, Opera: `name,url,username,password[,note]`
 * - Firefox: `"url","username","password","httpRealm","formActionOrigin",…`
 * - Safari: `Title,URL,Username,Password,Notes,OTPAuth`
 * - Bitwarden: `folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,…`
 *
 * Las columnas se localizan por nombre de cabecera (sin distinguir mayúsculas),
 * así que el orden da igual.
 */

export interface PasswordCsvRow {
  domain: string;
  url: string;
  username: string;
  password: string;
  notes: string;
}

/**
 * Parser CSV (RFC 4180): comillas dobles, `""` como comilla escapada, comas y
 * saltos de línea dentro de campos entrecomillados (las notas de Chrome los
 * llevan) y finales de línea CRLF o LF. Ignora el BOM inicial.
 */
export function parseCsvRecords(content: string): string[][] {
  const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  // Líneas en blanco: un único campo vacío.
  return records.filter((r) => !(r.length === 1 && r[0]!.trim() === ''));
}

const URL_COLUMNS = ['url', 'login_uri', 'website', 'origin'];
const USER_COLUMNS = ['username', 'login_username', 'user'];
const PASSWORD_COLUMNS = ['password', 'login_password'];
const NOTES_COLUMNS = ['notes', 'note'];

function pick(row: Record<string, string>, columns: string[]): string {
  for (const c of columns) {
    const v = row[c];
    if (v !== undefined && v !== '') return v;
  }
  return '';
}

/**
 * Filas del CSV normalizadas. `domain` queda vacío cuando la URL no es una
 * dirección web (p. ej. las entradas `android://` que exporta Chrome): el
 * importador las omite porque el vault se indexa por dominio web.
 */
export function parsePasswordCsv(content: string): PasswordCsvRow[] {
  const records = parseCsvRecords(content);
  if (records.length < 2) return [];
  const header = records[0]!.map((h) => h.trim().toLowerCase());
  const results: PasswordCsvRow[] = [];

  for (const cols of records.slice(1)) {
    const row: Record<string, string> = {};
    header.forEach((h, idx) => {
      row[h] = cols[idx] ?? '';
    });
    const url = pick(row, URL_COLUMNS).trim();
    let domain = '';
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') domain = parsed.hostname;
    } catch {
      domain = '';
    }
    results.push({
      domain,
      url,
      username: pick(row, USER_COLUMNS),
      password: pick(row, PASSWORD_COLUMNS),
      notes: pick(row, NOTES_COLUMNS),
    });
  }
  return results;
}
