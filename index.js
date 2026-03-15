/**
 * NBA 2K Liga — Discord Screenshot Bot
 * Monitors #screeny-meczow channel and forwards images to Cloudflare Worker
 *
 * Environment variables (set in Railway dashboard):
 *   DISCORD_BOT_TOKEN   — Bot token from Discord Developer Portal
 *   WORKER_URL          — https://kw5-elite-proxy.igor-bernakiewicz.workers.dev
 *   CHANNEL_ID          — ID kanału #screeny-meczow
 *   WORKER_SECRET       — (opcjonalne) tajny klucz weryfikacji, ustaw też w Cloudflare jako DISCORD_WEBHOOK_SECRET
 */

const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // wymaga włączenia w Discord Developer Portal
  ]
});

const WORKER_URL    = process.env.WORKER_URL;
const CHANNEL_ID    = process.env.CHANNEL_ID;
const WORKER_SECRET = process.env.WORKER_SECRET || '';

client.once('ready', () => {
  console.log(`✅ Bot zalogowany jako ${client.user.tag}`);
  console.log(`📡 Nasłuchuję kanału: ${CHANNEL_ID}`);
});

client.on('messageCreate', async (message) => {
  // Ignoruj inne kanały
  if (message.channel.id !== CHANNEL_ID) return;

  // Ignoruj wiadomości bez załączników
  if (message.attachments.size === 0) return;

  // Filtruj tylko obrazki
  const images = message.attachments.filter(att =>
    att.contentType?.startsWith('image/') ||
    /\.(png|jpg|jpeg|webp|gif)$/i.test(att.name || '')
  );

  if (images.size === 0) return;

  console.log(`📸 Nowy screen od ${message.author.username} — ${images.size} obrazek(ów)`);

  // Wyślij do Cloudflare Worker
  try {
    const payload = {
      id:          message.id,
      content:     message.content,
      channel_id:  message.channel.id,
      timestamp:   message.createdAt.toISOString(),
      author: {
        id:           message.author.id,
        username:     message.author.username,
        global_name:  message.author.globalName || message.author.username,
      },
      attachments: images.map(att => ({
        id:           att.id,
        url:          att.url,
        proxy_url:    att.proxyURL,
        filename:     att.name,
        content_type: att.contentType || 'image/png',
        size:         att.size,
      }))
    };

    const headers = { 'Content-Type': 'application/json' };
    if (WORKER_SECRET) headers['X-Webhook-Secret'] = WORKER_SECRET;

    const res = await fetch(`${WORKER_URL}/discord-webhook`, {
      method:  'POST',
      headers,
      body:    JSON.stringify(payload),
    });

    if (res.ok) {
      console.log(`✅ Wysłano do Workera — ${message.author.username}`);
      // Opcjonalne: dodaj reakcję żeby kapitan wiedział że screen dotarł
      await message.react('✅').catch(() => {});
    } else {
      console.error(`❌ Worker odpowiedział: ${res.status}`);
    }
  } catch (err) {
    console.error('❌ Błąd wysyłania do Workera:', err.message);
  }
});

// Obsługa błędów
client.on('error', (err) => console.error('Discord error:', err));
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));

client.login(process.env.DISCORD_BOT_TOKEN);
