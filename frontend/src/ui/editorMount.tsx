import { createRoot, type Root } from 'react-dom/client';
import { LevelEditor } from './LevelEditor';

let root: Root | null = null;

export function mountLevelEditor(el: HTMLElement): void {
  if (root) return;
  el.innerHTML = '';
  root = createRoot(el);
  root.render(<LevelEditor />);
}

export function unmountLevelEditor(): void {
  if (root) {
    root.unmount();
    root = null;
  }
}
