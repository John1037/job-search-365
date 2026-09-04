import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getDocumentProxy, extractTextItems } from 'https://esm.sh/unpdf';
import * as mammoth from 'https://esm.sh/mammoth@1.8.0';
import { Buffer } from 'node:buffer';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const MAX_FILE_BYTES = 8 * 1024 * 1024;

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// --- PDF extraction -------------------------------------------------------
// Adapted from the old optimize-cv function's positioned-text approach, but
// scoped down for extraction rather than exact reproduction: we don't need
// to preserve original wording, just give DeepSeek clean, well-ordered text
// with light heading/bullet markers. The one thing we DO need to get right
// is refusing to guess on a layout we can't read reliably — see
// detectColumnLayout below.

interface RawItem {
  str: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontFamily: string;
  hasEOL: boolean;
}

interface Line {
  y: number;
  fontSize: number;
  fontFamily: string;
  text: string;
  minX: number;
  maxRight: number;
}

// A gap this wide between two items on the same Y is almost certainly a
// sidebar/column gutter, not ordinary word spacing (even generous letter
// spacing rarely exceeds ~12-15pt) — without this guard, a sidebar item and
// a main-column item that happen to land at the same height would get
// merged into one garbled line before column-aware reading even gets a
// chance to separate them.
const MAX_MERGE_GAP = 18;

function groupItemsIntoLines(items: RawItem[]): Line[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const Y_TOLERANCE = 3;
  const lines: Line[] = [];
  let forceNewLine = true;

  for (const item of sorted) {
    const text = item.str.trim();
    if (!text) {
      forceNewLine = forceNewLine || item.hasEOL;
      continue;
    }

    const last = lines[lines.length - 1];
    const gap = last ? item.x - last.maxRight : Infinity;
    if (!forceNewLine && last && Math.abs(last.y - item.y) <= Y_TOLERANCE && gap <= MAX_MERGE_GAP) {
      last.text += (last.text.endsWith(' ') ? '' : ' ') + text;
      last.fontSize = Math.max(last.fontSize, item.fontSize);
      last.maxRight = Math.max(last.maxRight, item.x + item.width);
    } else {
      lines.push({
        y: item.y,
        fontSize: item.fontSize,
        fontFamily: item.fontFamily,
        text,
        minX: item.x,
        maxRight: item.x + item.width,
      });
    }

    forceNewLine = item.hasEOL;
  }

  return lines;
}

function mode(values: number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0];
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function isBoldFont(fontFamily: string): boolean {
  return /bold/i.test(fontFamily);
}

const BULLET_MARKER = /^[•\-*]\s*/;

// Lightly marks up a heading/sub-heading/bullet line (## / ### / -) so
// DeepSeek has some structural signal to work with, without attempting to
// exactly reconstruct sections the way the old reorder feature needed to.
function markLine(line: Line, modalSize: number): string {
  const words = wordCount(line.text);
  const isHeading = line.fontSize >= modalSize * 1.15 && words <= 10;
  const isSubHeading =
    !isHeading &&
    (isBoldFont(line.fontFamily) || line.fontSize >= modalSize + 0.2) &&
    words <= 15;

  if (isHeading) return `## ${line.text}`;
  if (isSubHeading) return `### ${line.text}`;
  if (BULLET_MARKER.test(line.text)) return `- ${line.text.replace(BULLET_MARKER, '')}`;
  return line.text;
}

// For a page flagged as columnar (see detectColumnLayout below): read each
// region fully top-to-bottom — first any full-width lines (a name/header
// spanning the whole page), then the left region, then the right region —
// rather than interleaving by raw Y position. A sidebar and a main column
// are two independent stories, not one continuous line of text split
// across the page; reading them as such is what actually recovers the
// content instead of just refusing to look at it.
function buildMarkedText(pagesItems: RawItem[][], columnAware: boolean): string {
  const allLines = pagesItems.flatMap((pageItems) => groupItemsIntoLines(pageItems));
  const modalSize = mode(allLines.map((l) => Math.round(l.fontSize * 10) / 10));
  const out: string[] = [];

  for (const items of pagesItems) {
    if (items.length === 0) continue;
    const lines = groupItemsIntoLines(items);

    if (!columnAware) {
      for (const line of lines) out.push(markLine(line, modalSize));
      continue;
    }

    const minX = Math.min(...items.map((it) => it.x));
    const maxRight = Math.max(...items.map((it) => it.x + it.width));
    const pageContentWidth = maxRight - minX;
    const midpoint = minX + pageContentWidth / 2;

    const wideLines: Line[] = [];
    const leftLines: Line[] = [];
    const rightLines: Line[] = [];

    for (const line of lines) {
      const lineWidth = line.maxRight - line.minX;
      if (pageContentWidth <= 0 || lineWidth > pageContentWidth * 0.6) {
        wideLines.push(line);
      } else if (line.minX + lineWidth / 2 < midpoint) {
        leftLines.push(line);
      } else {
        rightLines.push(line);
      }
    }

    for (const line of wideLines) out.push(markLine(line, modalSize));
    for (const line of leftLines) out.push(markLine(line, modalSize));
    for (const line of rightLines) out.push(markLine(line, modalSize));
  }

  return out.join('\n');
}

