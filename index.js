/**
 * NBA 2K Liga + KW5 Elite — Discord Screenshot Bot
 * KW5: Bot calls /kw5-analyze (Gemini runs in Worker synchronously),
 *      then sends matchData to /kw5-webhook for KV save.
 *      This avoids Cloudflare waitUntil() timeout issues.
 * NBA: unchanged — sends base64 to /discord-webhook as before.
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

const WORKER_URL     = process.env.WORKER_URL;
const CHANNEL_ID     = process.env.CHANNEL_ID;
const KW5_CHANNEL_ID = process.env.KW5_CHANNEL_ID;
const WORKER_SECRET  = process.env.WORKER_SECRET || '';

// ── helpers ───────────────────────────────────────────────────
async function fetchImageAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Cannot fetch image: ' + res.status);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}

function workerHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (WORKER_SECRET) h['X-Webhook-Secret'] = WORKER_SECRET;
  return h;
}

// ── KW5 flow ──────────────────────────────────────────────────
async function handleKw5Image(message, att) {
  const channelId  = message.channel.id;
  const messageId  = message.id;
  const author     = message.author.globalName || message.author.username;
  const authorId   = message.author.id;
  const timestamp  = message.createdAt.toISOString();
  const mimeType   = att.contentType || 'image/png';
  const filename   = att.name || 'screenshot.png';

  // 1. React ⏳ immediately
  await message.react('⏳').catch(() => {});

  try {
    // 2. Download image
    const imageBase64 = await fetchImageAsBase64(att.proxyURL || att.url);

    // 3. Call /kw5-analyze — Gemini runs synchronously in Worker, returns matchData
    console.log(`[KW5] Calling /kw5-analyze for ${filename}`);
    const analyzeRes = await fetch(WORKER_URL + '/kw5-analyze', {
      method: 'POST',
      headers: workerHeaders(),
      body: JSON.stringify({ imageBase64, mimeType, filename }),
    });

    if (!analyzeRes.ok) {
      const txt = await analyzeRes.text().catch(() => '');
      throw new Error(`/kw5-analyze failed ${analyzeRes.status}: ${txt.slice(0, 200)}`);
    }

    const { matchData } = await analyzeRes.json();
    if (!matchData) throw new Error('No matchData returned from /kw5-analyze');
    console.log(`[KW5] Gemini OK — ${matchData.team1?.name} vs ${matchData.team2?.name}`);

    // 4. Send matchData + metadata to /kw5-webhook for KV save (fast, no Gemini)
    const saveRes = await fetch(WORKER_URL + '/kw5-webhook', {
      method: 'POST',
      headers: workerHeaders(),
      body: JSON.stringify({
        matchData,
        messageId,
        channelId,
        timestamp,
        author,
        authorId,
        filename,
        mimeType,
        url: att.url,
        proxyUrl: att.proxyURL,
      }),
    });

    if (!saveRes.ok) {
      const txt = await saveRes.text().catch(() => '');
      throw new Error(`/kw5-webhook save failed ${saveRes.status}: ${txt.slice(0, 200)}`);
    }

    console.log(`[KW5] Saved OK — ${filename}`);
    // Reactions (⏳ remove + ✅) are handled by Worker after KV save

  } catch(err) {
    console.error(`[KW5] Error:`, err.message);
    // Remove ⏳ and add ❌
    const reactions = message.reactions.cache.get('⏳');
    if (reactions) await reactions.users.remove(client.user.id).catch(() => {});
    await message.react('❌').catch(() => {});
  }
}

// ── NBA flow (unchanged) ──────────────────────────────────────
async function handleNbaImage(message, att) {
  try {
    const imageBase64 = await fetchImageAsBase64(att.proxyURL || att.url);
    const payload = {
      imageBase64,
      mimeType:  att.contentType || 'image/png',
      url:       att.url,
      proxyUrl:  att.proxyURL,
      filename:  att.name || 'screenshot.png',
      messageId: message.id,
      channelId: message.channel.id,
      timestamp: message.createdAt.toISOString(),
      author:    message.author.globalName || message.author.username,
      authorId:  message.author.id,
    };

    const res = await fetch(WORKER_URL + '/discord-webhook', {
      method: 'POST',
      headers: workerHeaders(),
      body: JSON.stringify(payload),
    });

    console.log(`[NBA] Worker response:`, res.status);
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('Worker error:', txt.slice(0, 200));
      await message.react('❌').catch(() => {});
    }
  } catch(err) {
    console.error('[NBA] Error:', err.message);
    await message.react('❌').catch(() => {});
  }
}

// ── Discord events ────────────────────────────────────────────
client.once('ready', () => {
  console.log('Bot zalogowany jako ' + client.user.tag);
  console.log('NBA 2K kanał: ' + (CHANNEL_ID || 'NIE SKONFIGUROWANY'));
  console.log('KW5 kanał:    ' + (KW5_CHANNEL_ID || 'NIE SKONFIGUROWANY'));
});

client.on('messageCreate', async (message) => {
  const isNba = CHANNEL_ID     && message.channel.id === CHANNEL_ID;
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
    if (isKw5) {
      await handleKw5Image(message, att);
    } else {
      await handleNbaImage(message, att);
    }
    if (images.length > 1) await new Promise(r => setTimeout(r, 500));
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
