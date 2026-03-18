/**
 * NBA 2K Liga — Discord Screenshot Bot
 * Downloads image and sends base64 to Worker for AI analysis
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
const CHANNEL_ID    = process.env.CHANNEL_ID;
const WORKER_SECRET = process.env.WORKER_SECRET || '';

async function sendToWorker(message, att) {
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

    const res = await fetch(WORKER_URL + '/discord-webhook', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    console.log('Worker odpowiedz:', res.status);
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
  console.log('Nasluchuję kanalu: ' + CHANNEL_ID);
});

client.on('messageCreate', async (message) => {
  if (message.channel.id !== CHANNEL_ID) return;
  if (message.attachments.size === 0) return;

  const images = [...message.attachments.values()].filter(att =>
    att.contentType?.startsWith('image/') ||
    /\.(png|jpg|jpeg|webp|gif)$/i.test(att.name || '')
  );
  if (images.length === 0) return;

  console.log(`Nowy screen od ${message.author.username} — ${images.length} obrazek(ów)`);

  for (const att of images) {
    const ok = await sendToWorker(message, att);
    if (ok) {
      console.log(`Wyslano do Workera — ${att.name}`);
    } else {
      console.error(`Blad wysylania — ${att.name}`);
      await message.react('❌').catch(() => {});
    }
    if (images.length > 1) await new Promise(r => setTimeout(r, 300));
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
