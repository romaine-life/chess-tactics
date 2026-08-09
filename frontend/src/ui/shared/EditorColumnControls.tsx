import { CHROME_LEAF_FILL_SURFACE, CHROME_STRUCTURAL_FILL_ROLE } from './chromeSurfacePolicy';
import { SettingsButton, SettingsRow } from './SettingsControls';

/**
 * The Editor content column's chrome names, pointing at the one shared policy.
 *
 * The column's two materials are not decoration chosen per row: a STRUCTURAL box wears the
 * installed marble (borrowed from the outer role under its inner frame — ADR-0433), and every
 * TRIGGER wears oak. That rule now lives on the settings primitives themselves, so `EditorRow`
 * and `EditorButton` are the same components under the names the Editor call sites use — and
 * a row or button that is added here, in Settings, or anywhere else is painted by default
 * rather than one control at a time.
 *
 * The two constants remain because controls that are NOT settings primitives — an `IconButton`,
 * a `ChromeNavButton`, an `ActionList` item — still name the material they take.
 */

/** The installed marble every structural box in the Editor column is painted with. */
export const EDITOR_COLUMN_BOX_FILL_ROLE = CHROME_STRUCTURAL_FILL_ROLE;
/** The installed oak every clickable control in the Editor column is painted with. */
export const EDITOR_COLUMN_CONTROL_FILL_SURFACE = CHROME_LEAF_FILL_SURFACE;

export { SettingsRow as EditorRow, SettingsButton as EditorButton };
