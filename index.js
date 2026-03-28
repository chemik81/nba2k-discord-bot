/**
 * NBA 2K Liga + KW5 Elite — Discord Screenshot Bot
 * Downloads image and sends base64 to Worker for AI analysis
 * Supports two channels: NBA 2K Liga and KW5 Elite
 */
const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ]
});

const WORKER_URL    = process.env.WORKER_URL;
const CHANNEL_ID    = process.env.CHANNEL_ID;        // NBA 2K Liga channel
const KW5_CHANNEL_ID = process.env.KW5_CHANNEL_ID;  // KW5 Elite channel
const WORKER_SECRET = process.env.WORKER_SECRET || '';

async function sendToWorker(message, att, isKw5 = false) {
  try {
    // Download image locally (bot has access, worker doesn't)
    const imgRes = await fetch(att.proxyURL || att.url);
    if (!imgRes.ok) throw new Error('Cannot fetch image: ' + imgRes.status);
    const buffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mimeType = att.contentType || 'image/png';

    const payload = {
      imageBase64: base64,
      mimeType:    mimeType,
      url:         att.url,
      proxyUrl:    att.proxyURL,
      filename:    att.name || 'screenshot.png',
      messageId:   message.id,
      channelId:   message.channel.id,
      timestamp:   message.createdAt.toISOString(),
      author:      message.author.globalName || message.author.username,
      authorId:    message.author.id,
    };

    const headers = { 'Content-Type': 'application/json' };
    if (WORKER_SECRET) headers['X-Webhook-Secret'] = WORKER_SECRET;

    // Different endpoint for KW5 vs NBA 2K Liga
    const endpoint = isKw5 ? '/kw5-webhook' : '/discord-webhook';

    const res = await fetch(WORKER_URL + endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    console.log(`[${isKw5 ? 'KW5' : 'NBA'}] Worker odpowiedz:`, res.status);
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('Worker error:', txt.slice(0, 200));
    }
    return res.ok;
  } catch (err) {
    console.error('Blad wysylania do Workera:', err.message);
    return false;
  }
}

client.once('ready', () => {
  console.log('Bot zalogowany jako ' + client.user.tag);
  console.log('NBA 2K kanał: ' + CHANNEL_ID);
  console.log('KW5 kanał:    ' + (KW5_CHANNEL_ID || 'NIE SKONFIGUROWANY'));
});

client.on('messageCreate', async (message) => {
  const isNba = message.channel.id === CHANNEL_ID;
  const isKw5 = KW5_CHANNEL_ID && message.channel.id === KW5_CHANNEL_ID;

  if (!isNba && !isKw5) return;
  if (message.attachments.size === 0) return;

  const images = [...message.attachments.values()].filter(att =>
    att.contentType?.startsWith('image/') ||
    /\.(png|jpg|jpeg|webp|gif)$/i.test(att.name || '')
  );
  if (images.length === 0) return;

  const league = isKw5 ? 'KW5' : 'NBA';
  console.log(`[${league}] Nowy screen od ${message.author.username} — ${images.length} obrazek(ów)`);

  for (const att of images) {
    const ok = await sendToWorker(message, att, isKw5);
    if (ok) {
      console.log(`[${league}] Wyslano do Workera — ${att.name}`);
    } else {
      console.error(`[${league}] Blad wysylania — ${att.name}`);
      await message.react('❌').catch(() => {});
    }
    if (images.length > 1) await new Promise(r => setTimeout(r, 300));
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
