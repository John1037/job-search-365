// Generic, template-config-driven PDF renderer. Nothing in here is
// specific to one template's look — layout, colors, and photo handling
// all come from the `template`/`palette` arguments, so adding a new
// template (templates.js) shouldn't require touching this file.

const PAGE_MARGIN = 50;
const CONTENT_TOP = 56;
const SIDEBAR_WIDTH = 170;
const SIDEBAR_GUTTER = 26;

export async function imageUrlToDataUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to load image');
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Fonts beyond jsPDF's built-in Helvetica/Times/Courier have to be embedded
// as actual TTF data — fetched from /public (so they're a plain static
// asset, not bundled into the app's JS) and registered with this specific
// doc instance via addFileToVFS/addFont. Selectable per build (like the
// color palette), not baked into a template's config, so any template can
// use it. The user-facing font picker only ever sends a key from
// FONT_FAMILIES (or undefined/'helvetica' for the default) — never a raw
// font name — so there's no possibility of trying to fetch an arbitrary URL.
export const FONT_FAMILIES = {
  'pt-serif': {
    label: 'Serif',
    name: 'PTSerif',
    regularUrl: '/fonts/PTSerif-Regular.ttf',
    boldUrl: '/fonts/PTSerif-Bold.ttf',
  },
};

// Caches the base64-encoded font data (not the doc registration itself,
// which is per-jsPDF-instance and must be redone every render) so repeated
// Previews in the same session skip re-fetching and re-encoding the font.
const fontDataCache = new Map();

async function fetchFontBase64(url) {
  if (fontDataCache.has(url)) return fontDataCache.get(url);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load font: ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());

  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);
  fontDataCache.set(url, base64);
  return base64;
}

// Registers the requested font family's regular+bold weights with this doc
// instance and returns the font name to pass to doc.setFont() — falls back
// to 'helvetica' (jsPDF's built-in default, needs no registration) for an
// unrecognized or missing fontFamily.
async function registerFontFamily(doc, fontFamily) {
  const config = FONT_FAMILIES[fontFamily];
  if (!config) return 'helvetica';

  const [regularBase64, boldBase64] = await Promise.all([
    fetchFontBase64(config.regularUrl),
    fetchFontBase64(config.boldUrl),
  ]);

  doc.addFileToVFS(`${config.name}-Regular.ttf`, regularBase64);
  doc.addFont(`${config.name}-Regular.ttf`, config.name, 'normal');
  doc.addFileToVFS(`${config.name}-Bold.ttf`, boldBase64);
  doc.addFont(`${config.name}-Bold.ttf`, config.name, 'bold');

  return config.name;
}

