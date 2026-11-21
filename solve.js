// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// Returns exactly what csv-reader 1.0.0 returns for every input, but reads with
// indexOf/slice/split instead of one character at a time. The semantics below
// mirror the reference (vendor/csv-reader/index.js) exactly:
//
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled,
//     "" inside it one quote and each CRLF or lone CR inside it read as LF; what
//     follows its closing quote, up to the next comma or line break, is appended
//     as it stands (quote_junk, when the field ends); a quote that never closes
//     is a literal character, and the text after it is read again as unquoted
//     (unterminated_quote); a quote inside an unquoted field is a literal;
//   - columns is the first record when header is true, else null; rows holds the
//     records after it, each padded (short_row, with fields: its count) or cut
//     (long_row, with extra: the cut fields) to the first record's width;
//   - each error is {code, line, row}, in the order met; line the 1-based line
//     its record starts on (every LF, CRLF and lone CR inside quotes counted),
//     row its record's index in rows (null for the header).
//
// Two paths read a record. The fast path takes a whole line with no quote and
// no stray CR and splits it on commas. Anything else goes through the
// field-by-field reader, which uses indexOf to jump from delimiter to
// delimiter and only falls back to short scans for the rare broken bits.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads an unquoted field starting at pos, appending onto `value` (the
  // quoted value when called for quote junk). A CR not followed by LF is
  // dropped (stray_cr); a CR right before the line break that ends the field
  // is the CRLF of that break. Returns the field, how it ended, and how many
  // characters this call appended (for quote_junk).
  function readUnquoted(value) {
    const startLen = value.length;
    let cIdx = text.indexOf(',', pos);
    if (cIdx === -1) cIdx = n + 1;
    let lIdx = text.indexOf('\n', pos);
    if (lIdx === -1) lIdx = n + 1;
    let fieldEnd;
    let ended;
    if (cIdx < lIdx) {
      fieldEnd = cIdx;
      ended = COMMA;
    } else if (lIdx <= n) {
      fieldEnd = lIdx;
      ended = LINE_BREAK;
    } else {
      fieldEnd = n;
      ended = END;
    }
    const seg = text.slice(pos, fieldEnd);
    if (seg.indexOf('\r') === -1) {
      value += seg;
    } else {
      // Drop every CR; the one right before the line break that ends this
      // field is the CRLF of that break, the rest are stray_cr errors.
      let out = '';
      let start = 0;
      for (let i = 0; i < seg.length; i++) {
        if (seg.charCodeAt(i) === 13) {
          if (!(ended === LINE_BREAK && i === seg.length - 1)) error('stray_cr');
          out += seg.slice(start, i);
          start = i + 1;
        }
      }
      value += out + seg.slice(start);
    }
    if (ended === COMMA) pos = fieldEnd + 1;
    else if (ended === LINE_BREAK) {
      pos = fieldEnd + 1;
      line += 1;
    } else pos = n;
    return { value, ended, added: value.length - startLen };
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    // The closing quote: the next quote that is not doubled.
    let q = text.indexOf('"', pos + 1);
    while (q !== -1 && text.charCodeAt(q + 1) === 34) q = text.indexOf('"', q + 2);
    if (q === -1) {
      // The quote never closes: it is a literal character, and the text after
      // it is read again as unquoted.
      pos = open + 1;
      line = openLine;
      error('unterminated_quote');
      return readUnquoted('"');
    }
    let value = text.slice(pos + 1, q);
    if (/["\r\n]/.test(value)) {
      if (value.indexOf('"') !== -1) value = value.replaceAll('""', '"');
      if (value.indexOf('\r') !== -1) value = value.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
      // Every line break inside quotes is one LF in the value now.
      let idx = -1;
      let breaks = 0;
      while ((idx = value.indexOf('\n', idx + 1)) !== -1) breaks++;
      line += breaks;
    }
    pos = q + 1;
    if (pos >= n) return { value, ended: END, added: 0 };
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      return { value, ended: COMMA, added: 0 };
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      return { value, ended: LINE_BREAK, added: 0 };
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return { value, ended: LINE_BREAK, added: 0 };
    }
    // What follows the closing quote is appended as it stands, up to the next comma or line break.
    const junk = readUnquoted(value);
    if (junk.added > 0) error('quote_junk');
    return junk;
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else break;
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: this physical line holds no quote and no stray CR, so it is
    // one whole record and splits on commas. (A quoted field that spans
    // lines always opens on this line, so a quote here rules it out.) The
    // line is only sliced when it holds no quote, so quoted lines cost one
    // short indexOf instead of a slice and two scans.
    let nl = text.indexOf('\n', pos);
    const hasNL = nl !== -1;
    if (!hasNL) nl = n;
    let fields;
    let lastQuoted = false;
    const qPos = text.indexOf('"', pos);
    if (qPos === -1 || qPos >= nl) {
      const seg = text.slice(pos, nl);
      const cr = seg.indexOf('\r');
      if (cr === -1) {
        fields = seg.split(',');
        pos = hasNL ? nl + 1 : n;
        if (hasNL) line += 1;
      } else if (hasNL && cr === seg.length - 1) {
        fields = seg.slice(0, -1).split(',');
        pos = nl + 1;
        line += 1;
      }
    }
    if (fields === undefined) {
      fields = [];
      // Field by field; the unquoted read is inlined here (the hot path) so
      // it costs no call and no result object per field.
      for (;;) {
        if (text.charCodeAt(pos) === 34) {
          lastQuoted = true;
          const f = readQuoted();
          fields.push(f.value);
          if (f.ended !== COMMA) break;
        } else {
          lastQuoted = false;
          let cIdx = text.indexOf(',', pos);
          if (cIdx === -1) cIdx = n + 1;
          let lIdx = text.indexOf('\n', pos);
          if (lIdx === -1) lIdx = n + 1;
          let fieldEnd;
          let ended;
          if (cIdx < lIdx) {
            fieldEnd = cIdx;
            ended = COMMA;
          } else if (lIdx <= n) {
            fieldEnd = lIdx;
            ended = LINE_BREAK;
          } else {
            fieldEnd = n;
            ended = END;
          }
          let f = text.slice(pos, fieldEnd);
          const crAt = f.indexOf('\r');
          if (crAt !== -1) {
            let out = '';
            let start = 0;
            for (let i = 0; i < f.length; i++) {
              if (f.charCodeAt(i) === 13) {
                if (!(ended === LINE_BREAK && i === f.length - 1)) error('stray_cr');
                out += f.slice(start, i);
                start = i + 1;
              }
            }
            f = out + f.slice(start);
          }
          fields.push(f);
          if (ended === COMMA) pos = fieldEnd + 1;
          else if (ended === LINE_BREAK) {
            pos = fieldEnd + 1;
            line += 1;
            break;
          } else {
            pos = n;
            break;
          }
        }
      }
    }

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
