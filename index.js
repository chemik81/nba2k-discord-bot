/**
 * NBA 2K Liga — Discord Screenshot Bot
 * Monitors channel and forwards images to Cloudflare Worker
 */

const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

const WORKER_URL    = process.env.WORKER_URL;
const CHANNEL_ID    = process.env.CHANNEL_ID;
const WORKER_SECRET = process.env.WORKER_SECRET || '';

// Debug — sprawdź czy zmienne są dostępne
console.log('=== START ===');
console.log('Token exists:', !!process.env.DISCORD_BOT_TOKEN);
console.log('Channel ID:', CHANNEL_ID);
console.log('Worker URL:', WORKER_URL);

client.once('ready', () => {
  console.log(`✅ Bot zalogowany jako ${client.user.tag}`);
  console.log(`📡 Nasłuchuję kanału: ${CHANNEL_ID}`);
});

client.on('messageCreate', async (message) => {
  if (message.channel.id !== CHANNEL_ID) return;
  if (message.attachments.size === 0) return;

  const images = message.attachments.filter(att =>
    att.contentType?.startsWith('image/') ||
    /\.(png|jpg|jpeg|webp|gif)$/i.test(att.name || '')
  );

  if (images.size === 0) return;

  console.log(`📸 Nowy screen od ${message.author.username} — ${images.size} obrazek(ów)`);

  try {
    const payload = {
      id:          message.id,
      content:     message.content,
      channel_id:  message.channel.id,
      timestamp:   message.createdAt.toISOString(),
      author: {
        id:          message.author.id,
        username:    message.author.username,
        global_name: message.author.globalName || message.author.username,
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
      method: 'POST',
      headers,
      body:   JSON.stringify(payload),
    });

    if (res.ok) {
      console.log(`✅ Wysłano do Workera — ${message.author.username}`);
      await message.react('✅').catch(() => {});
    } else {
      console.error(`❌ Worker odpowiedział: ${res.status}`);
    }
  } catch (err) {
    console.error('❌ Błąd wysyłania do Workera:', err.message);
  }
});

client.on('error', (err) => console.error('Discord error:', err));
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));

client.login(process.env.DISCORD_BOT_TOKEN);
