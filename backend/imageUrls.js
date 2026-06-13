/** Normalize TMDB / Amazon URLs to higher-quality variants */

export function upgradeTmdbUrl(url, size = 'w780') {
  if (!url || !String(url).includes('image.tmdb.org')) return url;
  return String(url).replace(/\/t\/p\/[^/]+\//, `/t/p/${size}/`);
}

export function upgradePosterUrl(url) {
  if (!url) return null;
  let u = String(url);
  if (u.includes('image.tmdb.org')) return upgradeTmdbUrl(u, 'w780');
  if (u.includes('m.media-amazon.com')) {
    u = u.replace(/\._V1_[A-Za-z0-9_,]+-\d+-\d+-\d+_\.jpg/i, '._V1_.jpg');
    u = u.replace(/\._V1_QL\d+[^.]+\.jpg/i, '._V1_.jpg');
  }
  return u;
}

export function upgradeBackdropUrl(url) {
  if (!url) return null;
  if (String(url).startsWith('/')) return url;
  return upgradeTmdbUrl(url, 'original');
}

export function imageFileKey(url) {
  if (!url) return '';
  try {
    const name = new URL(url, 'https://image.tmdb.org').pathname.split('/').pop() || '';
    return name.replace(/\.\w+$/, '');
  } catch {
    return '';
  }
}

export function isSameImageUrl(a, b) {
  const ka = imageFileKey(a);
  const kb = imageFileKey(b);
  return Boolean(ka && kb && ka === kb);
}

export function isDirectImageUrl(url) {
  if (!url || url === 'N/A') return false;
  const u = String(url);
  if (u.includes('unsplash.com/photo-1489599849927')) return false;
  return u.startsWith('http') || u.startsWith('/');
}
