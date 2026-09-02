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

function hexToRgb(hex) {
  const clean = (hex || '#000000').replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
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
  if (section.type === 'experience' || section.type === 'education') {
    return (section.entries?.length ?? 0) > 0;
  }
  if (section.type === 'earlier_experience') return (section.entries?.length ?? 0) > 0;
  if (section.type === 'custom') return !!section.content?.trim();
  return true;
}

// A plain-text rendering of the same structured content, for the .txt
// copy saved alongside the PDF — no template/layout concerns, just the
// content in reading order.
export function cvToPlainText(cv) {
  const lines = [];

  if (cv.name) lines.push(cv.name);
  const contactLine = [
    cv.contact?.location,
    cv.contact?.phone,
    cv.contact?.email,
    cv.contact?.linkedin_url,
    cv.contact?.github_url,
  ]
    .filter(Boolean)
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
      for (const entry of section.entries) {
        lines.push(
          entry.date_range
            ? `${entry.title} — ${entry.institution} | ${entry.date_range}`
            : `${entry.title} — ${entry.institution}`,
        );
        for (const item of entry.items) lines.push(`• ${item}`);
      }
    }
  }

  return lines.join('\n');
}

export async function renderCvPdf(cv, template, paletteIndex, photoDataUrl) {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const palette = template.palettes[paletteIndex] ?? template.palettes[0];
  const accentRgb = hexToRgb(palette.accent);
  const sidebarBgRgb = hexToRgb(palette.sidebarBg || '#f4f6f8');
  const textRgb = [31, 35, 40];
  const whiteRgb = [255, 255, 255];

  // `density: 'compact'` scales every font size/line-height/spacing gap
  // by one factor, computed once here — everything below reads from
  // STYLE/the *_GAP constants rather than hardcoding sizes, so a new
  // density-aware template needs nothing beyond this config flag.
  const scale = template.density === 'compact' ? 0.86 : 1;
  const STYLE = {
    name: { size: 19 * scale, bold: true, lineHeight: 24 * scale, color: accentRgb },
    contact: { size: 9 * scale, lineHeight: 13 * scale, color: textRgb },
    sectionHeading: { size: 12 * scale, bold: true, lineHeight: 18 * scale, color: accentRgb },
    body: { size: 10.5 * scale, lineHeight: 15 * scale, color: textRgb },
    subHeading: { size: 10.5 * scale, bold: true, lineHeight: 15 * scale, color: textRgb },
    meta: { size: 9.5 * scale, lineHeight: 13 * scale, color: textRgb },
    bullet: { size: 10 * scale, lineHeight: 14 * scale, color: textRgb },
    sidebarHeading: { size: 10.5 * scale, lineHeight: 14 * scale },
    sidebarBody: { size: 9.5 * scale, lineHeight: 13 * scale },
  };

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const zones = computeZones(template, pageWidth);
  const hasSidebar = !!zones.sidebar;
  let mainZone = hasSidebar ? zones.main : zones.fullWidthMain;

  const contactFields = [
    cv.contact?.location,
    cv.contact?.phone,
    cv.contact?.email,
    cv.contact?.linkedin_url,
    cv.contact?.github_url,
  ].filter(Boolean);
  const contactLine = contactFields.join('   |   ');

  // A colored banner behind the name/contact — page 1 only, same as the
  // sidebar band, so it doesn't repeat awkwardly on later pages. Height
  // adapts to how many lines the contact details actually wrap to (long
  // combinations of location/phone/email/LinkedIn/GitHub easily exceed
  // one line) rather than a fixed guess that could run text off the page.
  const HEADER_BAND_CONTACT_START_Y = 50;

  let headerBandContactLines = [];
  if (template.headerBand && contactLine) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(STYLE.contact.size);
    headerBandContactLines = doc.splitTextToSize(contactLine, mainZone.width);
  }
  const headerBandHeight = template.headerBand
    ? HEADER_BAND_CONTACT_START_Y + headerBandContactLines.length * STYLE.contact.lineHeight + 12
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

  let mainY = contentTop;

  function breakPage() {
    doc.addPage();
    mainY = CONTENT_TOP;
    // Sidebar/header band are only drawn on page 1 — later pages use the
    // full width and the normal (unbanded) top margin.
    mainZone = zones.fullWidthMain;
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
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
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

  function drawBulletLine(label, rest, { size, color, lineHeight }) {
    doc.setFontSize(size);
    const bulletPrefix = '•  ';
    doc.setFont('helvetica', 'normal');
    const bulletWidth = doc.getTextWidth(bulletPrefix);
    const innerWidth = mainZone.width - bulletWidth;

    if (!label) {
      const lines = doc.splitTextToSize(rest, innerWidth);
      lines.forEach((line, i) => {
        ensureMainRoom(lineHeight);
        doc.setTextColor(...color);
        doc.text(
          i === 0 ? bulletPrefix + line : line,
          mainZone.x + (i === 0 ? 0 : bulletWidth),
          mainY,
        );
        mainY += lineHeight;
      });
      return;
    }

    doc.setFont('helvetica', 'bold');
    const labelWithColon = `${label}: `;
    const labelWidth = doc.getTextWidth(labelWithColon);
    doc.setFont('helvetica', 'normal');
    const restWidth = doc.getTextWidth(rest);

    ensureMainRoom(lineHeight);
    doc.setTextColor(...color);
    doc.text(bulletPrefix, mainZone.x, mainY);
    doc.setFont('helvetica', 'bold');
    doc.text(labelWithColon, mainZone.x + bulletWidth, mainY);
    doc.setFont('helvetica', 'normal');

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

  // Spacing hierarchy, per explicit request: a section heading sits close
  // to its own content (HEADING_GAP), but a clear, larger gap separates
  // one section's end from the next section's heading (SECTION_GAP) —
  // ENTRY_GAP (between e.g. two roles within Experience) sits between the
  // two, so the visual grouping reads correctly at every level.
  const SECTION_GAP = 16 * scale;
  const HEADING_GAP = 3 * scale;
  const ENTRY_GAP = 10 * scale;

  // Measurement twins of drawWrapped/drawBulletLine — same wrapping logic,
  // no drawing, used to size a section/sub-section *before* committing to
  // drawing it so ensureAtomicRoom can break the page ahead of a heading
  // instead of wherever per-line drawing happens to run out of room.
  function measureWrappedHeight(text, { size, bold, lineHeight, width }) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, width ?? mainZone.width);
    return lines.length * lineHeight;
  }

  function measureBulletHeight(label, rest, { size, lineHeight }) {
    doc.setFontSize(size);
    const bulletPrefix = '•  ';
    doc.setFont('helvetica', 'normal');
    const bulletWidth = doc.getTextWidth(bulletPrefix);
    const innerWidth = mainZone.width - bulletWidth;

    if (!label) {
      const lines = doc.splitTextToSize(rest, innerWidth);
      return lines.length * lineHeight;
    }

    doc.setFont('helvetica', 'bold');
    const labelWidth = doc.getTextWidth(`${label}: `);
    doc.setFont('helvetica', 'normal');
    const restWidth = doc.getTextWidth(rest);

    if (bulletWidth + labelWidth + restWidth <= mainZone.width) return lineHeight;

    const wrapped = doc.splitTextToSize(rest, innerWidth);
    return lineHeight + wrapped.length * lineHeight;
  }

  function measureSectionHeadingHeight(heading) {
    return measureWrappedHeight(heading.toUpperCase(), STYLE.sectionHeading) + HEADING_GAP;
  }

  function drawSectionHeading(text) {
    drawWrapped(text.toUpperCase(), STYLE.sectionHeading);
    mainY += HEADING_GAP;
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

  function measureEducationEntryHeight(entry) {
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

  function drawEducationEntry(entry) {
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
        const { label, rest } = splitBoldLabel(
          `${entry.employer} - ${entry.title}: ${entry.summary}`,
        );
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
      section.entries.forEach((entry, i) => {
        const entryHeight = measureEducationEntryHeight(entry);
        if (i === 0) {
          ensureAtomicRoom(SECTION_GAP + measureSectionHeadingHeight(section.heading) + entryHeight);
          mainY += SECTION_GAP;
          drawSectionHeading(section.heading);
        } else {
          ensureAtomicRoom(ENTRY_GAP + entryHeight);
          mainY += ENTRY_GAP;
        }
        drawEducationEntry(entry);
      });
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

  // Sidebar heading color: the same accent used for main-column headings
  // (not the sidebar's body-text color) — requested explicitly so heading
  // color reads consistently across the whole page, not just the main
  // column.
  function drawSidebarHeading(heading, zone, y) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(STYLE.sidebarHeading.size);
    doc.setTextColor(...accentRgb);
    const headingLines = doc.splitTextToSize(heading.toUpperCase(), zone.width);
    for (const line of headingLines) {
      doc.text(line, zone.x, y);
      y += STYLE.sidebarHeading.lineHeight;
    }
    return y + 2 * scale;
  }

  function renderSidebarContact(zone, y) {
    const fields = [
      cv.contact?.location,
      cv.contact?.phone,
      cv.contact?.email,
      cv.contact?.linkedin_url,
      cv.contact?.github_url,
    ].filter(Boolean);
    if (fields.length === 0) return y;

    y += 4 * scale;
    y = drawSidebarHeading('Contact', zone, y);

    const bodyColor = palette.sidebarText ? hexToRgb(palette.sidebarText) : textRgb;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(STYLE.sidebarBody.size);
    for (const field of fields) {
      const lines = doc.splitTextToSize(field, zone.width);
      for (const line of lines) {
        doc.setTextColor(...bodyColor);
        doc.text(line, zone.x, y);
        y += STYLE.sidebarBody.lineHeight;
      }
    }

    return y + 8 * scale;
  }

  function renderSidebarSection(section, zone, y) {
    y += 4 * scale;
    y = drawSidebarHeading(section.heading, zone, y);

    const bodyColor = palette.sidebarText ? hexToRgb(palette.sidebarText) : textRgb;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(STYLE.sidebarBody.size);

    if (section.type === 'skills') {
      for (const item of section.items) {
        const lines = doc.splitTextToSize(item, zone.width);
        for (const line of lines) {
          doc.setTextColor(...bodyColor);
          doc.text(line, zone.x, y);
          y += STYLE.sidebarBody.lineHeight;
        }
      }
    } else if (section.type === 'education') {
      for (const entry of section.entries) {
        const heading = entry.date_range
          ? `${entry.title}, ${entry.institution} (${entry.date_range})`
          : `${entry.title}, ${entry.institution}`;
        const lines = doc.splitTextToSize(heading, zone.width);
        for (const line of lines) {
          doc.setTextColor(...bodyColor);
          doc.text(line, zone.x, y);
          y += STYLE.sidebarBody.lineHeight;
        }
        y += 4 * scale;
      }
    }

    return y + 8 * scale;
  }

  // Header band, page 1 only, drawn before the sidebar band so the
  // sidebar can start below it rather than overlapping.
  if (headerBandHeight > 0) {
    doc.setFillColor(...accentRgb);
    doc.rect(0, 0, pageWidth, headerBandHeight, 'F');

    if (cv.name) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(STYLE.name.size);
      doc.setTextColor(...whiteRgb);
      doc.text(cv.name, mainZone.x, 34);
    }

    if (headerBandContactLines.length > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(STYLE.contact.size);
      doc.setTextColor(...whiteRgb);
      let contactY = HEADER_BAND_CONTACT_START_Y;
      for (const line of headerBandContactLines) {
        doc.text(line, mainZone.x, contactY);
        contactY += STYLE.contact.lineHeight;
      }
    }
  }

  // Sidebar background band, page 1 only — starts below the header band
  // if one is present, rather than overlapping it.
  if (hasSidebar) {
    doc.setFillColor(...sidebarBgRgb);
    doc.rect(
      zones.sidebar.rectX,
      headerBandHeight,
      zones.sidebar.rectWidth,
      pageHeight - headerBandHeight,
      'F',
    );
  }

  // Photo, optional.
  const photoSize = 64;
  let photoZoneX = null;
  let photoZoneY = null;

  if (photoDataUrl && template.supportsPhoto) {
    if (hasSidebar) {
      photoZoneX = zones.sidebar.x;
      photoZoneY = contentTop;
    } else {
      photoZoneX = mainZone.x + mainZone.width - photoSize;
      photoZoneY = contentTop;
    }
    try {
      const format = photoDataUrl.includes('image/png') ? 'PNG' : 'JPEG';
      doc.addImage(photoDataUrl, format, photoZoneX, photoZoneY, photoSize, photoSize);
    } catch {
      // If the image fails to decode, just skip it rather than fail the build.
      photoZoneX = null;
    }
  }

  let sidebarY = photoZoneX !== null && hasSidebar ? contentTop + photoSize + 16 : contentTop;

  if (hasSidebar) {
    // Contact details live in the sidebar for this layout, not the main
    // header — drawn first, above Skills/Education. (Header-band
    // templates don't currently combine with a sidebar, but if one did,
    // contact would already have been drawn in the band instead.)
    if (headerBandHeight === 0) {
      sidebarY = renderSidebarContact(zones.sidebar, sidebarY);
    }
    for (const section of sidebarSections) {
      sidebarY = renderSidebarSection(section, zones.sidebar, sidebarY);
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
    // instead (handled above).
    if (!hasSidebar && contactLine) {
      drawWrapped(contactLine, { ...STYLE.contact, width: nameHeaderWidth });
    }
  }

  for (const section of mainSections) {
    renderMainSection(section);
  }

  return doc.output('blob');
}
