// Template configs are plain data, not code — the whole point of the
// rendering engine (renderCvPdf.js) being generic is that adding a new
// look here shouldn't require touching the renderer. Two optional knobs
// give real visual variety without new layout code: `density: 'compact'`
// scales font sizes/spacing down for longer CVs, and `headerBand: true`
// draws a colored banner behind the name/contact instead of plain text.
// The in-app template builder (Phase 2) stays deferred indefinitely —
// adding a look here is cheap enough that it isn't needed.

// Six colors per template, "Ink" included everywhere — shared constants
// rather than repeating the list per template, since every non-sidebar (and
// every sidebar) template currently uses the exact same set. Sidebar
// templates need a sidebarBg/sidebarText per color too, for the shaded
// side panel; non-sidebar ones just need the accent. The two lists share
// the same six underlying hexes (Navy=Slate, Forest=Sage) under names that
// match each family's existing convention.
const NON_SIDEBAR_PALETTES = [
  { name: 'Navy', accent: '#1e3a5f' },
  { name: 'Charcoal', accent: '#33353f' },
  { name: 'Forest', accent: '#2d5a3d' },
  { name: 'Burgundy', accent: '#6b2737' },
  { name: 'Plum', accent: '#5a2d5a' },
  { name: 'Ink', accent: '#16171d' },
];

const SIDEBAR_PALETTES = [
  { name: 'Slate', accent: '#1e3a5f', sidebarBg: '#f4f6f8', sidebarText: '#1f2328' },
  { name: 'Charcoal', accent: '#33353f', sidebarBg: '#f0f0f1', sidebarText: '#1f2328' },
  { name: 'Sage', accent: '#2d5a3d', sidebarBg: '#f2f6f3', sidebarText: '#1f2328' },
  { name: 'Burgundy', accent: '#6b2737', sidebarBg: '#f7f2f3', sidebarText: '#1f2328' },
  { name: 'Plum', accent: '#5a2d5a', sidebarBg: '#f7f4f7', sidebarText: '#1f2328' },
  { name: 'Ink', accent: '#16171d', sidebarBg: '#eceef1', sidebarText: '#1f2328' },
];

export const CV_TEMPLATES = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Single column, clean and traditional.',
    layout: 'single-column',
    sidebarSectionTypes: [],
    supportsPhoto: true,
    photoShape: 'circle',
    palettes: NON_SIDEBAR_PALETTES,
  },
  {
    id: 'sidebar',
    name: 'Sidebar',
    description:
      'Two column — contact, skills, education and certifications in a shaded side panel; profile and experience in the main column.',
    layout: 'sidebar-left',
    sidebarSectionTypes: ['skills', 'education', 'certification'],
    supportsPhoto: true,
    photoShape: 'circle',
    palettes: SIDEBAR_PALETTES,
  },
  {
    id: 'sidebar-right',
    name: 'Sidebar Right',
    description:
      'Same as Sidebar, mirrored — contact, skills and education on the right.',
    layout: 'sidebar-right',
    sidebarSectionTypes: ['skills', 'education', 'certification'],
    supportsPhoto: true,
    photoShape: 'circle',
    palettes: SIDEBAR_PALETTES,
  },
  {
    id: 'compact',
    name: 'Compact',
    description: 'Single column with tighter spacing — fits more onto fewer pages.',
    layout: 'single-column',
    sidebarSectionTypes: [],
    density: 'compact',
    supportsPhoto: true,
    photoShape: 'circle',
    palettes: NON_SIDEBAR_PALETTES,
  },
  {
    id: 'bold',
    name: 'Bold',
    description: 'Single column with a colored banner behind your name and contact details.',
    layout: 'single-column',
    sidebarSectionTypes: [],
    headerBand: true,
    supportsPhoto: false,
    palettes: NON_SIDEBAR_PALETTES,
  },
  {
    id: 'compact-sidebar',
    name: 'Compact Sidebar',
    description: 'Sidebar layout with tighter spacing — fits more onto fewer pages.',
    layout: 'sidebar-left',
    sidebarSectionTypes: ['skills', 'education', 'certification'],
    density: 'compact',
    supportsPhoto: true,
    photoShape: 'circle',
    palettes: SIDEBAR_PALETTES,
  },
  {
    id: 'vivid',
    name: 'Vivid',
    description:
      'Single column with a colored header band, bold color-block section headings, and colored bullet accents.',
    layout: 'single-column',
    sidebarSectionTypes: [],
    headerBand: true,
    boldSections: true,
    coloredBullets: true,
    supportsPhoto: false,
    palettes: NON_SIDEBAR_PALETTES,
  },
  {
    id: 'vivid-sidebar',
    name: 'Vivid Sidebar',
    description:
      'Sidebar layout with a colored divider rule under each heading and colored bullet accents in the main column.',
    layout: 'sidebar-left',
    sidebarSectionTypes: ['skills', 'education', 'certification'],
    sectionDivider: true,
    coloredBullets: true,
    supportsPhoto: true,
    photoShape: 'circle',
    palettes: SIDEBAR_PALETTES,
  },
];

export function getTemplate(id) {
  return CV_TEMPLATES.find((t) => t.id === id) ?? CV_TEMPLATES[0];
}
