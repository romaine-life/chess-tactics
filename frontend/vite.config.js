import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nineSliceDevSave } from './scripts/vite-nine-slice-plugin.mjs';

// The legacy vanilla entry (index.html -> /src/app.js) is unchanged; the React
// plugin only adds JSX/TSX handling for the new surfaces we migrate onto.
// nineSliceDevSave is a dev-serve-only endpoint for the 9-slice editor's Save.
export default defineConfig({
  plugins: [react(), nineSliceDevSave()],
});
