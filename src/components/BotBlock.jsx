import { BOT_BLOCK_MESSAGE } from '../utils/botGuard';

export default function BotBlock() {
  return (
    <main className="bot-block">
      <p>{BOT_BLOCK_MESSAGE}</p>
    </main>
  );
}
