import type { ReactElement } from 'react';
import { RUN_CARD_BACKS, type RunCardBack } from '../../settings/appSettings';
import { RUN_CARD_BACK_LABELS } from '../../settings/runCardBack';
import { RunCardBack as RunCardBackImage, runCardBackMediaUrl } from '../RunCardBack';
import { InnerChromeBox } from './ChromeBox';
import { HouseSelect, type HouseSelectOption } from './HouseSelect';

// Settings → Gameplay → Card back: ONE card at a size the artwork actually reads at, and a
// dropdown that swaps it. This follows Grid style rather than a row of swatches, for the same
// reason: six backs sharing a settings row would each be a thumbnail the width of a thumbnail,
// and these are dense illustrations — a king, four knights, a ring of gems — that resolve into
// mush below a couple of hundred pixels. One large picture answers "what does it look like"; the
// closed dropdown answers "which am I on".
//
// The preview is the real RunCardBack component pointed at the real live-media slot, not a
// separate copy of the artwork. What the player judges here is the same object the Run deals.

/** One row per back. The menu only exists while open, so this is exported for the surface contract. */
export function runCardBackOptions(): HouseSelectOption<RunCardBack>[] {
  return RUN_CARD_BACKS.map((back) => ({
    value: back,
    title: RUN_CARD_BACK_LABELS[back].detail,
    label: (
      <span className="run-card-back-option">
        {/* A chip of the card itself. It is far too small to judge the design by — that is what the
            preview above is for — but it makes the list scannable by picture rather than by
            reading six proper nouns that all sound like each other. */}
        <span className="run-card-back-chip" aria-hidden="true">
          <img src={runCardBackMediaUrl(back)} alt="" draggable={false} />
        </span>
        {RUN_CARD_BACK_LABELS[back].label}
      </span>
    ),
  }));
}

export function RunCardBackPicker({
  value,
  onChange,
}: {
  value: RunCardBack;
  onChange: (back: RunCardBack) => void;
}): ReactElement {
  return (
    <div className="run-card-back-picker">
      {/* The registered inner frame, so the card is a framed sample on this panel rather than a
          bare rectangle floating on the settings surface. */}
      <InnerChromeBox as="span" className="run-card-back-preview-box">
        <span className="run-card-back-preview">
          <RunCardBackImage
            mediaUrl={runCardBackMediaUrl(value)}
            className="run-card-back-preview-card"
          />
        </span>
      </InnerChromeBox>
      <HouseSelect
        className="run-card-back-select"
        ariaLabel="Run card back"
        value={value}
        onChange={onChange}
        options={runCardBackOptions()}
      />
    </div>
  );
}
