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

// ── Send screenshot to Worker ──
async function sendToWorker(message, att) {
  try {
    const payload = {
      id:          message.id + '_' + att.id,
      content:     message.content,
      channel_id:  message.channel.id,
      channelId:   message.channel.id,
      timestamp:   message.createdAt.toISOString(),
      messageId:   message.id,
      author: {
        id:          message.author.id,
        username:    message.author.username,
        global_name: message.author.globalName || message.author.username,
      },
      authorId:   message.author.id,
      url:        att.url,
      proxyUrl:   att.proxyURL,
      filename:   att.name,
      attachments: [{
        id:           att.id,
        url:          att.url,
        proxy_url:    att.proxyURL,
        filename:     att.name,
        content_type: att.contentType || 'image/png',
        size:         att.size,
      }]
    };

    const headers = { 'Content-Type': 'application/json' };
    if (WORKER_SECRET) headers['X-Webhook-Secret'] = WORKER_SECRET;

    const res = await fetch(WORKER_URL + '/discord-webhook', {
      method: 'POST',
      headers,
      body:   JSON.stringify(payload),
    });
    return res.ok;
  } catch (err) {
    console.error('Blad wysylania do Workera:', err.message);
    return false;
  }
}

// ── Bot ready ──
client.once('clientReady', () => {
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

  console.log('Nowy screen od ' + message.author.username);

  for (const att of images) {
    const ok = await sendToWorker(message, att);
    if (ok) {
      console.log('Wyslano do Workera - ' + message.author.username);
      await message.react('✅').catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
