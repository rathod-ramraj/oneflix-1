import { createRoot } from 'react-dom/client';
import { initDevToolsGuard } from './utils/devToolsGuard';
import { isBotClient } from './utils/botGuard';
import './utils/homeStore';
import App from './App.jsx';
import BotBlock from './components/BotBlock.jsx';

if (!isBotClient()) initDevToolsGuard();

const root = createRoot(document.getElementById('root'));
root.render(isBotClient() ? <BotBlock /> : <App />);
