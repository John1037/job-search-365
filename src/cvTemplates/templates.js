// Template configs are plain data, not code — the whole point of the
// rendering engine (renderCvPdf.js) being generic is that adding a new
// look here shouldn't require touching the renderer. Two optional knobs
// give real visual variety without new layout code: `density: 'compact'`
// scales font sizes/spacing down for longer CVs, and `headerBand: true`
// draws a colored banner behind the name/contact instead of plain text.
// The in-app template builder (Phase 2) stays deferred indefinitely —
// adding a look here is cheap enough that it isn't needed.
export const CV_TEMPLATES = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Single column, clean and traditional.',
    layout: 'single-column',
    sidebarSectionTypes: [],
    supportsPhoto: true,
    photoShape: 'rounded-square',
    palettes: [
      { name: 'Navy', accent: '#1e3a5f' },
      { name: 'Charcoal', accent: '#33353f' },
      { name: 'Forest', accent: '#2d5a3d' },
      { name: 'Burgundy', accent: '#6b2737' },
    ],
  },
  {
    id: 'sidebar',
    name: 'Sidebar',
    description:
      'Two column — contact, skills, education and certifications in a shaded side panel; profile and experience in the main column.',
    layout: 'sidebar-left',
    sidebarSectionTypes: ['skills', 'education', 'certification'],
    supportsPhoto: true,
    photoShape: 'rounded-square',
    palettes: [
      { name: 'Slate', accent: '#1e3a5f', sidebarBg: '#f4f6f8', sidebarText: '#1f2328' },
      { name: 'Sage', accent: '#2d5a3d', sidebarBg: '#f2f6f3', sidebarText: '#1f2328' },
      { name: 'Plum', accent: '#5a2d5a', sidebarBg: '#f7f4f7', sidebarText: '#1f2328' },
      { name: 'Ink', accent: '#16171d', sidebarBg: '#eceef1', sidebarText: '#1f2328' },
    ],
  },
  {
    id: 'sidebar-right',
    name: 'Sidebar Right',
    description:
      'Same as Sidebar, mirrored — contact, skills and education on the right.',
    layout: 'sidebar-right',
    sidebarSectionTypes: ['skills', 'education', 'certification'],
    supportsPhoto: true,
    photoShape: 'rounded-square',
    palettes: [
      { name: 'Slate', accent: '#1e3a5f', sidebarBg: '#f4f6f8', sidebarText: '#1f2328' },
      { name: 'Sage', accent: '#2d5a3d', sidebarBg: '#f2f6f3', sidebarText: '#1f2328' },
      { name: 'Plum', accent: '#5a2d5a', sidebarBg: '#f7f4f7', sidebarText: '#1f2328' },
      { name: 'Ink', accent: '#16171d', sidebarBg: '#eceef1', sidebarText: '#1f2328' },
    ],
  },
  {
    id: 'compact',
    name: 'Compact',
    description: 'Single column with tighter spacing — fits more onto fewer pages.',
    layout: 'single-column',
    sidebarSectionTypes: [],
    density: 'compact',
    supportsPhoto: true,
    photoShape: 'rounded-square',
    palettes: [
      { name: 'Navy', accent: '#1e3a5f' },
      { name: 'Charcoal', accent: '#33353f' },
      { name: 'Forest', accent: '#2d5a3d' },
      { name: 'Burgundy', accent: '#6b2737' },
    ],
  },
  {
    id: 'bold',
    name: 'Bold',
    description: 'Single column with a colored banner behind your name and contact details.',
    layout: 'single-column',
    sidebarSectionTypes: [],
    headerBand: true,
    supportsPhoto: false,
    palettes: [
      { name: 'Navy', accent: '#1e3a5f' },
      { name: 'Charcoal', accent: '#33353f' },
      { name: 'Forest', accent: '#2d5a3d' },
      { name: 'Burgundy', accent: '#6b2737' },
    ],
  },
  {
    id: 'compact-sidebar',
    name: 'Compact Sidebar',
    description: 'Sidebar layout with tighter spacing — fits more onto fewer pages.',
    layout: 'sidebar-left',
    sidebarSectionTypes: ['skills', 'education', 'certification'],
    density: 'compact',
    supportsPhoto: true,
    photoShape: 'rounded-square',
    palettes: [
      { name: 'Slate', accent: '#1e3a5f', sidebarBg: '#f4f6f8', sidebarText: '#1f2328' },
      { name: 'Sage', accent: '#2d5a3d', sidebarBg: '#f2f6f3', sidebarText: '#1f2328' },
      { name: 'Plum', accent: '#5a2d5a', sidebarBg: '#f7f4f7', sidebarText: '#1f2328' },
      { name: 'Ink', accent: '#16171d', sidebarBg: '#eceef1', sidebarText: '#1f2328' },
    ],
  },
];

export function getTemplate(id) {
  return CV_TEMPLATES.find((t) => t.id === id) ?? CV_TEMPLATES[0];
}
