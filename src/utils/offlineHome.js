import { catalog } from './movieCatalog';
import { buildClientRows } from './catalogRows';

let snapshot = null;

export function getOfflineHome() {
  if (!snapshot) snapshot = buildClientRows(catalog);
  return snapshot?.rows?.length ? snapshot : null;
}
