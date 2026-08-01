import { type ReactElement } from 'react';
import { ChoiceGroup } from '../shared/ChoiceGroup';
import { ICON_TREATS, type IconTreat } from './iconTreat';
import { SliderRow, ctlReset } from './SliderRow';

export type HoverSlide = 'off' | '6' | '10';

export function IconTreatmentControl({
  value,
  onChange,
  lighten,
  onLighten,
}: {
  value: IconTreat;
  onChange: (value: IconTreat) => void;
  lighten: number;
  onLighten: (value: number) => void;
}): ReactElement {
  return (
    <>
      <div className="tileset-filter-field">
        <span>Icon contrast</span>
        <div className="pages-ctl-row">
          <ChoiceGroup value={value} options={ICON_TREATS.map((option) => ({ value: option.id, label: option.label }))} onChange={onChange} ariaLabel="Icon contrast treatment" />
          {ctlReset(() => { onChange('off'); onLighten(1.85); })}
        </div>
      </div>
      {value === 'limestone' ? (
        <SliderRow label={<>Lighten · {lighten.toFixed(2)}×</>} value={lighten} set={onLighten} min={1} max={2.6} step={0.05} nudge={0.05} dflt={1.85} />
      ) : null}
    </>
  );
}

export function HoverSlideControl({
  value,
  onChange,
}: {
  value: HoverSlide;
  onChange: (value: HoverSlide) => void;
}): ReactElement {
  return (
    <div className="tileset-filter-field">
      <span>Hover slide</span>
      <div className="pages-ctl-row">
        <ChoiceGroup
          value={value}
          options={[
            { value: 'off', label: 'Off' },
            { value: '6', label: '6px' },
            { value: '10', label: '10px' },
          ]}
          onChange={onChange}
          ariaLabel="Hover slide"
        />
        {ctlReset(() => onChange('off'))}
      </div>
    </div>
  );
}