// Decides whether a page needs COLUMN-AWARE reading (buildMarkedText above)
// instead of plain top-to-bottom order — not a "can we read this at all"
// gate; a detected column layout still gets read, just region-by-region.
// Two independent checks, either one enough to trigger it:
//
// 1. Synchronized columns (e.g. a two-column magazine-style body where both
//    sides wrap roughly line-for-line): many ROWS with text sitting in two
//    separate horizontal clusters with a wide gap between them.
// 2. A sidebar running independently of the main column (this app's own
//    sidebar templates are exactly this: a shaded panel with its own pacing
//    that rarely lands on the same Y as the main column) — rows almost
//    never line up, so check #1 misses it. Instead this looks at left vs.
//    right content as two REGIONS: if both sides have substantial text
//    spanning a large, mostly-overlapping vertical range of the page, that
//    itself is the signature of a sidebar, regardless of row alignment.
//
// A handful of two-part lines (contact details, a short skills table)
// shouldn't trip either; a genuine two-column layout or sidebar should.
function detectColumnLayout(pagesItems: RawItem[][]): boolean {
  for (const items of pagesItems) {
    if (items.length < 20) continue;

    const minX = Math.min(...items.map((it) => it.x));
    const maxRight = Math.max(...items.map((it) => it.x + it.width));
    const pageContentWidth = maxRight - minX;
    if (pageContentWidth <= 0) continue;
    const midpoint = minX + pageContentWidth / 2;
    const allYs = items.map((it) => it.y);
    const pageHeightSpan = Math.max(...allYs) - Math.min(...allYs);
    if (pageHeightSpan <= 0) continue;

    // Check 1: synchronized side-by-side columns.
    const sorted = [...items].sort((a, b) => b.y - a.y);
    const rows: RawItem[][] = [];
    const Y_TOLERANCE = 4;
    for (const item of sorted) {
      const lastRow = rows[rows.length - 1];
      if (lastRow && Math.abs(lastRow[0].y - item.y) <= Y_TOLERANCE) {
        lastRow.push(item);
      } else {
        rows.push([item]);
      }
    }

    let splitRowCount = 0;
    for (const row of rows) {
      const leftItems = row.filter((it) => it.x < midpoint);
      const rightItems = row.filter((it) => it.x >= midpoint);
      if (leftItems.length < 2 || rightItems.length < 2) continue;

      const leftRightEdge = Math.max(...leftItems.map((it) => it.x + it.width));
      const rightLeftEdge = Math.min(...rightItems.map((it) => it.x));
      const gap = rightLeftEdge - leftRightEdge;
      if (gap > pageContentWidth * 0.12) splitRowCount++;
    }

    if (rows.length > 0 && splitRowCount >= 12 && splitRowCount / rows.length > 0.25) {
      return true;
    }

    // Check 2: an independently-paced sidebar region.
    const leftItems = items.filter((it) => it.x + it.width <= midpoint);
    const rightItems = items.filter((it) => it.x >= midpoint);
    if (leftItems.length < 10 || rightItems.length < 10) continue;

    const leftYs = leftItems.map((it) => it.y);
    const rightYs = rightItems.map((it) => it.y);
    const leftSpan = Math.max(...leftYs) - Math.min(...leftYs);
    const rightSpan = Math.max(...rightYs) - Math.min(...rightYs);
    const minSpan = Math.min(leftSpan, rightSpan);

    const overlapStart = Math.max(Math.min(...leftYs), Math.min(...rightYs));
    const overlapEnd = Math.min(Math.max(...leftYs), Math.max(...rightYs));
    const overlap = Math.max(0, overlapEnd - overlapStart);

    if (minSpan > pageHeightSpan * 0.3 && overlap > minSpan * 0.6) {
      return true;
    }
  }
  return false;
}

