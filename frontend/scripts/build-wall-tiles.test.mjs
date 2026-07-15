import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const generator = fs.readFileSync(path.join(root, 'frontend/scripts/build-wall-tiles.py'), 'utf8');
const provenance = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/art/wall-concepts/runs/wall-material-runs-2026-07-06.json'),
  'utf8',
));

function integerConstant(name) {
  const match = generator.match(new RegExp(`^${name} = (\\d+)$`, 'm'));
  if (!match) throw new Error(`missing integer wall geometry constant ${name}`);
  return Number(match[1]);
}

function pointConstant(name) {
  const match = generator.match(new RegExp(`^${name} = \\(\\d+, \\d+\\)$`, 'm'));
  if (!match) throw new Error(`missing wall geometry point ${name}`);
  return match[0].match(/\d+/g).map(Number);
}

describe('full-height wall generator contract', () => {
  it('matches the canonical runtime frame and recorded generated geometry', () => {
    const frame = provenance.outputs.wall_frame;
    expect({
      width: integerConstant('WALL_FRAME_W'),
      height: integerConstant('WALL_FRAME_H'),
      anchor_x: integerConstant('WALL_ANCHOR_X'),
      anchor_y: integerConstant('WALL_ANCHOR_Y'),
      wall_height: integerConstant('WALL_HEIGHT'),
      base_apex: pointConstant('WALL_BASE_APEX'),
      base_left: pointConstant('WALL_BASE_LEFT'),
      base_right: pointConstant('WALL_BASE_RIGHT'),
    }).toEqual({
      width: frame.width,
      height: frame.height,
      anchor_x: frame.anchor_x,
      anchor_y: frame.anchor_y,
      wall_height: frame.wall_height,
      base_apex: frame.base_apex,
      base_left: frame.base_left,
      base_right: frame.base_right,
    });
  });
});
