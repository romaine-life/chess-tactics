// The app's main pages, as read-only Studio catalog entries (ADR-0029). Each page is a
// card; "View Selected" opens its live Viewer. Routes mirror App.tsx renderRoute. Adding a
// page = one entry here. Functional viewers mount the real component with in-place tweak
// controls (Main Menu = live sizing; Settings = the dressing room); the rest are stubs that
// iframe the live route until their controls land.

export interface PageEntry {
  name: string; // stable selection id
  label: string;
  route: string; // the real app route
  status: 'functional' | 'stub';
  blurb: string; // Details-readout line
}

export const PAGE_ENTRIES: PageEntry[] = [
  { name: 'main-menu', label: 'Main Menu', route: '/', status: 'functional', blurb: 'The "Wet Stone & Cold Iron" home screen — tune button + icon sizing live.' },
  { name: 'settings', label: 'Settings', route: '/settings', status: 'functional', blurb: 'The settings screen — the live dressing room: assign a surface to each region.' },
  { name: 'skirmish', label: 'Skirmish', route: '/play', status: 'stub', blurb: 'A live skirmish match screen.' },
  { name: 'campaign-editor', label: 'Campaign Editor', route: '/campaigns-next', status: 'stub', blurb: 'The campaign authoring screen.' },
  { name: 'level-editor', label: 'Level Editor', route: '/edit', status: 'stub', blurb: 'The level / terrain editor.' },
  { name: 'lobbies', label: 'Lobbies', route: '/lobbies', status: 'stub', blurb: 'Multiplayer lobbies.' },
];
