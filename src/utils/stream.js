import { API_PREFIX } from './config';

/** Proxy embed through backend for restricted networks */
export function proxiedEmbedUrl(providerUrl) {
  return `${API_PREFIX}/embed?url=${encodeURIComponent(providerUrl)}`;
}