async function extractPdfText(
  bytes: Uint8Array,
): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const pdf = await getDocumentProxy(bytes);
  const { items } = await extractTextItems(pdf);

  const totalChars = items.flat().reduce((sum, it) => sum + it.str.trim().length, 0);
  if (totalChars < 200) {
    return {
      ok: false,
      reason:
        "Couldn't find readable text in this PDF — it may be a scanned image. Please enter your details manually.",
    };
  }

  return { ok: true, text: buildMarkedText(items, detectColumnLayout(items)) };
}

// --- DOCX extraction --------------------------------------------------------

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ');
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// A layout table (common for two-column Word CV templates) still reads
// coherently once flattened: each <td>'s own <p> boundaries are preserved
// as line breaks BEFORE this function ever sees a </td>, so a cell's
// content stays internally intact — cells are then separated with a blank
// line (not run together) so each reads as its own block, in effect a
// left-column-then-right-column order like the PDF column-aware reading.
function htmlToMarkedText(html: string): string {
  let s = html;
  s = s.replace(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi, (_m, inner) => `\n## ${stripTags(inner)}\n`);
  s = s.replace(/<h[4-6][^>]*>([\s\S]*?)<\/h[4-6]>/gi, (_m, inner) => `\n### ${stripTags(inner)}\n`);
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, inner) => `\n- ${stripTags(inner)}`);
  s = s.replace(/<\/p>/gi, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<tr[^>]*>/gi, '\n');
  s = s.replace(/<\/td>/gi, '\n\n');
  s = stripTags(s);
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  return decodeHtmlEntities(s).trim();
}

async function extractDocxText(
  bytes: Uint8Array,
): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  let html: string;
  try {
    // mammoth's Deno/esm.sh build resolves to its Node entry point, which
    // looks for {path} or {buffer} — {arrayBuffer} is only accepted by a
    // separate browser bundle we're not using, and silently fails with
    // "Could not find file in options" if passed here instead.
    const result = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
    html = result.value;
  } catch (err) {
    console.log('[import-cv] mammoth conversion failed:', err);
    return { ok: false, reason: "Couldn't read this .docx file." };
  }

  const text = htmlToMarkedText(html);
  if (text.length < 100) {
    return {
      ok: false,
      reason: "Couldn't find enough readable text in this document.",
    };
  }

  return { ok: true, text };
}

// --- DeepSeek extraction ----------------------------------------------------

const EXTRACTION_SYSTEM_PROMPT =
  "Extract structured CV/resume data from raw text extracted from a candidate's " +
  'uploaded document. Extract ONLY what is explicitly present in the text — ' +
  'never invent employers, dates, schools, or details, and never infer a value ' +
  'that is not clearly stated. Omit a field (use null) rather than guessing. ' +
  'For dates, use 4-digit years and 1-12 for months when a month is given; set ' +
  'is_current true only if the text itself says so (e.g. "Present", "Current"). ' +
  'If the CV opens with a personal statement/summary/profile paragraph (a few ' +
  'sentences about the candidate, not a heading like "Profile" on its own), ' +
  'copy it into profile_summary — otherwise use null. ' +
  'Respond with JSON matching exactly this shape: {' +
  '"profile_summary": string|null, ' +
  '"skills": string[], ' +
  '"experience": [{"job_title": string, "employer": string, "location": string|null, ' +
  '"start_year": number, "start_month": number|null, "end_year": number|null, ' +
  '"end_month": number|null, "is_current": boolean, "bullets": string[]}], ' +
  '"education": [{"level": string, "subject": string|null, "grade": string|null, ' +
  '"establishment": string, "qualification_year": number|null, "items": string[]}], ' +
  '"certifications": [{"title": string, "issuer": string, "location": string|null, ' +
  '"start_year": number|null, "start_month": number|null, "end_year": number|null, ' +
  '"end_month": number|null, "is_current": boolean, "items": string[]}]' +
  '}. Every array is required (use an empty array if nothing of that kind is present).';

