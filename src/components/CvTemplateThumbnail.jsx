// A small abstract mockup of a template's layout, drawn directly from its
// config (layout shape + first palette's colors) rather than a maintained
// image asset — stays accurate automatically as templates are added or
// changed, and scales to however many templates exist without turning
// into a wall of text.
function CvTemplateThumbnail({ template }) {
  const palette = template.palettes[0] ?? {};
  const accent = palette.accent ?? '#333333';
  const sidebarBg = palette.sidebarBg ?? '#eef0f3';
  const sidebarRight = template.layout === 'sidebar-right';
  const hasSidebar = template.layout === 'sidebar-left' || sidebarRight;
  const hasBand = !!template.headerBand;

  const sidebarX = sidebarRight ? 68 : 0;
  const mainX = hasSidebar ? (sidebarRight ? 8 : 38) : 8;
  const mainWidth = hasSidebar ? 54 : 84;
  const bandHeight = 22;

  return (
    <svg
      viewBox="0 0 100 128"
      className="cv-template-thumb"
      role="img"
      aria-label={`${template.name} layout preview`}
    >
      <rect x="0.5" y="0.5" width="99" height="127" fill="var(--bg)" stroke="var(--border)" />

      {hasSidebar && (
        <>
          <rect x={sidebarX} y="0" width="32" height="128" fill={sidebarBg} />
          <rect x={sidebarX + 8} y="12" width="16" height="16" rx="3" fill={accent} opacity="0.35" />
          <rect x={sidebarX + 8} y="38" width="16" height="3" fill={accent} />
          <rect x={sidebarX + 8} y="46" width="16" height="2" fill="var(--border)" />
          <rect x={sidebarX + 8} y="51" width="16" height="2" fill="var(--border)" />
          <rect x={sidebarX + 8} y="56" width="12" height="2" fill="var(--border)" />
          <rect x={sidebarX + 8} y="70" width="16" height="3" fill={accent} />
          <rect x={sidebarX + 8} y="78" width="16" height="2" fill="var(--border)" />
          <rect x={sidebarX + 8} y="83" width="10" height="2" fill="var(--border)" />
        </>
      )}

      {hasBand && <rect x="0" y="0" width="100" height={bandHeight} fill={accent} />}

      {/* Name */}
      <rect
        x={mainX}
        y={hasBand ? 7 : 10}
        width={mainWidth * 0.6}
        height="6"
        fill={hasBand ? '#ffffff' : accent}
      />
      {/* Contact line */}
      <rect
        x={mainX}
        y={hasBand ? 16 : 20}
        width={mainWidth * 0.75}
        height="2"
        fill={hasBand ? '#ffffff' : 'var(--border)'}
        opacity={hasBand ? 0.85 : 1}
      />

      {/* Section 1: heading + body lines */}
      <rect x={mainX} y="34" width={mainWidth * 0.4} height="3" fill={accent} />
      <rect x={mainX} y="41" width={mainWidth} height="2" fill="var(--border)" />
      <rect x={mainX} y="46" width={mainWidth} height="2" fill="var(--border)" />
      <rect x={mainX} y="51" width={mainWidth * 0.7} height="2" fill="var(--border)" />

      {/* Section 2: heading + bullet-style lines */}
      <rect x={mainX} y="64" width={mainWidth * 0.4} height="3" fill={accent} />
      <rect x={mainX} y="71" width={mainWidth * 0.9} height="2" fill="var(--border)" />
      <rect x={mainX} y="76" width={mainWidth * 0.85} height="2" fill="var(--border)" />
      <rect x={mainX} y="81" width={mainWidth * 0.9} height="2" fill="var(--border)" />
      <rect x={mainX} y="86" width={mainWidth * 0.6} height="2" fill="var(--border)" />

      {/* Section 3: heading + body lines */}
      <rect x={mainX} y="99" width={mainWidth * 0.4} height="3" fill={accent} />
      <rect x={mainX} y="106" width={mainWidth * 0.9} height="2" fill="var(--border)" />
      <rect x={mainX} y="111" width={mainWidth * 0.5} height="2" fill="var(--border)" />
    </svg>
  );
}

export default CvTemplateThumbnail;
