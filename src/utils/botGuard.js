import { BOT_BLOCK_MESSAGE } from './botGuard.shared.js';

export { BOT_BLOCK_MESSAGE };

export function isBotClient() {
  if (import.meta.env.DEV) return false;

  const ua = (navigator.userAgent || '').toLowerCase();
  if (!ua) return true;

  const botPatterns = [
    'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider', 'yandexbot',
    'facebookexternalhit', 'twitterbot', 'linkedinbot', 'telegrambot', 'discordbot',
    'slackbot', 'applebot', 'gptbot', 'claudebot', 'ccbot', 'amazonbot', 'bytespider',
    'headlesschrome', 'phantomjs', 'selenium', 'webdriver', 'puppeteer', 'playwright',
    'scrapy', 'curl/', 'wget/', 'python-requests', 'crawler', 'spider', 'bot/',
    'compatible; bot', '(bot;', 'bot)', 'preview',
  ];
  if (botPatterns.some((p) => ua.includes(p))) return true;

  if (navigator.webdriver) return true;
  if (/headless/i.test(ua)) return true;

  return false;
}