async function callDeepSeek(systemPrompt: string, userPrompt: string): Promise<any> {
  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('DEEPSEEK_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-v4-pro',
        thinking: { type: 'disabled' },
        response_format: { type: 'json_object' },
        max_tokens: 3500,
        temperature: 0,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.log('[import-cv] DeepSeek call failed:', detail);
      return null;
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    return content ? JSON.parse(content) : null;
  } catch (err) {
    console.log('[import-cv] DeepSeek call failed:', err);
    return null;
  }
}

// Defensive shape-validation on the model's output, same principle used
// elsewhere in this app: never trust an AI response's shape directly. Drops
// any entry missing the fields its DB row requires (NOT NULL columns).
function sanitizeExtraction(res: any) {
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  const strArray = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : [];

  const profile_summary = str(res?.profile_summary);
  const skills = strArray(res?.skills);

  const experience = Array.isArray(res?.experience)
    ? res.experience
        .map((e: any) => ({
          job_title: str(e?.job_title),
          employer: str(e?.employer),
          location: str(e?.location),
          start_year: num(e?.start_year),
          start_month: num(e?.start_month),
          end_year: num(e?.end_year),
          end_month: num(e?.end_month),
          is_current: !!e?.is_current,
          bullets: strArray(e?.bullets),
        }))
        .filter((e: any) => e.job_title && e.employer && e.start_year)
    : [];

  const education = Array.isArray(res?.education)
    ? res.education
        .map((e: any) => ({
          level: str(e?.level),
          subject: str(e?.subject),
          grade: str(e?.grade),
          establishment: str(e?.establishment),
          qualification_year: num(e?.qualification_year),
          items: strArray(e?.items),
        }))
        .filter((e: any) => e.level && e.establishment)
    : [];

  const certifications = Array.isArray(res?.certifications)
    ? res.certifications
        .map((c: any) => ({
          title: str(c?.title),
          issuer: str(c?.issuer),
          location: str(c?.location),
          start_year: num(c?.start_year),
          start_month: num(c?.start_month),
          end_year: num(c?.end_year),
          end_month: num(c?.end_month),
          is_current: !!c?.is_current,
          items: strArray(c?.items),
        }))
        .filter((c: any) => c.title && c.issuer)
    : [];

  return { profile_summary, skills, experience, education, certifications };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing authorization header' }, 401);
  }

  // Auth is checked (this is a signed-in-only feature) but the extraction
  // itself never touches the database — it only reads the uploaded file and
  // returns structured data for the client to review before saving anything.
  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser();

  if (userError || !user) {
    return jsonResponse({ error: 'Not authenticated' }, 401);
  }

  let file_name: string | undefined;
  let file_base64: string | undefined;
  try {
    ({ file_name, file_base64 } = await req.json());
  } catch (err) {
    console.log('[import-cv] failed to parse request body:', err);
    return jsonResponse({ error: 'Invalid request' }, 400);
  }

  if (!file_name || !file_base64) {
    return jsonResponse({ error: 'Missing file' }, 400);
  }

  const lowerName = file_name.toLowerCase();
  const isPdf = lowerName.endsWith('.pdf');
  const isDocx = lowerName.endsWith('.docx');
  if (!isPdf && !isDocx) {
    return jsonResponse({ error: 'Please upload a .pdf or .docx file.' }, 400);
  }

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(file_base64);
  } catch (err) {
    console.log('[import-cv] failed to decode uploaded file:', err);
    return jsonResponse({ error: 'Could not read the uploaded file.' }, 400);
  }

  if (bytes.byteLength > MAX_FILE_BYTES) {
    return jsonResponse({ error: 'File is too large (8MB max).' }, 400);
  }

  let extraction: { ok: true; text: string } | { ok: false; reason: string };
  try {
    extraction = isPdf ? await extractPdfText(bytes) : await extractDocxText(bytes);
  } catch (err) {
    console.log('[import-cv] text extraction failed:', err);
    return jsonResponse({ error: 'Could not read this file.' }, 400);
  }

  if (!extraction.ok) {
    return jsonResponse({ error: extraction.reason }, 422);
  }

  // A CV is a couple of pages — generous headroom without an unbounded
  // request to the model.
  const text = extraction.text.slice(0, 20000);

  const res = await callDeepSeek(EXTRACTION_SYSTEM_PROMPT, `CV text:\n${text}`);

  if (!res) {
    return jsonResponse(
      { error: 'Could not extract structured data from this CV. Please try again or enter your details manually.' },
      502,
    );
  }

  return jsonResponse({ extracted: sanitizeExtraction(res) }, 200);
});