function hexToRgb(hex) {
  const clean = (hex || '#000000').replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

// Linear-interpolates toward `target` by `amount` (0–1) — used to derive a
// pale/darker tint of the accent color for the sectionDivider glyph without
// needing per-palette pale/dark entries.
function mixRgb(rgb, target, amount) {
  return rgb.map((c, i) => Math.round(c + (target[i] - c) * amount));
}

// Single source of truth for contact field order and which ones are
// clickable — used by every rendering context (main header, header band,
// sidebar) so link behavior is identical everywhere instead of each context
// re-deriving it. Phone arrives already in international format
// ("+447123456789", build-cv) so it works directly as a tel: link.
function buildContactFields(cv) {
  const fields = [];
  if (cv.contact?.location) fields.push({ text: cv.contact.location, url: null, primary: false });
  if (cv.contact?.phone) {
    fields.push({
      text: cv.contact.phone,
      url: `tel:${cv.contact.phone.replace(/[^\d+]/g, '')}`,
      primary: true,
    });
  }
  if (cv.contact?.email) {
    fields.push({ text: cv.contact.email, url: `mailto:${cv.contact.email}`, primary: true });
  }
  // LinkedIn/GitHub/Portfolio/Website show as short labels here, not their
  // full URL — a raw URL inline among the other contact fields reads as
  // clutter; the full clickable URL still exists, in the CV's "Links"
  // section (see cvToPlainText/renderMainSection's 'links' handling).
  if (cv.contact?.linkedin_url) {
    fields.push({ text: 'LinkedIn', url: cv.contact.linkedin_url, primary: false });
  }
  if (cv.contact?.github_url) {
    fields.push({ text: 'GitHub', url: cv.contact.github_url, primary: false });
  }
  if (cv.contact?.portfolio_url) {
    fields.push({ text: 'Portfolio', url: cv.contact.portfolio_url, primary: false });
  }
  if (cv.contact?.website_url) {
    fields.push({ text: 'Website', url: cv.contact.website_url, primary: false });
  }
  return fields;
}

// A custom-section bullet line like "Automation & CRM: Zendesk, Freshdesk,
// Klaviyo" reads as a labeled sub-list — bold the label. Ported from the
// old server-side markup step now that rendering (and this decision) is
// a client-side concern.
function splitBoldLabel(line) {
  const match = line.match(/^([^:]{1,60}):\s*(.+,.+)$/);
  if (!match) return { label: null, rest: line };
  return { label: match[1].trim(), rest: match[2].trim() };
}

function computeZones(template, pageWidth) {
  if (template.layout === 'sidebar-left') {
    return {
      sidebar: {
        rectX: 0,
        rectWidth: SIDEBAR_WIDTH,
        x: 24,
        width: SIDEBAR_WIDTH - 24 - 16,
      },
      main: {
        x: SIDEBAR_WIDTH + SIDEBAR_GUTTER,
        width: pageWidth - SIDEBAR_WIDTH - SIDEBAR_GUTTER - PAGE_MARGIN,
      },
      fullWidthMain: { x: PAGE_MARGIN, width: pageWidth - PAGE_MARGIN * 2 },
    };
  }
  if (template.layout === 'sidebar-right') {
    return {
      sidebar: {
        rectX: pageWidth - SIDEBAR_WIDTH,
        rectWidth: SIDEBAR_WIDTH,
        x: pageWidth - SIDEBAR_WIDTH + 24,
        width: SIDEBAR_WIDTH - 24 - 16,
      },
      main: { x: PAGE_MARGIN, width: pageWidth - SIDEBAR_WIDTH - SIDEBAR_GUTTER - PAGE_MARGIN },
      fullWidthMain: { x: PAGE_MARGIN, width: pageWidth - PAGE_MARGIN * 2 },
    };
  }
  const full = { x: PAGE_MARGIN, width: pageWidth - PAGE_MARGIN * 2 };
  return { sidebar: null, main: full, fullWidthMain: full };
}

// Review-stage edits (removing the last skill, clearing a profile
// paragraph, etc.) can leave a section with a heading but no actual
// content — skip those rather than printing an empty heading.
export function hasSectionContent(section) {
  if (section.type === 'profile') return !!section.text?.trim();
  if (section.type === 'skills') return (section.items?.length ?? 0) > 0;
  if (section.type === 'education') return (section.groups?.length ?? 0) > 0;
  if (
    section.type === 'experience' ||
    section.type === 'certification' ||
    section.type === 'earlier_experience'
  ) {
    return (section.entries?.length ?? 0) > 0;
  }
  if (section.type === 'custom') return !!section.content?.trim();
  if (section.type === 'links') return (section.items?.length ?? 0) > 0;
  return true;
}

// A plain-text rendering of the same structured content, for the .txt
// copy saved alongside the PDF — no template/layout concerns, just the
// content in reading order.
export function cvToPlainText(cv) {
  const lines = [];

  if (cv.name) lines.push(cv.name);
  const contactLine = buildContactFields(cv)
    .map((f) => f.text)
    .join(' | ');
  if (contactLine) lines.push(contactLine);

  for (const section of cv.sections.filter(hasSectionContent)) {
    lines.push('', section.heading.toUpperCase());

    if (section.type === 'profile' || section.type === 'custom') {
      if (section.intro?.trim()) lines.push(section.intro.trim());
      if (section.type === 'custom' && section.format === 'bullets') {
        for (const line of section.content.split('\n')) {
          if (line.trim()) lines.push(`• ${line.trim()}`);
        }
      } else {
        lines.push(section.type === 'profile' ? section.text : section.content);
      }
    } else if (section.type === 'skills') {
      lines.push(section.items.join(' • '));
    } else if (section.type === 'experience') {
      for (const entry of section.entries) {
        lines.push(`${entry.title} — ${entry.employer} | ${entry.date_range}`);
        if (entry.location) lines.push(entry.location);
        for (const bullet of entry.bullets) lines.push(`• ${bullet}`);
      }
    } else if (section.type === 'earlier_experience') {
      for (const entry of section.entries) {
        lines.push(`• ${entry.employer} - ${entry.title}: ${entry.summary}`);
      }
    } else if (section.type === 'education') {
      for (const group of section.groups) {
        for (const subgroup of group.subgroups) {
          lines.push(subgroup.header);
          for (const qual of subgroup.qualifications) {
            if (qual.detail) lines.push(qual.detail);
            for (const item of qual.items) lines.push(`• ${item}`);
          }
        }
      }
    } else if (section.type === 'certification') {
      for (const entry of section.entries) {
        lines.push(
          entry.date_range
            ? `${entry.title} — ${entry.institution} | ${entry.date_range}`
            : `${entry.title} — ${entry.institution}`,
        );
        for (const item of entry.items) lines.push(`• ${item}`);
      }
    } else if (section.type === 'links') {
      for (const item of section.items) lines.push(`${item.label}: ${item.url}`);
    }
  }

  return lines.join('\n');
}

export async function renderCvPdf(cv, template, paletteIndex, photoDataUrl, fontFamily) {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const fontName = await registerFontFamily(doc, fontFamily);
  const palette = template.palettes[paletteIndex] ?? template.palettes[0];
  const accentRgb = hexToRgb(palette.accent);
  const sidebarBgRgb = hexToRgb(palette.sidebarBg || '#f4f6f8');
  const textRgb = [31, 35, 40];
  const whiteRgb = [255, 255, 255];
  // Phone/email need to stand out over location/links in the contact line —
  // color contrast instead of bold, since it's cheap (no new size/leading
  // math) and reads as hierarchy rather than emphasis-shouting. Secondary
  // fields are muted toward whatever they sit on: faded gray on a plain
  // background, faded toward the accent itself on the colored header band
  // (its background IS the accent, so a literal accent-colored fill on white
  // wouldn't apply there).
  const contactMutedRgb = mixRgb(textRgb, [255, 255, 255], 0.45);
  const contactBandMutedRgb = mixRgb(whiteRgb, accentRgb, 0.35);

  // `density: 'compact'` scales every font size/line-height/spacing gap
  // by one factor, computed once here — everything below reads from
  // STYLE/the *_GAP constants rather than hardcoding sizes, so a new
  // density-aware template needs nothing beyond this config flag.
  const scale = template.density === 'compact' ? 0.86 : 1;
  const STYLE = {
    name: { size: 19 * scale, bold: true, lineHeight: 24 * scale, color: accentRgb },
    contact: { size: 9 * scale, lineHeight: 13 * scale },
    sectionHeading: { size: 12 * scale, bold: true, lineHeight: 18 * scale, color: accentRgb },
    body: { size: 10.5 * scale, lineHeight: 15 * scale, color: textRgb },
    subHeading: { size: 10.5 * scale, bold: true, lineHeight: 15 * scale, color: textRgb },
    meta: { size: 9.5 * scale, lineHeight: 13 * scale, color: textRgb },
    bullet: { size: 10 * scale, lineHeight: 14 * scale, color: textRgb },
    sidebarHeading: { size: 10.5 * scale, lineHeight: 14 * scale },
    sidebarBody: { size: 9.5 * scale, lineHeight: 13 * scale },
  };

  // Spacing hierarchy, per explicit request: a section heading sits close
  // to its own content (HEADING_GAP), but a clear, larger gap separates
  // one section's end from the next section's heading (SECTION_GAP) —
  // ENTRY_GAP (between e.g. two roles within Experience) sits between the
  // two, so the visual grouping reads correctly at every level. Declared up
  // here (rather than nearer where most of these are used, further down)
  // so runSidebarPass — which runs its dry-run sizing pass before the main
  // column's own layout constants would otherwise be declared — can use
  // SECTION_GAP too, keeping the sidebar photo's spacing consistent with
  // the main column's name-to-heading spacing instead of a separate
  // hardcoded number that only coincidentally matched it.
  const SECTION_GAP = 16 * scale;
  const HEADING_GAP = 3 * scale;
  const ENTRY_GAP = 10 * scale;

  // doc.text() positions the name by its BASELINE (contentTop), not the
  // top of the letters — anything meant to align with the top of the name
  // text needs to sit roughly baseline minus cap-height above it (Helvetica's
  // cap-height is ~0.72 of its font size), not at the baseline itself.
  const nameCapHeight = STYLE.name.size * 0.72;

  // `boldSections` templates draw a solid accent-colored bar behind each
  // section heading (white text on top) instead of plain colored text —
  // the "color block" element of the bold-design direction. `sectionDivider`
  // is the lighter alternative: a thin accent-colored rule directly below
  // the heading (no added gap beyond the heading's own line-height, which
  // already carries enough leading to clear it) plus a decorative accent
  // circle above the rule, right-aligned and sized to the heading's own
  // cap-height. A template uses at most one of the two (boldSections takes
  // precedence if both were ever set) since a bar already reads as its own
  // separator.
  const sectionHeadingCapHeight = STYLE.sectionHeading.size * 0.72;
  const SECTION_BAR_PADDING = 6 * scale;

  // The gap after a drawn GRAPHIC (bar/divider line) needs to clear the
  // NEXT text's own cap-height, not just be "a small gap" — that next
  // text is drawn with mainY as its baseline, and its ascent reaches
  // upward from there. HEADING_GAP alone (used for text-to-text spacing,
  // where the previous line's lineHeight already reserved that room) is
  // nowhere near enough here, since nothing has reserved space for the
  // next baseline-drawn text's ascent. On top of that clearance, this also
  // carries the deliberate breathing room a bar/divider wants below it
  // before section content starts.
  const SECTION_BAR_BOTTOM_GAP = STYLE.subHeading.size * 0.72 + 10 * scale;

  // sectionDivider's rule sits just under the heading TEXT, not under the
  // heading's full lineHeight box (which carries far more leading than the
  // few px of clearance a rule actually needs past the text's descenders).
  // drawSectionHeading positions the rule relative to the heading's own
  // baseline instead of wherever drawWrapped's lineHeight advance leaves
  // mainY — these two constants describe that tight offset.
  const SECTION_DIVIDER_DESCENDER_ALLOWANCE = STYLE.sectionHeading.size * 0.25;
  const SECTION_DIVIDER_LINE_GAP = 3 * scale;

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const zones = computeZones(template, pageWidth);
  const hasSidebar = !!zones.sidebar;
  let mainZone = hasSidebar ? zones.main : zones.fullWidthMain;

  const contactFieldsForLinks = buildContactFields(cv);

  // Draws `fields` (see buildContactFields) left-to-right separated by
  // " | ", wrapping to additional lines within `width`, and adds a
  // clickable doc.link() region over any field that has a url — the one
  // shared primitive every contact-line context (main header, header band,
  // sidebar) draws through, so links behave identically everywhere instead
  // of each context reimplementing its own text-wrapping. Never splits an
  // individual field's text mid-word (unlike wrapping the whole joined
  // string would), and returns the y just below the last line drawn.
  const CONTACT_SEP = '   |   ';
  function drawContactLine(fields, x, y, width, size, lineHeight, color, primaryColor = color) {
    doc.setFont(fontName, 'normal');
    doc.setFontSize(size);
    const sepWidth = doc.getTextWidth(CONTACT_SEP);

    let cx = x;
    let cy = y;
    let firstOnLine = true;

    for (const field of fields) {
      const fieldWidth = doc.getTextWidth(field.text);
      const pieceWidth = (firstOnLine ? 0 : sepWidth) + fieldWidth;

      if (!firstOnLine && cx + pieceWidth > x + width) {
        cy += lineHeight;
        cx = x;
        firstOnLine = true;
      }

      if (!firstOnLine) {
        doc.setTextColor(...color);
        doc.text(CONTACT_SEP, cx, cy);
        cx += sepWidth;
      }

      doc.setTextColor(...(field.primary ? primaryColor : color));
      doc.text(field.text, cx, cy);
      if (field.url) {
        doc.link(cx, cy - size * 0.78, fieldWidth, size * 1.05, { url: field.url });
      }
      cx += fieldWidth;
      firstOnLine = false;
    }

    return cy + lineHeight;
  }

  // Measurement twin of drawContactLine's wrapping decisions — same
  // algorithm, no drawing, used to size the header band before committing
  // to drawing anything (the band's height depends on the contact line's
  // wrapped line count).
  function measureContactLineCount(fields, width, size) {
    if (fields.length === 0) return 0;
    doc.setFont(fontName, 'normal');
    doc.setFontSize(size);
    const sepWidth = doc.getTextWidth(CONTACT_SEP);

    let cx = 0;
    let lines = 1;
    let firstOnLine = true;
    for (const field of fields) {
      const fieldWidth = doc.getTextWidth(field.text);
      const pieceWidth = (firstOnLine ? 0 : sepWidth) + fieldWidth;
      if (!firstOnLine && cx + pieceWidth > width) {
        lines++;
        cx = 0;
        firstOnLine = true;
      }
      if (!firstOnLine) cx += sepWidth;
      cx += fieldWidth;
      firstOnLine = false;
    }
    return lines;
  }

  // A colored banner behind the name/contact — page 1 only, same as the
  // sidebar band, so it doesn't repeat awkwardly on later pages. Height
  // adapts to how many lines the contact details actually wrap to (long
  // combinations of location/phone/email/LinkedIn/GitHub easily exceed
  // one line) rather than a fixed guess that could run text off the page.
  const HEADER_BAND_CONTACT_START_Y = 50;

  const headerBandContactLineCount = template.headerBand
    ? measureContactLineCount(contactFieldsForLinks, mainZone.width, STYLE.contact.size)
    : 0;
  const headerBandHeight = template.headerBand
    ? HEADER_BAND_CONTACT_START_Y + headerBandContactLineCount * STYLE.contact.lineHeight + 12
    : 0;
  const contentTop = headerBandHeight > 0 ? headerBandHeight + 20 : CONTENT_TOP;

  const contentSections = cv.sections.filter(hasSectionContent);
  const sidebarTypes = new Set(template.sidebarSectionTypes || []);
  const sidebarSections = hasSidebar
    ? contentSections.filter((s) => sidebarTypes.has(s.type))
    : [];
  const mainSections = hasSidebar
    ? contentSections.filter((s) => !sidebarTypes.has(s.type))
    : contentSections;

  const photoSize = 64;
  const photoInSidebar = !!(photoDataUrl && template.supportsPhoto && hasSidebar);

  function drawSidebarBand(pageNum) {
    const topY = pageNum === 1 ? headerBandHeight : 0;
    doc.setFillColor(...sidebarBgRgb);
    doc.rect(zones.sidebar.rectX, topY, zones.sidebar.rectWidth, pageHeight - topY, 'F');
  }

  // The sidebar is rendered as its own paginated flow, independent of the
  // main column's page breaks — a long skills/education/certification list
  // can run onto page 2+ instead of being clipped to page 1. Run once as a
  // dry pass (draw=false) purely to count how many pages the sidebar needs
  // BEFORE main content is laid out, so breakPage() below can decide per
  // page whether the main column should stay narrow (still within the
  // sidebar's range) or go full-width (past it). Run again for real
  // (draw=true) AFTER the main column is fully drawn, reusing whichever
  // pages main already created via doc.setPage() and only appending new
  // ones (doc.addPage()) if the sidebar outlasts the main column — doing
  // this the other way around would have the sidebar pass create pages
  // that main's own breakPage() would then duplicate instead of reusing.
  function runSidebarPass(draw) {
    let page = 1;
    // Matching the main column's name-to-heading gap takes more than just
    // SECTION_GAP: a line of text carries built-in whitespace below its own
    // glyphs (line-height minus cap-height), which the main column gets for
    // free after the name — a hard-edged photo has none of that, so it
    // needs that same leftover leading added explicitly to look equal
    // rather than visibly smaller.
    const nameTrailingLeading = STYLE.name.lineHeight - nameCapHeight;
    let y = photoInSidebar
      ? contentTop - nameCapHeight + photoSize + nameTrailingLeading + SECTION_GAP
      : contentTop;

    if (draw) doc.setPage(1);

    function ensureRoom(height) {
      if (y + height > pageHeight - PAGE_MARGIN) {
        page += 1;
        y = CONTENT_TOP;
        if (draw) {
          if (page > doc.getNumberOfPages()) doc.addPage();
          doc.setPage(page);
          drawSidebarBand(page);
        }
      }
    }

    // Sidebar heading color: the same accent used for main-column headings
    // (not the sidebar's body-text color) — requested explicitly so heading
    // color reads consistently across the whole page, not just the main
    // column.
    function heading(text) {
      doc.setFont(fontName, 'bold');
      doc.setFontSize(STYLE.sidebarHeading.size);
      const lines = doc.splitTextToSize(text.toUpperCase(), zones.sidebar.width);
      const blockHeight = lines.length * STYLE.sidebarHeading.lineHeight;
      ensureRoom(blockHeight);
      if (draw) {
        doc.setTextColor(...accentRgb);
        let ty = y;
        for (const line of lines) {
          doc.text(line, zones.sidebar.x, ty);
          ty += STYLE.sidebarHeading.lineHeight;
        }
      }
      y += blockHeight + 2 * scale;
    }

    // `url`, when given, makes every wrapped line of this field clickable
    // (a long email/URL wrapping to 2 lines in the narrow sidebar should
    // still be clickable across both, not just the first). `marker`, when
    // true, draws a small accent-colored square before the FIRST line only
    // (never a wrapped continuation) — the sidebar-only reinforcement for
    // phone/email, since accent text color alone doesn't read as distinct
    // from body text on darker palettes (Charcoal/Ink) where the two are
    // close in value. Same square-marker convention as coloredBullets
    // (drawBulletPrefix above), sized down for the smaller sidebar body text.
    function bodyLine(text, color, url, marker) {
      doc.setFont(fontName, 'normal');
      doc.setFontSize(STYLE.sidebarBody.size);
      const markerSize = STYLE.sidebarBody.size * 0.45;
      const markerGap = STYLE.sidebarBody.size * 0.5;
      const indent = marker ? markerSize + markerGap : 0;
      const lines = doc.splitTextToSize(text, zones.sidebar.width - indent);
      let firstLine = true;
      for (const line of lines) {
        ensureRoom(STYLE.sidebarBody.lineHeight);
        if (draw) {
          doc.setTextColor(...color);
          doc.text(line, zones.sidebar.x + indent, y);
          if (marker && firstLine) {
            doc.setFillColor(...accentRgb);
            doc.rect(zones.sidebar.x, y - markerSize - 1.5 * scale, markerSize, markerSize, 'F');
          }
          if (url) {
            const lineWidth = doc.getTextWidth(line);
            doc.link(
              zones.sidebar.x + indent,
              y - STYLE.sidebarBody.size * 0.78,
              lineWidth,
              STYLE.sidebarBody.size * 1.05,
              { url },
            );
          }
        }
        y += STYLE.sidebarBody.lineHeight;
        firstLine = false;
      }
    }

    // Like bodyLine, but bold — for a label that reads as part of the body
    // text (e.g. education's qualification-level grouping) rather than a
    // section heading, so it keeps the body's case and color instead of
    // heading()'s uppercased, accent-colored treatment.
    function boldLine(text, color) {
      doc.setFont(fontName, 'bold');
      doc.setFontSize(STYLE.sidebarBody.size);
      const lines = doc.splitTextToSize(text, zones.sidebar.width);
      for (const line of lines) {
        ensureRoom(STYLE.sidebarBody.lineHeight);
        if (draw) {
          doc.setTextColor(...color);
          doc.text(line, zones.sidebar.x, y);
        }
        y += STYLE.sidebarBody.lineHeight;
      }
    }

    const bodyColor = palette.sidebarText ? hexToRgb(palette.sidebarText) : textRgb;

    // Contact details live in the sidebar for this layout, not the main
    // header. Header-band templates don't currently combine with a
    // sidebar, but if one did, contact would already be in the band instead.
    if (headerBandHeight === 0) {
      const fields = buildContactFields(cv);
      if (fields.length > 0) {
        y += 4 * scale;
        heading('Contact');
        for (const field of fields) {
          bodyLine(field.text, field.primary ? accentRgb : bodyColor, field.url, field.primary);
        }
        y += 8 * scale;
      }
    }

    for (const section of sidebarSections) {
      y += 4 * scale;
      heading(section.heading);
      if (section.type === 'skills') {
        for (const item of section.items) bodyLine(item, bodyColor);
      } else if (section.type === 'education') {
        for (const group of section.groups) {
          for (const subgroup of group.subgroups) {
            boldLine(subgroup.header, bodyColor);
            for (const qual of subgroup.qualifications) {
              if (qual.detail) bodyLine(qual.detail, bodyColor);
            }
          }
          y += 4 * scale;
        }
      } else if (section.type === 'certification') {
        for (const entry of section.entries) {
          const entryHeading = entry.date_range
            ? `${entry.title}, ${entry.institution} (${entry.date_range})`
            : `${entry.title}, ${entry.institution}`;
          bodyLine(entryHeading, bodyColor);
          y += 4 * scale;
        }
      }
      y += 8 * scale;
    }

    return page;
  }

  const sidebarPageCount = hasSidebar ? runSidebarPass(false) : 0;

  let mainY = contentTop;
  let currentPageNum = 1;

  function breakPage() {
    doc.addPage();
    currentPageNum += 1;
    mainY = CONTENT_TOP;
    // Stay in the narrow main column while the sidebar is still running
    // down this page range; once past it, use the full page width.
    mainZone = currentPageNum <= sidebarPageCount ? zones.main : zones.fullWidthMain;
  }

  // Per-line safety net used while actually drawing — only fires if a
  // single block (already cleared by ensureAtomicRoom below) still turns
  // out taller than one whole page, which ensureAtomicRoom alone can't
  // prevent.
  function ensureMainRoom(height) {
    if (mainY > pageHeight - PAGE_MARGIN - height) breakPage();
  }

  // Called BEFORE starting to draw a section/sub-section, with that whole
  // block's pre-measured height — forces the break to land before the
  // heading rather than letting per-line checks split the block wherever
  // it happens to run out of room.
  function ensureAtomicRoom(height) {
    if (mainY + height > pageHeight - PAGE_MARGIN) breakPage();
  }

  // `mainY` (closure variable, not a threaded/returned parameter) is the
  // single source of truth for the current draw position in the main
  // column. Every one of these functions reads and advances it directly,
  // and ensureMainRoom() — which can reset it to CONTENT_TOP on a new
  // page — is always operating on that same variable, never a stale local
  // copy. (An earlier version threaded a local `y` parameter through
  // these calls instead, which desynced from `mainY`: ensureMainRoom was
  // checking/resetting `mainY` while drawing kept using the separate,
  // never-reset local `y` — content would run straight off the bottom of
  // the page since the page-break check was working off stale data.)
  function drawWrapped(text, { size, bold, color, lineHeight, width }) {
    doc.setFont(fontName, bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    // `width` lets the header override the wrap width to leave room for a
    // header-corner photo — safe to snapshot here since the header is the
    // very first thing drawn, before any page break could occur.
    const lines = doc.splitTextToSize(text, width ?? mainZone.width);
    for (const line of lines) {
      ensureMainRoom(lineHeight);
      doc.setTextColor(...color);
      doc.text(line, mainZone.x, mainY);
      mainY += lineHeight;
    }
  }

  // `coloredBullets` templates ("lean into bold design") replace the plain
  // "•" character with a small filled accent-colored square, drawn as its
  // own shape rather than as text — the decorative-icon element of that
  // design direction, applied everywhere a bullet appears (experience,
  // education/certification items, earlier-career, custom sections) since
  // they all go through this one pair of functions.
  const BULLET_MARKER_SIZE = 4.5 * scale;

  function getBulletPrefixWidth() {
    // Caller has already set the body font/size before calling this —
    // needed for the plain "•  " text-width measurement.
    return template.coloredBullets
      ? BULLET_MARKER_SIZE + 8 * scale
      : doc.getTextWidth('•  ');
  }

  function drawBulletPrefix(y) {
    if (template.coloredBullets) {
      doc.setFillColor(...accentRgb);
      doc.rect(mainZone.x, y - BULLET_MARKER_SIZE - 1.5 * scale, BULLET_MARKER_SIZE, BULLET_MARKER_SIZE, 'F');
    } else {
      doc.text('•  ', mainZone.x, y);
    }
  }

  function drawBulletLine(label, rest, { size, color, lineHeight }) {
    doc.setFontSize(size);
    doc.setFont(fontName, 'normal');
    const bulletWidth = getBulletPrefixWidth();
    const innerWidth = mainZone.width - bulletWidth;

    if (!label) {
      const lines = doc.splitTextToSize(rest, innerWidth);
      lines.forEach((line, i) => {
        ensureMainRoom(lineHeight);
        doc.setTextColor(...color);
        if (i === 0) drawBulletPrefix(mainY);
        doc.text(line, mainZone.x + bulletWidth, mainY);
        mainY += lineHeight;
      });
      return;
    }

    doc.setFont(fontName, 'bold');
    const labelWithColon = `${label}: `;
    const labelWidth = doc.getTextWidth(labelWithColon);
    doc.setFont(fontName, 'normal');
    const restWidth = doc.getTextWidth(rest);

    ensureMainRoom(lineHeight);
    doc.setTextColor(...color);
    drawBulletPrefix(mainY);
    doc.setFont(fontName, 'bold');
    doc.text(labelWithColon, mainZone.x + bulletWidth, mainY);
    doc.setFont(fontName, 'normal');

    if (bulletWidth + labelWidth + restWidth <= mainZone.width) {
      doc.text(rest, mainZone.x + bulletWidth + labelWidth, mainY);
      mainY += lineHeight;
      return;
    }

    mainY += lineHeight;
    const wrapped = doc.splitTextToSize(rest, innerWidth);
    for (const line of wrapped) {
      ensureMainRoom(lineHeight);
      doc.setTextColor(...color);
      doc.text(line, mainZone.x + bulletWidth, mainY);
      mainY += lineHeight;
    }
  }

  // The "Links" section's entries — same bold-label-plus-bullet layout as
  // drawBulletLine, but the "rest" is a URL that needs its own doc.link()
  // overlay rather than being plain text (this is the one place the full
  // URL is shown, since the contact line above uses short labels instead).
  function drawLinksEntry({ label, url }, { size, color, lineHeight }) {
    doc.setFontSize(size);
    doc.setFont(fontName, 'normal');
    const bulletWidth = getBulletPrefixWidth();
    const innerWidth = mainZone.width - bulletWidth;

    doc.setFont(fontName, 'bold');
    const labelWithColon = `${label}: `;
    const labelWidth = doc.getTextWidth(labelWithColon);
    doc.setFont(fontName, 'normal');
    const urlWidth = doc.getTextWidth(url);

    ensureMainRoom(lineHeight);
    doc.setTextColor(...color);
    drawBulletPrefix(mainY);
    doc.setFont(fontName, 'bold');
    doc.text(labelWithColon, mainZone.x + bulletWidth, mainY);
    doc.setFont(fontName, 'normal');

    if (bulletWidth + labelWidth + urlWidth <= mainZone.width) {
      const ux = mainZone.x + bulletWidth + labelWidth;
      doc.text(url, ux, mainY);
      doc.link(ux, mainY - size * 0.78, urlWidth, size * 1.05, { url });
      mainY += lineHeight;
      return;
    }

    mainY += lineHeight;
    const wrapped = doc.splitTextToSize(url, innerWidth);
    for (const line of wrapped) {
      ensureMainRoom(lineHeight);
      doc.setTextColor(...color);
      doc.text(line, mainZone.x + bulletWidth, mainY);
      const lineWidth = doc.getTextWidth(line);
      doc.link(mainZone.x + bulletWidth, mainY - size * 0.78, lineWidth, size * 1.05, { url });
      mainY += lineHeight;
    }
  }

  // Measurement twins of drawWrapped/drawBulletLine — same wrapping logic,
  // no drawing, used to size a section/sub-section *before* committing to
  // drawing it so ensureAtomicRoom can break the page ahead of a heading
  // instead of wherever per-line drawing happens to run out of room.
  function measureWrappedHeight(text, { size, bold, lineHeight, width }) {
    doc.setFont(fontName, bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, width ?? mainZone.width);
    return lines.length * lineHeight;
  }

  function measureBulletHeight(label, rest, { size, lineHeight }) {
    doc.setFontSize(size);
    doc.setFont(fontName, 'normal');
    const bulletWidth = getBulletPrefixWidth();
    const innerWidth = mainZone.width - bulletWidth;

    if (!label) {
      const lines = doc.splitTextToSize(rest, innerWidth);
      return lines.length * lineHeight;
    }

    doc.setFont(fontName, 'bold');
    const labelWidth = doc.getTextWidth(`${label}: `);
    doc.setFont(fontName, 'normal');
    const restWidth = doc.getTextWidth(rest);

    if (bulletWidth + labelWidth + restWidth <= mainZone.width) return lineHeight;

    const wrapped = doc.splitTextToSize(rest, innerWidth);
    return lineHeight + wrapped.length * lineHeight;
  }

  function measureSectionHeadingHeight(heading) {
    if (template.boldSections) {
      const descenderAllowance = STYLE.sectionHeading.size * 0.25;
      return (
        sectionHeadingCapHeight +
        SECTION_BAR_PADDING * 2 +
        descenderAllowance +
        SECTION_BAR_BOTTOM_GAP
      );
    }
    let h = measureWrappedHeight(heading.toUpperCase(), STYLE.sectionHeading);
    if (template.sectionDivider) {
      // The rule is drawn a few px past the LAST line's own descenders, not
      // after its full lineHeight advance — so only that final line's excess
      // leading (lineHeight minus what the tight offset actually uses) gets
      // subtracted back out here; drawSectionHeading must mirror this exactly.
      h -=
        STYLE.sectionHeading.lineHeight -
        (SECTION_DIVIDER_DESCENDER_ALLOWANCE + SECTION_DIVIDER_LINE_GAP);
      h += SECTION_BAR_BOTTOM_GAP;
    } else {
      h += HEADING_GAP;
    }
    return h;
  }

  function drawSectionHeading(text) {
    if (template.boldSections) {
      const descenderAllowance = STYLE.sectionHeading.size * 0.25;
      const barHeight = sectionHeadingCapHeight + SECTION_BAR_PADDING * 2 + descenderAllowance;
      const barTop = mainY;
      doc.setFillColor(...accentRgb);
      doc.rect(mainZone.x, barTop, mainZone.width, barHeight, 'F');
      doc.setFont(fontName, 'bold');
      doc.setFontSize(STYLE.sectionHeading.size);
      doc.setTextColor(...whiteRgb);
      doc.text(
        text.toUpperCase(),
        mainZone.x + SECTION_BAR_PADDING + 4,
        barTop + SECTION_BAR_PADDING + sectionHeadingCapHeight,
      );
      mainY = barTop + barHeight + SECTION_BAR_BOTTOM_GAP;
      return;
    }

    // Heading's own baseline, captured before drawWrapped advances mainY —
    // needed below to find the top of the heading's cap-height for the
    // sectionDivider glyph, regardless of how many lines the heading wraps to.
    const headingBaselineY = mainY;

    drawWrapped(text.toUpperCase(), STYLE.sectionHeading);

    if (template.sectionDivider) {
      // mainY is currently the last heading line's baseline PLUS a full
      // lineHeight advance (drawWrapped's normal per-line step). Rewind past
      // that leading to sit the rule just a few px below the text's own
      // descenders instead — mirrors the subtraction in
      // measureSectionHeadingHeight exactly.
      const lineY =
        mainY -
        STYLE.sectionHeading.lineHeight +
        SECTION_DIVIDER_DESCENDER_ALLOWANCE +
        SECTION_DIVIDER_LINE_GAP;

      // Decorative accent glyph — two overlapping squares (a common "modern
      // geometric mark" motif) instead of a single dot/diamond. The upper
      // square is flush with the bar's right end, its top edge at the
      // heading's own cap-height top; the lower square sits half a
      // side-length down-and-LEFT of it (so its own bottom edge touches the
      // bar), overlapping the upper square by half its area. Three flat
      // fills (no alpha) give three tones: pale where only the upper square
      // shows, a tone between pale and full accent where only the lower
      // square shows, and the palette's own accent — full saturation —
      // exactly in the overlap, painted last so it isn't covered by either.
      const headingTop = headingBaselineY - sectionHeadingCapHeight;
      const glyphSpan = lineY - headingTop;
      const side = glyphSpan / 1.5;
      const half = side / 2;
      const rightEdge = mainZone.x + mainZone.width;
      const paleRgb = mixRgb(accentRgb, [255, 255, 255], 0.6);
      const midRgb = mixRgb(accentRgb, [255, 255, 255], 0.3);

      doc.setFillColor(...paleRgb);
      doc.rect(rightEdge - side, headingTop, side, side, 'F');
      doc.setFillColor(...midRgb);
      doc.rect(rightEdge - side - half, lineY - side, side, side, 'F');
      doc.setFillColor(...accentRgb);
      doc.rect(rightEdge - side, lineY - side, half, half, 'F');

      doc.setDrawColor(...accentRgb);
      doc.setLineWidth(1.5);
      doc.line(mainZone.x, lineY, mainZone.x + mainZone.width, lineY);
      mainY = lineY + SECTION_BAR_BOTTOM_GAP;
    } else {
      mainY += HEADING_GAP;
    }
  }

  function measureExperienceEntryHeight(entry) {
    let h = measureWrappedHeight(
      `${entry.title} — ${entry.employer} | ${entry.date_range}`,
      STYLE.subHeading,
    );
    if (entry.location) {
      h += measureWrappedHeight(entry.location, STYLE.meta);
    }
    for (const bullet of entry.bullets) {
      const { label, rest } = splitBoldLabel(bullet);
      h += measureBulletHeight(label, rest, STYLE.bullet);
    }
    return h;
  }

  function drawExperienceEntry(entry) {
    drawWrapped(`${entry.title} — ${entry.employer} | ${entry.date_range}`, STYLE.subHeading);
    if (entry.location) {
      drawWrapped(entry.location, STYLE.meta);
    }
    for (const bullet of entry.bullets) {
      const { label, rest } = splitBoldLabel(bullet);
      drawBulletLine(label, rest, STYLE.bullet);
    }
  }

  // Education is grouped two deep: an establishment+year sub-subsection —
  // headed by one line combining level, establishment and year (bold,
  // subheading weight) — then a plain subject/grade detail line per
  // qualification from that sitting, with its bulleted notes beneath.
  // Sub-subsections are drawn back-to-back with no extra gap within the
  // same level; ENTRY_GAP only applies between different levels (the outer
  // `group`, kept in the data purely to drive that spacing), handled by
  // the caller.
  function measureEducationQualificationHeight(qual) {
    let h = qual.detail ? measureWrappedHeight(qual.detail, STYLE.meta) : 0;
    for (const item of qual.items) {
      const { label, rest } = splitBoldLabel(item);
      h += measureBulletHeight(label, rest, STYLE.bullet);
    }
    return h;
  }

  function drawEducationQualification(qual) {
    if (qual.detail) drawWrapped(qual.detail, STYLE.meta);
    for (const item of qual.items) {
      const { label, rest } = splitBoldLabel(item);
      drawBulletLine(label, rest, STYLE.bullet);
    }
  }

  function measureEducationSubgroupHeight(subgroup) {
    let h = measureWrappedHeight(subgroup.header, STYLE.subHeading);
    for (const qual of subgroup.qualifications) {
      h += measureEducationQualificationHeight(qual);
    }
    return h;
  }

  function drawEducationSubgroup(subgroup) {
    drawWrapped(subgroup.header, STYLE.subHeading);
    for (const qual of subgroup.qualifications) {
      drawEducationQualification(qual);
    }
  }

  function measureEducationGroupHeight(group) {
    let h = 0;
    for (const subgroup of group.subgroups) {
      h += measureEducationSubgroupHeight(subgroup);
    }
    return h;
  }

  function drawEducationGroup(group) {
    for (const subgroup of group.subgroups) {
      drawEducationSubgroup(subgroup);
    }
  }

  function measureCertificationEntryHeight(entry) {
    const heading = entry.date_range
      ? `${entry.title} — ${entry.institution} | ${entry.date_range}`
      : `${entry.title} — ${entry.institution}`;
    let h = measureWrappedHeight(heading, STYLE.subHeading);
    for (const item of entry.items) {
      const { label, rest } = splitBoldLabel(item);
      h += measureBulletHeight(label, rest, STYLE.bullet);
    }
    return h;
  }

  function drawCertificationEntry(entry) {
    const heading = entry.date_range
      ? `${entry.title} — ${entry.institution} | ${entry.date_range}`
      : `${entry.title} — ${entry.institution}`;
    drawWrapped(heading, STYLE.subHeading);
    for (const item of entry.items) {
      const { label, rest } = splitBoldLabel(item);
      drawBulletLine(label, rest, STYLE.bullet);
    }
  }

  // Every branch below treats one "sub-section" (a role, an education
  // entry, an earlier-career line, or — since custom sections have no
  // further sub-units — the whole custom section) as the atomic,
  // non-splittable unit: its full height is measured first, room is
  // ensured for it as a whole, and only then is it drawn. The section
  // heading is glued to the first sub-unit (ensureAtomicRoom covers both
  // together) so a heading can never end up orphaned at the bottom of a
  // page with its content pushed to the next one.
  function renderMainSection(section) {
    if (section.type === 'profile') {
      const bodyHeight = measureWrappedHeight(section.text, STYLE.body);
      ensureAtomicRoom(SECTION_GAP + measureSectionHeadingHeight(section.heading) + bodyHeight);
      mainY += SECTION_GAP;
      drawSectionHeading(section.heading);
      drawWrapped(section.text, STYLE.body);
    } else if (section.type === 'skills') {
      const text = section.items.join('  •  ');
      const bodyHeight = measureWrappedHeight(text, STYLE.bullet);
      ensureAtomicRoom(SECTION_GAP + measureSectionHeadingHeight(section.heading) + bodyHeight);
      mainY += SECTION_GAP;
      drawSectionHeading(section.heading);
      drawWrapped(text, STYLE.bullet);
    } else if (section.type === 'experience') {
      // ENTRY_GAP only applies BETWEEN sibling entries — the first entry's
      // gap from the section heading is HEADING_GAP alone (already added
      // by drawSectionHeading), not HEADING_GAP + ENTRY_GAP stacked.
      section.entries.forEach((entry, i) => {
        const entryHeight = measureExperienceEntryHeight(entry);
        if (i === 0) {
          ensureAtomicRoom(SECTION_GAP + measureSectionHeadingHeight(section.heading) + entryHeight);
          mainY += SECTION_GAP;
          drawSectionHeading(section.heading);
        } else {
          ensureAtomicRoom(ENTRY_GAP + entryHeight);
          mainY += ENTRY_GAP;
        }
        drawExperienceEntry(entry);
      });
    } else if (section.type === 'earlier_experience') {
      section.entries.forEach((entry, i) => {
        // Always bold "Employer - Title", unlike splitBoldLabel (used for
        // custom-section "Label: a, b, c" lists elsewhere) — that helper
        // only bolds when the rest happens to contain a comma, which here
        // depends entirely on whether the summary sentence incidentally has
        // one, bolding some roles and not others for no visible reason.
        const label = `${entry.employer} - ${entry.title}`;
        const rest = entry.summary;
        const lineHeightNeeded = measureBulletHeight(label, rest, STYLE.bullet);
        if (i === 0) {
          ensureAtomicRoom(
            SECTION_GAP + measureSectionHeadingHeight(section.heading) + lineHeightNeeded,
          );
          mainY += SECTION_GAP;
          drawSectionHeading(section.heading);
        } else {
          ensureAtomicRoom(lineHeightNeeded);
        }
        drawBulletLine(label, rest, STYLE.bullet);
      });
    } else if (section.type === 'education') {
      section.groups.forEach((group, i) => {
        const groupHeight = measureEducationGroupHeight(group);
        if (i === 0) {
          ensureAtomicRoom(SECTION_GAP + measureSectionHeadingHeight(section.heading) + groupHeight);
          mainY += SECTION_GAP;
          drawSectionHeading(section.heading);
        } else {
          ensureAtomicRoom(ENTRY_GAP + groupHeight);
          mainY += ENTRY_GAP;
        }
        drawEducationGroup(group);
      });
    } else if (section.type === 'certification') {
      section.entries.forEach((entry, i) => {
        const entryHeight = measureCertificationEntryHeight(entry);
        if (i === 0) {
          ensureAtomicRoom(SECTION_GAP + measureSectionHeadingHeight(section.heading) + entryHeight);
          mainY += SECTION_GAP;
          drawSectionHeading(section.heading);
        } else {
          ensureAtomicRoom(ENTRY_GAP + entryHeight);
          mainY += ENTRY_GAP;
        }
        drawCertificationEntry(entry);
      });
    } else if (section.type === 'links') {
      const bodyHeight = section.items.reduce(
        (h, item) => h + measureBulletHeight(item.label, item.url, STYLE.bullet),
        0,
      );
      ensureAtomicRoom(SECTION_GAP + measureSectionHeadingHeight(section.heading) + bodyHeight);
      mainY += SECTION_GAP;
      drawSectionHeading(section.heading);
      for (const item of section.items) {
        drawLinksEntry(item, STYLE.bullet);
      }
    } else if (section.type === 'custom') {
      let bodyHeight = 0;
      if (section.intro?.trim()) {
        bodyHeight += measureWrappedHeight(section.intro.trim(), STYLE.body);
      }
      if (section.format === 'bullets') {
        for (const line of section.content.split('\n')) {
          if (!line.trim()) continue;
          const { label, rest } = splitBoldLabel(line.trim());
          bodyHeight += measureBulletHeight(label, rest, STYLE.bullet);
        }
      } else {
        bodyHeight += measureWrappedHeight(section.content, STYLE.body);
      }
      ensureAtomicRoom(SECTION_GAP + measureSectionHeadingHeight(section.heading) + bodyHeight);
      mainY += SECTION_GAP;
      drawSectionHeading(section.heading);
      if (section.intro?.trim()) {
        drawWrapped(section.intro.trim(), STYLE.body);
      }
      if (section.format === 'bullets') {
        for (const line of section.content.split('\n')) {
          if (!line.trim()) continue;
          const { label, rest } = splitBoldLabel(line.trim());
          drawBulletLine(label, rest, STYLE.bullet);
        }
      } else {
        drawWrapped(section.content, STYLE.body);
      }
    }
  }

  // Header band, page 1 only, drawn before the sidebar band so the
  // sidebar can start below it rather than overlapping.
  if (headerBandHeight > 0) {
    doc.setFillColor(...accentRgb);
    doc.rect(0, 0, pageWidth, headerBandHeight, 'F');

    if (cv.name) {
      doc.setFont(fontName, 'bold');
      doc.setFontSize(STYLE.name.size);
      doc.setTextColor(...whiteRgb);
      doc.text(cv.name, mainZone.x, 34);
    }

    if (contactFieldsForLinks.length > 0) {
      drawContactLine(
        contactFieldsForLinks,
        mainZone.x,
        HEADER_BAND_CONTACT_START_Y,
        mainZone.width,
        STYLE.contact.size,
        STYLE.contact.lineHeight,
        contactBandMutedRgb,
        whiteRgb,
      );
    }
  }

  // Sidebar background band, page 1 — starts below the header band if one
  // is present, rather than overlapping it. Later sidebar pages (if the
  // sidebar content runs past page 1) get their own band drawn by
  // drawSidebarBand() inside runSidebarPass()'s real draw pass below.
  if (hasSidebar) {
    drawSidebarBand(1);
  }

  // Photo, optional — page 1 only, drawn after the band so it isn't
  // painted over.
  let photoZoneX = null;
  let photoZoneY = null;

  // Photos never combine with a header-band template (the only one, Bold,
  // has supportsPhoto: false), so contentTop here is always the name's
  // actual baseline, not a band-adjusted value — nameCapHeight (declared
  // above, near SECTION_GAP) is what lines the photo's top edge up with
  // where the name's letters actually start rather than its baseline.

  if (photoDataUrl && template.supportsPhoto) {
    if (hasSidebar) {
      photoZoneX = zones.sidebar.x;
      photoZoneY = contentTop - nameCapHeight;
    } else {
      photoZoneX = mainZone.x + mainZone.width - photoSize;
      photoZoneY = contentTop - nameCapHeight;
    }
    try {
      const format = photoDataUrl.includes('image/png') ? 'PNG' : 'JPEG';
      if (template.photoShape === 'circle') {
        // Clip to a circle before drawing: define the circle as the current
        // path (style null — don't paint it, just use it as the clip
        // region), clip, discard the path so it isn't also stroked/filled,
        // draw the image, then restore so the clip doesn't leak into
        // anything drawn afterward.
        doc.saveGraphicsState();
        doc.circle(
          photoZoneX + photoSize / 2,
          photoZoneY + photoSize / 2,
          photoSize / 2,
          null,
        );
        doc.clip();
        doc.discardPath();
        doc.addImage(photoDataUrl, format, photoZoneX, photoZoneY, photoSize, photoSize);
        doc.restoreGraphicsState();
      } else {
        doc.addImage(photoDataUrl, format, photoZoneX, photoZoneY, photoSize, photoSize);
      }
    } catch {
      // If the image fails to decode, just skip it rather than fail the build.
      photoZoneX = null;
    }
  }

  if (headerBandHeight === 0) {
    const nameHeaderWidth =
      !hasSidebar && photoZoneX !== null ? mainZone.width - photoSize - 16 : mainZone.width;

    if (cv.name) {
      drawWrapped(cv.name, { ...STYLE.name, width: nameHeaderWidth });
    }

    // Non-sidebar templates keep contact details in the main header,
    // right under the name; sidebar templates show them in the sidebar
    // instead (drawn below, after the main column). Drawn via
    // drawContactLine (not drawWrapped) so each field can carry its own
    // clickable link — safe to read/write mainY directly here since the
    // header is the very first thing drawn, before any page break can occur.
    if (!hasSidebar && contactFieldsForLinks.length > 0) {
      mainY = drawContactLine(
        contactFieldsForLinks,
        mainZone.x,
        mainY,
        nameHeaderWidth,
        STYLE.contact.size,
        STYLE.contact.lineHeight,
        contactMutedRgb,
        accentRgb,
      );
    }
  }

  for (const section of mainSections) {
    renderMainSection(section);
  }

  // Sidebar content is drawn last (real pass) so it can reuse whatever
  // pages the main column already created via setPage(), only appending
  // new ones past the end if the sidebar outlasts the main content.
  if (hasSidebar) {
    runSidebarPass(true);
  }

  return doc.output('blob');
}
