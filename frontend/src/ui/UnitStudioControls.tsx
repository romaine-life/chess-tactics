import { useEffect, useState, type ReactElement } from 'react';
import { fetchAdminUnitCatalog } from '../net/unitAssets';
import { currentLiveUnitCatalog, type LiveUnitCatalog, type UnitAsset } from './unitCatalog';
import { UnitAssetManager } from './UnitAssetManager';
import type { UnitArtPreview } from './UnitRecaptureEditor';
import { UnitSizeControls } from './UnitSizeControls';

export function UnitStudioControls({
  selectedUnit,
  onSelectUnit,
  onCatalogChanged,
  onArtPreview,
}: {
  selectedUnit: UnitAsset;
  onSelectUnit: (unitId: string) => void;
  onCatalogChanged: () => void;
  onArtPreview: (preview: UnitArtPreview | null) => void;
}): ReactElement {
  const [catalog, setCatalog] = useState<LiveUnitCatalog | null>(() => currentLiveUnitCatalog());
  const [canAdminister, setCanAdminister] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchAdminUnitCatalog()
      .then((next) => {
        if (cancelled) return;
        setCatalog(next);
        setCanAdminister(true);
        onCatalogChanged();
      })
      .catch(() => { if (!cancelled) setCanAdminister(false); });
    return () => { cancelled = true; };
  }, [onCatalogChanged]);

  const commitCatalog = (next: LiveUnitCatalog): void => {
    setCatalog(next);
    onCatalogChanged();
  };

  return (
    <>
      <UnitSizeControls
        catalog={canAdminister ? catalog : null}
        unit={selectedUnit}
        onCatalogChange={commitCatalog}
      />
      {canAdminister && catalog ? (
        <UnitAssetManager
          catalog={catalog}
          selectedUnit={selectedUnit}
          onCatalogChange={commitCatalog}
          onSelectUnit={onSelectUnit}
          onArtPreview={onArtPreview}
        />
      ) : null}
    </>
  );
}
