export const LANGUAGES = [
  { id: 'english', label: 'English' },
  { id: 'hindi', label: 'Hindi' },
  { id: 'korean', label: 'Korean' },
  { id: 'spanish', label: 'Spanish' },
  { id: 'japanese', label: 'Japanese' },
  { id: 'tamil', label: 'Tamil' },
  { id: 'telugu', label: 'Telugu' },
];

const TITLE_MATCHES = {
  hindi: [
    'Jawan', 'Pathaan', 'Animal', 'RRR', 'KGF', 'Vikram', 'Leo', 'Pushpa', 'Kantara', 'Dhurandhar',
  ],
  korean: ['Parasite', 'Squid Game'],
  spanish: ['Money Heist'],
  japanese: ['Shogun'],
  tamil: ['Vikram', 'Leo'],
  telugu: ['Pushpa', 'RRR'],
};

const OTHER_LANG_IDS = Object.keys(TITLE_MATCHES);

function titleMatches(movie, needles) {
  const title = movie?.title || movie?.Title || '';
  return needles.some((n) => title.includes(n));
}

export function movieMatchesLanguage(movie, languageId) {
  if (!languageId) return true;
  if (languageId === 'english') {
    return !OTHER_LANG_IDS.some((id) => titleMatches(movie, TITLE_MATCHES[id]));
  }
  return titleMatches(movie, TITLE_MATCHES[languageId] || []);
}

export function languageLabel(languageId) {
  return LANGUAGES.find((l) => l.id === languageId)?.label || 'All Languages';
}
