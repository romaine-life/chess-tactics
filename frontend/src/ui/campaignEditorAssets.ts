import { assetById } from './design/catalogData';
import type { CSSProperties } from 'react';

const CAMPAIGN_EDITOR_ASSETS = {
  buttonDanger: 'button-9slice.campaign-editor.danger',
  buttonDangerPressed: 'button-9slice.campaign-editor.danger-pressed',
  buttonIcon: 'icon-button.campaign-editor.normal',
  buttonIconDanger: 'icon-button.campaign-editor.danger',
  buttonIconSelected: 'icon-button.campaign-editor.selected',
  buttonPrimary: 'button-9slice.campaign-editor.primary',
  buttonPrimaryPressed: 'button-9slice.campaign-editor.primary-pressed',
  fieldInput: 'field.campaign-editor.input',
  fieldSelect: 'field.campaign-editor.select',
  footerBar: 'panel-9slice.campaign-editor.footer-bar',
  panelCard: 'panel-9slice.campaign-editor.card',
  panelCrest: 'ornament.campaign-editor.panel-crest',
  panelLarge: 'panel-9slice.campaign-editor.large',
  previewFrame: 'panel-9slice.campaign-editor.preview-frame',
  rowCampaign: 'row.campaign-editor.campaign',
  rowCampaignSelected: 'row.campaign-editor.campaign-selected',
  rowLevel: 'row.campaign-editor.level',
  rowLevelSelected: 'row.campaign-editor.level-selected',
  shieldCrescent: 'shield.campaign-editor.crescent',
  shieldCrown: 'shield.campaign-editor.crown',
  shieldFlame: 'shield.campaign-editor.flame',
  shieldLion: 'shield.campaign-editor.lion',
  shieldRook: 'shield.campaign-editor.rook',
  shieldSnow: 'shield.campaign-editor.snow',
} as const;

type CampaignEditorAssetKey = keyof typeof CAMPAIGN_EDITOR_ASSETS;

export function campaignEditorAssetUrl(key: CampaignEditorAssetKey): string {
  const asset = assetById(CAMPAIGN_EDITOR_ASSETS[key]);
  return asset?.sheet?.image || asset?.source?.image || '';
}

export function campaignEditorAssetVars(): CSSProperties {
  return {
    '--ce-asset-button-danger': `url("${campaignEditorAssetUrl('buttonDanger')}")`,
    '--ce-asset-button-danger-pressed': `url("${campaignEditorAssetUrl('buttonDangerPressed')}")`,
    '--ce-asset-button-icon': `url("${campaignEditorAssetUrl('buttonIcon')}")`,
    '--ce-asset-button-icon-danger': `url("${campaignEditorAssetUrl('buttonIconDanger')}")`,
    '--ce-asset-button-icon-selected': `url("${campaignEditorAssetUrl('buttonIconSelected')}")`,
    '--ce-asset-button-primary': `url("${campaignEditorAssetUrl('buttonPrimary')}")`,
    '--ce-asset-button-primary-pressed': `url("${campaignEditorAssetUrl('buttonPrimaryPressed')}")`,
    '--ce-asset-field-input': `url("${campaignEditorAssetUrl('fieldInput')}")`,
    '--ce-asset-field-select': `url("${campaignEditorAssetUrl('fieldSelect')}")`,
    '--ce-asset-footer-bar': `url("${campaignEditorAssetUrl('footerBar')}")`,
    '--ce-asset-panel-card': `url("${campaignEditorAssetUrl('panelCard')}")`,
    '--ce-asset-panel-crest': `url("${campaignEditorAssetUrl('panelCrest')}")`,
    '--ce-asset-panel-large': `url("${campaignEditorAssetUrl('panelLarge')}")`,
    '--ce-asset-preview-frame': `url("${campaignEditorAssetUrl('previewFrame')}")`,
    '--ce-asset-row-campaign': `url("${campaignEditorAssetUrl('rowCampaign')}")`,
    '--ce-asset-row-campaign-selected': `url("${campaignEditorAssetUrl('rowCampaignSelected')}")`,
    '--ce-asset-row-level': `url("${campaignEditorAssetUrl('rowLevel')}")`,
    '--ce-asset-row-level-selected': `url("${campaignEditorAssetUrl('rowLevelSelected')}")`,
    '--ce-asset-shield-crescent': `url("${campaignEditorAssetUrl('shieldCrescent')}")`,
    '--ce-asset-shield-crown': `url("${campaignEditorAssetUrl('shieldCrown')}")`,
    '--ce-asset-shield-flame': `url("${campaignEditorAssetUrl('shieldFlame')}")`,
    '--ce-asset-shield-lion': `url("${campaignEditorAssetUrl('shieldLion')}")`,
    '--ce-asset-shield-rook': `url("${campaignEditorAssetUrl('shieldRook')}")`,
    '--ce-asset-shield-snow': `url("${campaignEditorAssetUrl('shieldSnow')}")`,
    '--ce-slice-button-danger': 'url("/assets/ui/campaign-editor/slice-button-danger.png")',
    '--ce-slice-button-primary': 'url("/assets/ui/campaign-editor/slice-button-primary.png")',
    '--ce-slice-button-primary-selected': 'url("/assets/ui/campaign-editor/slice-button-primary-selected.png")',
    '--ce-slice-row-panel': 'url("/assets/ui/campaign-editor/slice-row-panel.png")',
    '--ce-slice-row-panel-selected': 'url("/assets/ui/campaign-editor/slice-row-panel-selected.png")',
  } as CSSProperties;
}
