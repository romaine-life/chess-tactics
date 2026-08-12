import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  editorDocumentObservationKind,
  isEditSessionOpenRequest,
  isEditorDocumentResolveRequest,
  isLevelEditorUrl,
  isObservationSessionState,
  observationOpenPostData,
  observationResolveRefusal,
} from './shot-editor-session.mjs';

test('recognizes only Level Editor routes', () => {
  assert.equal(isLevelEditorUrl('http://127.0.0.1:5178/editor/level?document=legacy-j5kip7ztaipw'), true);
  assert.equal(isLevelEditorUrl('http://127.0.0.1:5178/editor'), false);
  assert.equal(isLevelEditorUrl('http://127.0.0.1:5178/predrawn-reference'), false);
});

test('adds observe intent only to the Level Editor session-open request', () => {
  const postData = JSON.stringify({ session_id: 'page', session_key: 'secret', device_id: 'browser' });
  const observed = observationOpenPostData({
    targetIsLevelEditor: true,
    method: 'POST',
    requestUrl: 'http://127.0.0.1:5178/api/editor-documents/legacy-j5kip7ztaipw/edit-sessions',
    postData,
  });
  assert.deepEqual(JSON.parse(observed), {
    session_id: 'page', session_key: 'secret', device_id: 'browser', intent: 'observe',
  });
  assert.equal(observationOpenPostData({
    targetIsLevelEditor: false,
    method: 'POST',
    requestUrl: 'http://127.0.0.1:5178/api/editor-documents/doc/edit-sessions',
    postData,
  }), null);
  assert.equal(observationOpenPostData({
    targetIsLevelEditor: true,
    method: 'POST',
    requestUrl: 'http://127.0.0.1:5178/api/editor-documents/doc/edit-sessions/session/takeover',
    postData,
  }), null);
});

// The page-side rewrite and the node-side tally that proves it was consumed must agree on exactly
// which request is the session-open, or a run could report a clean observation while an unrewritten
// open reached the network.
test('identifies the session-open request the same way for the patch and the tally', () => {
  const open = 'http://127.0.0.1:5178/api/editor-documents/legacy-j5kip7ztaipw/edit-sessions';
  assert.equal(isEditSessionOpenRequest('POST', open), true);
  assert.equal(isEditSessionOpenRequest('GET', open), false);
  assert.equal(isEditSessionOpenRequest('POST', `${open}/session-a/heartbeat`), false);
  assert.equal(isEditSessionOpenRequest('POST', `${open}/session-a/takeover`), false);
  assert.equal(isEditSessionOpenRequest('PUT', 'http://127.0.0.1:5178/api/editor-documents/doc'), false);
  assert.equal(isEditSessionOpenRequest('POST', '/api/editor-documents/doc/edit-sessions'), false);
});

test('accepts only the server observation state as proof of a lease-free viewer', () => {
  assert.equal(isObservationSessionState('observing'), true);
  assert.equal(isObservationSessionState('waiting'), false);
  assert.equal(isObservationSessionState('active'), false);
});

// Resolve is the request that CREATES a working copy for a URL that has none. Rewriting only the
// session-open left every capture of a document-less editor URL minting an "Untitled level" on the
// owner's account and then dutifully observing the thing it had just made.
test('identifies the document resolve request the same way for the patch and the tally', () => {
  const resolveUrl = 'http://127.0.0.1:5178/api/editor-documents/resolve';
  assert.equal(isEditorDocumentResolveRequest('POST', resolveUrl), true);
  assert.equal(isEditorDocumentResolveRequest('GET', resolveUrl), false);
  assert.equal(isEditorDocumentResolveRequest('POST', 'http://127.0.0.1:5178/api/editor-documents'), false);
  assert.equal(isEditorDocumentResolveRequest('POST', 'http://127.0.0.1:5178/api/editor-documents/doc/resolve'), false);
  assert.equal(isEditorDocumentResolveRequest('POST', '/api/editor-documents/resolve'), false);
});

test('classifies both document-touching requests and nothing else', () => {
  assert.equal(
    editorDocumentObservationKind('POST', 'http://127.0.0.1:5178/api/editor-documents/resolve'),
    'resolve',
  );
  assert.equal(
    editorDocumentObservationKind('POST', 'http://127.0.0.1:5178/api/editor-documents/doc/edit-sessions'),
    'edit-session-open',
  );
  assert.equal(
    editorDocumentObservationKind('PUT', 'http://127.0.0.1:5178/api/editor-documents/doc'),
    null,
  );
});

test('adds observe intent to the resolve request, preserving the body it carries', () => {
  const observed = observationOpenPostData({
    targetIsLevelEditor: true,
    method: 'POST',
    requestUrl: 'http://127.0.0.1:5178/api/editor-documents/resolve',
    postData: JSON.stringify({ level_id: 'off-l-hold-bridge', workspace_kind: 'official' }),
  });
  assert.deepEqual(JSON.parse(observed), {
    level_id: 'off-l-hold-bridge', workspace_kind: 'official', intent: 'observe',
  });
});

test('reads a refused observing resolve as the fact the capture hit', () => {
  const missing = observationResolveRefusal(404, JSON.stringify({ error: 'editor_document_not_found_for_level' }));
  assert.equal(missing.error, 'editor_document_not_found_for_level');
  assert.match(missing.reason, /will not create one/);

  const wouldCreate = observationResolveRefusal(409, JSON.stringify({ error: 'observation_cannot_create_editor_document' }));
  assert.match(wouldCreate.reason, /no levelId/);

  // Every other failure belongs to the app, not to the observation contract.
  assert.equal(observationResolveRefusal(404, JSON.stringify({ error: 'saved_level_not_found' })), null);
  assert.equal(observationResolveRefusal(500, JSON.stringify({ error: 'editor_document_not_found_for_level' })), null);
  assert.equal(observationResolveRefusal(200, '{"document":{}}'), null);
  assert.equal(observationResolveRefusal(409, 'not json'), null);
});
