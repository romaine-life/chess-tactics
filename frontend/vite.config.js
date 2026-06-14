import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The legacy vanilla entry (index.html -> /src/app.js) is unchanged; the React
// plugin only adds JSX/TSX handling for the new surfaces we migrate onto.
export default defineConfig({
  plugins: [react()],
});
