import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractTextItems, getDocumentProxy } from 'https://esm.sh/unpdf';

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

// A CV with many reorderable sections/sub-sections/categorized lists can
// need a couple dozen DeepSeek calls. Firing them all at once regularly
// exceeded whatever soft concurrency limit this API key has — later
// calls sat queued server-side until they blew past even a generous
// per-call timeout. A shared limiter caps how many are in flight at once,
// regardless of how many independent call sites (nested or not) need one.
function createSemaphore(limit: number) {
  let active = 0;
  const waiting: (() => void)[] = [];

  async function acquire() {
    if (active < limit) {
      active++;
      return;
    }
    await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
  }

  function release() {
    active--;
    waiting.shift()?.();
  }

  return { acquire, release };
}

const deepseekSemaphore = createSemaphore(4);

interface Line {
  y: number;
  fontSize: number;
  fontFamily: string;
  text: string;
  page: number;
  // The rightmost extent (x + width) of any item on this line — used to
  // tell a width-driven wrap (line runs out close to the page's right
  // margin, so the next line very likely continues the same sentence)
  // apart from a genuinely complete, standalone line (ends well short of
  // the margin). pdf.js's hasEOL flag turns out to be an unreliable proxy
  // for this on some PDF exporters — it can mark ordinary wraps the same
  // as real paragraph breaks — so this geometric signal is used instead.
  rightEdge: number;
}

