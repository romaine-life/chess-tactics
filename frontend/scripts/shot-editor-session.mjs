const LEVEL_EDITOR_PATHS = new Set(['/editor/level', '/edit', '/level-editor']);

export function isLevelEditorUrl(value) {
  try {
    const path = new URL(value).pathname.replace(/\/+$/, '') || '/';
    return LEVEL_EDITOR_PATHS.has(path);
  } catch {
    return false;
  }
}

export function observationOpenPostData({ targetIsLevelEditor, method, requestUrl, postData }) {
  if (!targetIsLevelEditor || method !== 'POST') return null;
  let path;
  try { path = new URL(requestUrl).pathname; } catch { return null; }
  if (!/^\/api\/editor-documents\/[^/]+\/edit-sessions$/.test(path)) return null;
  try {
    const body = JSON.parse(postData || '{}');
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    return JSON.stringify({ ...body, intent: 'observe' });
  } catch {
    return null;
  }
}
