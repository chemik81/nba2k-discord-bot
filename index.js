/**
 * NBA 2K Liga — Discord Screenshot Bot
 * Monitors channel and forwards images to Cloudflare Worker
 * On startup: syncs screenshots from SYNC_FROM date
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
const SYNC_FROM     = new Date('2026-03-13T00:00:00.000Z');

console.log('=== START ===');
console.log('Token exists:', !!process.env.DISCORD_BOT_TOKEN);
console.log('Channel ID:', CHANNEL_ID);
console.log('Worker URL:', WORKER_URL);
console.log('Sync from:', SYNC_FROM.toISOString());

// ── Send screenshot to Worker ──
async function sendToWorker(message, att) {
  try {
    const payload = {
      id:          message.id + '_' + att.id,
      content:     message.content,
      channel_id:  message.channel.id,
      timestamp:   message.createdAt.toISOString(),
      author: {
        id:          message.author.id,
        username:    message.author.username,
        global_name: message.author.globalName || message.author.username,
      },
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

    const res = await fetch(`${WORKER_URL}/discord-webhook`, {
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

// ── Sync history from SYNC_FROM ──
async function syncHistory(channel) {
  console.log('Synchronizuje historie od ' + SYNC_FROM.toDateString() + '...');
  let synced = 0;
  let lastId = null;

  while (true) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;

    const messages = await channel.messages.fetch(options);
    if (messages.size === 0) break;

    const sorted = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    let allOld = true;

    for (const msg of sorted) {
      if (msg.createdAt < SYNC_FROM) continue;
      allOld = false;

      const images = [...msg.attachments.values()].filter(att =>
        att.contentType?.startsWith('image/') ||
        /\.(png|jpg|jpeg|webp|gif)$/i.test(att.name || '')
      );

      for (const att of images) {
        const ok = await sendToWorker(msg, att);
        if (ok) {
          synced++;
          console.log('  OK: ' + msg.author.username + ' - ' + att.name);
        }
        await new Promise(r => setTimeout(r, 150));
      }
    }

    if (allOld) break;
    lastId = messages.last()?.id;
    if (!lastId) break;
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('Synchronizacja zakonczona - ' + synced + ' screenshotow dodanych do kolejki');
}

// ── Bot ready ──
client.once('clientReady', async () => {
  console.log('Bot zalogowany jako ' + client.user.tag);
  console.log('Nasluchuję kanalu: ' + CHANNEL_ID);

  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (channel) {
      await syncHistory(channel);
    } else {
      console.error('Nie znaleziono kanalu:', CHANNEL_ID);
    }
  } catch (err) {
    console.error('Blad synchronizacji:', err.message);
  }
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

client.on('error', (err) => console.error('Discord error:', err));
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));

client.login(process.env.DISCORD_BOT_TOKEN);
