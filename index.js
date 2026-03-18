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
    GatewayIntentBits.GuildMessageReactions,
  ]
});

const WORKER_URL    = process.env.WORKER_URL;
const CHANNEL_ID    = process.env.CHANNEL_ID;
const WORKER_SECRET = process.env.WORKER_SECRET || '';

// ── Send one screenshot to Worker ──
async function sendToWorker(message, att) {
  try {
    const payload = {
      url:       att.url,
      proxyUrl:  att.proxyURL,
      filename:  att.name || 'screenshot.png',
      messageId: message.id,
      channelId: message.channel.id,
      timestamp: message.createdAt.toISOString(),
      author:    message.author.globalName || message.author.username,
      authorId:  message.author.id,
    };

    const headers = { 'Content-Type': 'application/json' };
    if (WORKER_SECRET) headers['X-Webhook-Secret'] = WORKER_SECRET;

    const res = await fetch(WORKER_URL + '/discord-webhook', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (err) {
    console.error('Blad wysylania do Workera:', err.message);
    return false;
  }
}

// ── Bot ready ──
client.once('ready', () => {
  console.log('Bot zalogowany jako ' + client.user.tag);
  console.log('Nasluchuję kanalu: ' + CHANNEL_ID);
});

// ── New messages ──
client.on('messageCreate', async (message) => {
  if (message.channel.id !== CHANNEL_ID) return;
  if (message.attachments.size === 0) return;

  const images = [...message.attachments.values()].filter(att =>
    att.contentType?.startsWith('image/') ||
    /\.(png|jpg|jpeg|webp|gif)$/i.test(att.name || '')
  );
  if (images.length === 0) return;

  console.log(`Nowy screen od ${message.author.username} — ${images.length} obrazek(ów)`);

  // Add ⏳ immediately to show processing
  await message.react('⏳').catch(() => {});

  let allOk = true;
  for (const att of images) {
    const ok = await sendToWorker(message, att);
    if (!ok) {
      allOk = false;
      console.error(`Blad wysylania screena ${att.name}`);
    } else {
      console.log(`Wyslano do Workera — ${att.name}`);
    }
    // Small delay between multiple images
    if (images.length > 1) await new Promise(r => setTimeout(r, 500));
  }

  // Remove ⏳ and add ✅ or ❌
  await message.reactions.cache.get('⏳')?.remove().catch(() => {});
  if (allOk) {
    await message.react('✅').catch(() => {});
  } else {
    await message.react('❌').catch(() => {});
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
