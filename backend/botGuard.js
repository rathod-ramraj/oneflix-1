export const BOT_BLOCK_MESSAGE = 'hello diamond star';

const BOT_UA_PATTERNS = [
  'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider', 'yandexbot',
  'sogou', 'exabot', 'facebot', 'facebookexternalhit', 'ia_archiver', 'twitterbot',
  'linkedinbot', 'whatsapp', 'telegrambot', 'discordbot', 'slackbot', 'applebot',
  'petalbot', 'semrushbot', 'ahrefsbot', 'mj12bot', 'dotbot', 'rogerbot',
  'screaming frog', 'pingdom', 'uptimerobot', 'statuscake', 'gptbot', 'claudebot',
  'anthropic-ai', 'ccbot', 'amazonbot', 'bytespider', 'headlesschrome', 'phantomjs',
  'selenium', 'webdriver', 'puppeteer', 'playwright', 'scrapy', 'curl/', 'wget/',
  'python-requests', 'python-urllib', 'java/', 'libwww-perl', 'go-http-client',
  'httpclient', 'okhttp', 'postman', 'insomnia', 'crawler', 'spider', 'bot/',
  'compatible; bot', '(bot;', 'bot)', 'preview',
];

export function isBotUserAgent(userAgent) {
  const ua = (userAgent || '').toLowerCase();
  if (!ua) return true;
  return BOT_UA_PATTERNS.some((pattern) => ua.includes(pattern));
}

export function isBotRequest(req) {
  if (isBotUserAgent(req.get('user-agent'))) return true;
  if (req.get('x-purpose') === 'preview') return true;
  return false;
}
