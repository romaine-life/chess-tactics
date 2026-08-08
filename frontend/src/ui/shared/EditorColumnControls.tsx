import { type ComponentProps, type ReactElement } from 'react';
import { CHROME_LEAF_FILL_SURFACE } from './chromeSurfacePolicy';
import { SettingsButton, SettingsRow } from './SettingsControls';

/**
 * The Editor content column's chrome policy, stated once.
 *
 * The column's two materials are not decoration chosen per row: a STRUCTURAL box wears the
 * installed marble (borrowed from the outer role under its inner frame — ADR-0433), and every
 * TRIGGER wears oak. Left to each call site the column drifts one control at a time, which is
 * how it ended up a stack of tinted voids with unpainted buttons in it.
 *
 * `WarEditor` and `CampaignEditor` both render into that column, so both compose these instead
 * of the raw settings primitives. Rows outside the column (Settings, the Play selector) keep the
 * primitives' own defaults.
 */

/** The installed marble every structural box in the Editor column is painted with. */
export const EDITOR_COLUMN_BOX_FILL_ROLE = 'outer' as const;
/** The installed oak every clickable control in the Editor column is painted with. */
export const EDITOR_COLUMN_CONTROL_FILL_SURFACE = CHROME_LEAF_FILL_SURFACE;

export function EditorRow(props: ComponentProps<typeof SettingsRow>): ReactElement {
  return <SettingsRow fillRole={EDITOR_COLUMN_BOX_FILL_ROLE} {...props} />;
}

export function EditorButton(props: ComponentProps<typeof SettingsButton>): ReactElement {
  return <SettingsButton fillSurface={EDITOR_COLUMN_CONTROL_FILL_SURFACE} {...props} />;
}
