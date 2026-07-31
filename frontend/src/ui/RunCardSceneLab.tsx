import { useCallback, useState, type ReactElement } from 'react';
import { defaultBackgroundSet } from '../art/backgroundSets';
import { runCardName } from '../run/cardNames';
import { PIECE_BUNDLE_BY_ID, PIECE_BUNDLE_DECK, bundleLabel } from '../run/model';
import { RunBundleCard } from './RunBundleCard';
import { RunCardScene, RUN_CARD_SCENE_CAPTURE } from './RunCardScene';
import { OuterChromeBox, OuterChromeHeader } from './shared/ChromeBox';
import { useSceneParticipant } from './shell/SceneBoundary';

// The Run card art workshop at /studio?cardScenes=1 (a handoff-URL review surface, like
// the Run shop art review):
//   - no card param → the complete deck as real card faces, the side-by-side review batch;
//   - &card=<bundle-id> → that card's scene on the fixed capture stage. The default
//     'source' variant is the unit-less deterministic vignette `npm run shot` captures as
//     the img2img restyle input; &variant=live mounts the exact live card composition.
// The stage size and framing are the RUN_CARD_SCENE_CAPTURE contract: installed art is
// mounted back as a board-registered plate, so a restyle of this exact capture seats
// the runtime unit overlay precisely.

export function RunCardSceneLab(): ReactElement {
  const params = new URLSearchParams(window.location.search);
  const cardId = params.get('card');
  const bundle = cardId ? PIECE_BUNDLE_BY_ID[cardId] : null;
  const variant = params.get('variant') === 'live' ? 'live' : 'source';
  // A single capture stage reports honestly: the scene commits (and `npm run shot`
  // captures) only after both board canvas layers have painted their first frame.
  // The whole-deck gallery composes progressively like other Studio catalogs.
  const [paintedLayers, setPaintedLayers] = useState<{ terrain: boolean; scene: boolean }>({
    terrain: false,
    scene: false,
  });
  const [frameError, setFrameError] = useState<Error | null>(null);
  const onLayerFirstFrame = useCallback((layer: 'terrain' | 'scene') => {
    setPaintedLayers((current) => (current[layer] ? current : { ...current, [layer]: true }));
  }, []);
  const onFrameError = useCallback((error: unknown) => {
    setFrameError(error instanceof Error ? error : new Error(String(error)));
  }, []);
  const stageReady = !bundle || (paintedLayers.terrain && paintedLayers.scene);
  useSceneParticipant('studio', frameError ? 'error' : stageReady ? 'painted' : 'loading', frameError);

  return (
    <main
      className="run-relic-review-screen skirmish-screen"
      style={{ ['--skirmish-world-bg' as string]: `url("${defaultBackgroundSet().world}")` }}
    >
      <OuterChromeBox chromeConsumer="run-card-scene-lab" titled className="run-card-scene-lab-panel">
        <OuterChromeHeader title="Run Card Scenes" />
        {cardId && !bundle ? (
          <p role="alert">Unknown card id “{cardId}”. The deck ids are the piece initials, e.g. “ppb”.</p>
        ) : bundle ? (
          <>
            <p data-card-id={bundle.id}>
              <strong>{runCardName(bundle)}</strong> — {bundleLabel(bundle)} — {variant === 'source' ? 'art-generation source (units withheld)' : 'live card composition'}
            </p>
            <div
              className="run-card-capture-stage"
              data-testid="run-card-capture-stage"
              style={{
                blockSize: `${RUN_CARD_SCENE_CAPTURE.height}px`,
                inlineSize: `${RUN_CARD_SCENE_CAPTURE.width}px`,
              }}
            >
              <RunCardScene
                bundle={bundle}
                variant={variant}
                camera={RUN_CARD_SCENE_CAPTURE.camera}
                onLayerFirstFrame={onLayerFirstFrame}
                onFrameError={onFrameError}
              />
            </div>
          </>
        ) : (
          <>
            <p>The complete {PIECE_BUNDLE_DECK.length}-card deck as its live faces. Append <code>&amp;card=&lt;id&gt;</code> for one card&apos;s capture stage.</p>
            <div className="run-card-grid run-card-lab-grid" aria-label="Every deck card">
              {PIECE_BUNDLE_DECK.map((deckBundle) => (
                <RunBundleCard key={deckBundle.id} bundle={deckBundle} mode="reference" />
              ))}
            </div>
          </>
        )}
      </OuterChromeBox>
    </main>
  );
}