// Merges positioned text items into reading-order lines. Items on roughly
// the same Y (within tolerance) are one line; a hasEOL flag always forces a
// new line even if Y hasn't drifted much yet.
function groupItemsIntoLines(
  items: {
    str: string;
    x: number;
    y: number;
    width: number;
    fontSize: number;
    fontFamily: string;
    hasEOL: boolean;
  }[],
  page: number,
): Line[] {
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

    const itemRightEdge = item.x + item.width;
    const last = lines[lines.length - 1];
    if (!forceNewLine && last && Math.abs(last.y - item.y) <= Y_TOLERANCE) {
      last.text += (last.text.endsWith(' ') ? '' : ' ') + text;
      last.fontSize = Math.max(last.fontSize, item.fontSize);
      last.rightEdge = Math.max(last.rightEdge, itemRightEdge);
    } else {
      lines.push({
        y: item.y,
        fontSize: item.fontSize,
        fontFamily: item.fontFamily,
        text,
        page,
        rightEdge: itemRightEdge,
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

// Tier 1: a section header (font size stands out clearly from body text).
// Tier 2: a sub-header — not tier 1, but either a real bold font name (a
// proxy for bold weight, on PDFs where the embedded font name actually
// says so) OR a font size just slightly above body size (some PDF
// exporters report only a generic family like "sans-serif" for every
// line, with bold weight showing up solely as a small size bump instead —
// confirmed by inspecting this project's actual extracted font data,
// where sub-headers sit at ~10.4pt against a ~10.1pt body). Tier 0:
// ordinary body text.
function classifyTier(line: Line, modalSize: number): 0 | 1 | 2 {
  const words = wordCount(line.text);
  if (line.fontSize >= modalSize * 1.15 && words <= 10) return 1;

  const slightlyLarger =
    line.fontSize >= modalSize + 0.2 && line.fontSize < modalSize * 1.15;
  if ((slightlyLarger || isBoldFont(line.fontFamily)) && words <= 15) return 2;

  return 0;
}

interface SubSection {
  // Multiple strings when consecutive bold lines were merged into one
  // header unit (e.g. company name + role/dates on separate lines) — each
  // renders as its own line to retain the original hard break. Null for
  // the implicit whole-section body when a section has no sub-headers.
  header: string[] | null;
  bodyLines: Line[];
  page: number;
}

interface Section {
  heading: string;
  page: number;
  subsections: SubSection[];
}

function splitIntoSubsections(lines: Line[], modalSize: number): SubSection[] {
  const subsections: SubSection[] = [];
  let current: SubSection | null = null;
  let i = 0;

  while (i < lines.length) {
    if (classifyTier(lines[i], modalSize) === 2) {
      const headerParts = [lines[i].text];
      const page = lines[i].page;
      let j = i + 1;
      while (j < lines.length && classifyTier(lines[j], modalSize) === 2) {
        headerParts.push(lines[j].text);
        j++;
      }
      current = { header: headerParts, bodyLines: [], page };
      subsections.push(current);
      i = j;
    } else {
      if (!current) {
        current = { header: null, bodyLines: [], page: lines[i].page };
        subsections.push(current);
      }
      current.bodyLines.push(lines[i]);
      i++;
    }
  }

  return subsections;
}

// Splits the document into leading lines (name/contact info — never
// reordered) and a sequence of sections, each split into sub-sections.
function detectStructure(
  lines: Line[],
): { leading: Line[]; sections: Section[]; modalSize: number } {
  // Rounding to a whole number here would collapse 10.1/10.2/10.4 all down
  // to "10", destroying exactly the small size difference tier-2 detection
  // depends on — round to 1 decimal instead.
  const modalSize = mode(lines.map((l) => Math.round(l.fontSize * 10) / 10));

  const leading: Line[] = [];
  const rawSections: { heading: string; page: number; lines: Line[] }[] = [];
  let current: { heading: string; page: number; lines: Line[] } | null = null;
  let sawFirstHeading = false;

  for (const line of lines) {
    // The very first heading-tier line is the person's name — often the
    // single largest text in the document, but it's a title, not a real
    // section — so it always belongs to `leading`, never starts a section.
    if (classifyTier(line, modalSize) === 1 && sawFirstHeading) {
      current = { heading: line.text, page: line.page, lines: [] };
      rawSections.push(current);
    } else if (current) {
      current.lines.push(line);
    } else {
      leading.push(line);
      if (classifyTier(line, modalSize) === 1) sawFirstHeading = true;
    }
  }

  const sections = rawSections.map((raw) => ({
    heading: raw.heading,
    page: raw.page,
    subsections: splitIntoSubsections(raw.lines, modalSize),
  }));

  return { leading, sections, modalSize };
}

const BULLET_MARKER = /^[•\-*]\s*/;

// A line whose text reaches at least this fraction of the widest line
// seen anywhere in the document is treated as having wrapped because it
// ran out of horizontal room, not because it was a genuinely complete,
// standalone line — a geometric fact about the page layout, calibrated
// against this specific document's own margins rather than an assumed
// page width, so it isn't tied to any one CV's format.
const WRAP_PROXIMITY_RATIO = 0.92;

// Joins lines into paragraphs using each line's right-edge proximity to
// the document's margin — pdf.js's hasEOL flag turned out to be an
// unreliable "hard break" signal on some PDF exporters (it can mark
// ordinary width-driven wraps the same as real paragraph breaks). Two
// independent short lines (e.g. a LinkedIn line and a GitHub line, each
// ending well short of the margin) stay separate; a line that runs close
// to the margin is joined with whatever follows it.
function joinRespectingHardBreaks(lines: Line[], marginRightEdge: number): string[] {
  const paragraphs: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const previousWrapped =
      i > 0 && lines[i - 1].rightEdge >= marginRightEdge * WRAP_PROXIMITY_RATIO;
    if (previousWrapped) {
      paragraphs[paragraphs.length - 1] += ' ' + lines[i].text;
    } else {
      paragraphs.push(lines[i].text);
    }
  }
  return paragraphs;
}

// Splits a sub-section's body into an (untouched) intro block before the
// first bullet, plus the bullets themselves — joining any wrapped
// continuation lines (no marker, following a bullet) into that bullet's
// text. A body with no bullet markers anywhere is one or more free-text
// paragraphs.
function splitBody(
  lines: Line[],
  marginRightEdge: number,
): { intro: string[]; bullets: string[] } | { freeText: string[] } {
  const firstBulletIdx = lines.findIndex((l) => BULLET_MARKER.test(l.text));

  if (firstBulletIdx === -1) {
    return { freeText: joinRespectingHardBreaks(lines, marginRightEdge) };
  }

  const introLines = lines.slice(0, firstBulletIdx);
  const bulletLines = lines.slice(firstBulletIdx);

  const bullets: string[] = [];
  for (const line of bulletLines) {
    if (BULLET_MARKER.test(line.text)) {
      bullets.push(line.text.replace(BULLET_MARKER, ''));
    } else {
      bullets[bullets.length - 1] += ' ' + line.text;
    }
  }

  return { intro: joinRespectingHardBreaks(introLines, marginRightEdge), bullets };
}

// Detects an inline delimiter-separated list disguised as a paragraph
// (e.g. Core Skills: "Skill A • Skill B • Skill C" wrapped across lines,
// not one bullet per line). Requires 3+ segments to avoid misreading an
// ordinary sentence that happens to contain the character once.
function tryParseInlineDelimitedList(text: string): string[] | null {
  if (!text.includes('•')) return null;
  const items = text.split('•').map((s) => s.trim()).filter(Boolean);
  return items.length >= 3 ? items : null;
}

// Detects a categorized/labelled list where EVERY bullet has the shape
// "Label: comma, separated, items" (e.g. Tools & Platforms) — must be
// consistent across all bullets, or it's treated as plain bullets instead.
function tryParseLabeledLists(
  bullets: string[],
): { label: string; items: string[] }[] | null {
  const parsed = bullets.map((bullet) => {
    const m = bullet.match(/^([^:]{1,60}):\s*(.+)$/);
    if (!m) return null;
    const items = m[2].split(',').map((s) => s.trim()).filter(Boolean);
    return items.length >= 2 ? { label: m[1].trim(), items } : null;
  });
  return parsed.every((p) => p !== null)
    ? (parsed as { label: string; items: string[] }[])
    : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing authorization header' }, 401);
  }

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

  const { job_id } = await req.json();
  if (!job_id) {
    return jsonResponse({ error: 'Missing job_id' }, 400);
  }

  const { data: job, error: jobError } = await supabaseUser
    .from('jobs')
    .select('description, job_title, employer, cv_document_id')
    .eq('id', job_id)
    .single();

  if (jobError || !job) {
    return jsonResponse({ error: 'Job not found' }, 404);
  }

  if (!job.description) {
    return jsonResponse(
      { error: 'This job has no description to optimize the CV against.' },
      400,
    );
  }

  if (!job.cv_document_id) {
    return jsonResponse(
      { error: 'Connect a CV to this job before optimizing it.' },
      400,
    );
  }

  const { data: cvDoc, error: cvError } = await supabaseUser
    .from('documents')
    .select('file_name, storage_path')
    .eq('id', job.cv_document_id)
    .single();

  if (cvError || !cvDoc) {
    return jsonResponse({ error: 'Connected CV document not found' }, 404);
  }

  if (!cvDoc.file_name.toLowerCase().endsWith('.pdf')) {
    return jsonResponse(
      { error: 'CV optimization currently requires a PDF CV.' },
      400,
    );
  }

  const { data: cvBlob, error: downloadError } = await supabaseUser.storage
    .from('documents')
    .download(cvDoc.storage_path);

  if (downloadError || !cvBlob) {
    return jsonResponse({ error: 'Failed to read the connected CV' }, 502);
  }

  let leading: Line[];
  let sections: Section[];
  let modalSize: number;
  let marginRightEdge: number;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(await cvBlob.arrayBuffer()));
    const { items } = await extractTextItems(pdf);
    const lines = items.flatMap((pageItems, page) => groupItemsIntoLines(pageItems, page));
    console.log(
      '[optimize-cv] raw line font data:',
      JSON.stringify(
        lines.map((l) => ({
          fontSize: Math.round(l.fontSize * 10) / 10,
          fontFamily: l.fontFamily,
          text: l.text.slice(0, 50),
        })),
      ),
    );
    marginRightEdge = Math.max(...lines.map((l) => l.rightEdge));
    ({ leading, sections, modalSize } = detectStructure(lines));
    console.log(
      '[optimize-cv] detected structure:',
      JSON.stringify(
        sections.map((s) => ({
          heading: s.heading,
          subsections: s.subsections.map((sub) => ({
            header: sub.header,
            bodyLines: sub.bodyLines.length,
          })),
        })),
      ),
    );
  } catch (err) {
    console.log('[optimize-cv] PDF structure extraction failed:', err);
    return jsonResponse({ error: 'Failed to read the connected CV' }, 502);
  }

  const jobContext =
    `Job title: ${job.job_title}\n` +
    `Employer: ${job.employer}\n\n` +
    `Job description:\n${job.description}`;

  // Generic building block: ask DeepSeek to reorder N labelled text items
  // by relevance to the job. Always returns a full permutation of
  // [0..items.length-1] — takes whatever usable indices the model gives
  // (deduped, in-range, in the order given), appending anything it missed
  // in original order, rather than discarding the whole result over one
  // flaw. Falls back to the original order entirely on any call failure.
  async function getRelevanceOrder(
    label: string,
    items: string[],
    guardChronological = false,
  ): Promise<number[]> {
    const itemCount = items.length;
    const fallback = items.map((_, idx) => idx);
    if (itemCount <= 1) return fallback;

    const chronologyGuard = guardChronological
      ? ' If these items are inherently sequential — each one anchored to ' +
        'a different employer, role, or time period, effectively a ' +
        'compressed timeline — leave them in their original order; only ' +
        'reorder when they are interchangeable statements about the same ' +
        'role or context.'
      : '';

    const systemPrompt =
      `You reorder ${label} from a CV/resume by relevance to a job ` +
      "description. Decide the order that surfaces what's most relevant " +
      'to the job first — a skill or requirement the job description ' +
      'explicitly asks for outranks one it lists as "nice to have"; ' +
      'content clearly related to the job but not literally named may ' +
      'still be prioritized at your judgement. Do not omit, duplicate, ' +
      'invent, or reword any item — only reorder.' +
      chronologyGuard +
      ` There are ${itemCount} items (numbered 0-${itemCount - 1}) and ` +
      `your "order" array must contain all ${itemCount} of them, each ` +
      'exactly once. Respond with ONLY a json object: {"order": [2, 0, 1]}.';

    const userPrompt =
      `${jobContext}\n\nItems:\n${items.map((text, j) => `${j}: ${text}`).join('\n')}`;

    await deepseekSemaphore.acquire();
    try {
      const deepseekResponse = await fetch(
        'https://api.deepseek.com/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${Deno.env.get('DEEPSEEK_API_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'deepseek-v4-pro',
            reasoning_effort: 'low',
            response_format: { type: 'json_object' },
            max_tokens: 8000,
            temperature: 0,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
          }),
          signal: AbortSignal.timeout(60000),
        },
      );

      if (!deepseekResponse.ok) {
        console.log(`[optimize-cv] DeepSeek call failed for ${label}:`, await deepseekResponse.text());
        return fallback;
      }

      const result = await deepseekResponse.json();
      const content = result.choices?.[0]?.message?.content;
      if (!content) {
        console.log(`[optimize-cv] no content for ${label}`);
        return fallback;
      }

      const proposed = JSON.parse(content).order;
      console.log(`[optimize-cv] ${label} proposed order:`, JSON.stringify(proposed));

      const seen = new Set<number>();
      const order: number[] = [];
      if (Array.isArray(proposed)) {
        for (const value of proposed) {
          if (
            Number.isInteger(value) &&
            value >= 0 &&
            value < itemCount &&
            !seen.has(value)
          ) {
            seen.add(value);
            order.push(value);
          }
        }
      }
      if (seen.size < itemCount) {
        console.log(
          `[optimize-cv] ${label}: model gave ${seen.size}/${itemCount} usable indices, appending the rest`,
        );
        for (let idx = 0; idx < itemCount; idx++) {
          if (!seen.has(idx)) order.push(idx);
        }
      }
      return order;
    } catch (err) {
      console.log(`[optimize-cv] DeepSeek call failed for ${label}:`, err);
      return fallback;
    } finally {
      deepseekSemaphore.release();
    }
  }

  // Reorders one sub-section's body according to its content shape, and
  // returns the final plain-text lines for that body (intro, if any,
  // followed by the — possibly reordered — bullets/items). A labelled
  // bullet's label is wrapped in "**...**" (mirroring the "## "/"### "
  // heading markers) so the PDF builder can render it bold, matching how
  // it looked in the source CV.
  async function reorderBody(label: string, bodyLines: Line[]): Promise<string[]> {
    const body = splitBody(bodyLines, marginRightEdge);

    if ('freeText' in body) {
      const result: string[] = [];
      for (const paragraph of body.freeText) {
        const inlineItems = tryParseInlineDelimitedList(paragraph);
        if (!inlineItems) {
          result.push(paragraph); // rule 3c — free text, untouched
          continue;
        }
        const order = await getRelevanceOrder(`${label} (inline list)`, inlineItems);
        result.push(order.map((idx) => inlineItems[idx]).join(' • '));
      }
      return result;
    }

    const { intro, bullets } = body;

    const labeledLists = tryParseLabeledLists(bullets);
    if (labeledLists) {
      // Two-level: which labelled bullet comes first, and which item
      // within each one comes first — all dispatched together.
      const [bulletOrder, ...itemOrders] = await Promise.all([
        getRelevanceOrder(
          `${label} (categories)`,
          labeledLists.map((l) => `${l.label}: ${l.items.join(', ')}`),
        ),
        ...labeledLists.map((l) => getRelevanceOrder(`${label} (${l.label} items)`, l.items)),
      ]);
      const reordered = bulletOrder.map((idx) => {
        const { label: bulletLabel, items } = labeledLists[idx];
        const orderedItems = itemOrders[idx].map((itemIdx) => items[itemIdx]);
        return `**${bulletLabel}:** ${orderedItems.join(', ')}`;
      });
      return [...intro, ...reordered.map((b) => `• ${b}`)];
    }

    const order = await getRelevanceOrder(label, bullets, /* guardChronological */ true);
    return [...intro, ...order.map((idx) => `• ${bullets[idx]}`)];
  }

  // Every sub-section across every section is dispatched together in one
  // batch — looping section-by-section with an `await` per section would
  // process sections one at a time, recreating the exact serialization
  // that caused the previous version's timeouts.
  const allSubsections = sections.flatMap((section) =>
    section.subsections.map((sub) => ({ section, sub })),
  );

  const results = await Promise.all(
    allSubsections.map(({ section, sub }) =>
      reorderBody(
        sub.header ? sub.header.join(' — ') : section.heading,
        sub.bodyLines,
      ),
    ),
  );

  const resultBySub = new Map<SubSection, string[]>();
  allSubsections.forEach(({ sub }, i) => resultBySub.set(sub, results[i]));

  // "\f" is a page-break marker the PDF builder honours — inserted
  // wherever the *original* document had a page boundary, even though it
  // was never a deliberate "hard" break, just where content happened to
  // run out of room. Section/sub-section order never changes (rule 4), so
  // walking them in this fixed order and comparing against the original
  // page number is coherent even though bullets within them get reordered.
  let lastPage = leading.length > 0 ? leading[leading.length - 1].page : 0;

  // The name/contact block is excluded from being treated as a "section"
  // (it's a title, not reorderable content), but it should still render
  // with whatever heading tier it actually detected as — otherwise the
  // name loses all visual prominence in the output.
  const parts: string[] = leading.map((l) => {
    const tier = classifyTier(l, modalSize);
    if (tier === 1) return `## ${l.text}`;
    if (tier === 2) return `### ${l.text}`;
    return l.text;
  });
  for (const section of sections) {
    if (section.page > lastPage) {
      parts.push('\f');
      lastPage = section.page;
    }
    parts.push('', `## ${section.heading}`);
    for (const sub of section.subsections) {
      if (sub.page > lastPage) {
        parts.push('\f');
        lastPage = sub.page;
      }
      if (sub.header) {
        for (const headerLine of sub.header) parts.push(`### ${headerLine}`);
      }
      parts.push(...(resultBySub.get(sub) ?? []));
    }
  }

  return jsonResponse({ optimized: parts.join('\n') }, 200);
});
