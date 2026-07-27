import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  isLevelEditorUrl,
  isObservationSessionState,
  observationOpenPostData,
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

test('accepts only the server observation state as proof of a lease-free viewer', () => {
  assert.equal(isObservationSessionState('observing'), true);
  assert.equal(isObservationSessionState('waiting'), false);
  assert.equal(isObservationSessionState('active'), false);
});
