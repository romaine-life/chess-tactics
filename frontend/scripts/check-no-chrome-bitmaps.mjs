// Migration guard (PR: rebuild main-menu profile/news/dock chrome as DOM components).
// The generated `main-menu-{profile,news,dock}-chrome-v1.png` bitmaps were replaced
// end-to-end by live DOM + inline-SVG components. They must not return to live code.
// Fails the build if a reference or asset reappears.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FORBIDDEN = /main-menu-(profile|news|dock)-chrome-v1/;
const failures = [];

for (const rel of ['src/app.js', 'src/style.css', 'index.html']) {
  const text = readFileSync(join(root, rel), 'utf8');
  text.split('\n').forEach((line, i) => {
    if (FORBIDDEN.test(line)) failures.push(`${rel}:${i + 1}: ${line.trim()}`);
  });
}

for (const png of [
  'public/assets/ui/main-menu-profile-chrome-v1.png',
  'public/assets/ui/main-menu-news-chrome-v1.png',
  'public/assets/ui/main-menu-dock-chrome-v1.png',
]) {
  if (existsSync(join(root, png))) failures.push(`retired asset still present: ${png}`);
}

if (failures.length) {
  console.error('Migration guard FAILED — retired main-menu chrome bitmaps reintroduced:');
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log('Migration guard OK: no retired *-chrome-v1 chrome bitmaps in live code.');
