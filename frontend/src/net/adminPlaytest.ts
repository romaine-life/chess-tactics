import { HttpError } from './http';
import type { RunRelicId } from '../run/model';

export type AdminPlaytestAction =
  | 'free-move'
  | 'kill-unit'
  | 'win-battle'
  | 'gain-gold'
  | 'gain-relic';

export type AdminPlaytestDetails =
  | { action: 'free-move' | 'kill-unit' | 'win-battle' }
  | { action: 'gain-gold'; amountTenths: number }
  | { action: 'gain-relic'; relicId: RunRelicId; targetUnitId?: string };

export async function authorizeAdminPlaytest(details: AdminPlaytestDetails): Promise<void> {
  const response = await fetch('/api/admin/playtest/authorize', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(details),
  });
  if (!response.ok) throw await HttpError.fromResponse('authorize-admin-playtest', response);
}
