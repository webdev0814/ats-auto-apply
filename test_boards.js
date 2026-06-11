const boards = [
  'canonical', 'stripe', 'discord', 'reddit', 'dropbox', 'plaid', 'lyft', 'doordash', 'cloudflare',
  'airbnb', 'pinterest', 'twilio', 'github', 'gitlab', 'figma', 'notion', 'openai', 'anthropic', 'scaleai',
  'datadog', 'snowflake', 'asana', 'slack', 'peloton', 'instacart', 'robinhood', 'coinbase', 'kraken',
  'affirm', 'block', 'square', 'spotify', 'netflix', 'hulu', 'roblox', 'epicgames', 'unity', 'electronicarts',
  'take2', 'riotgames', 'bungie', 'valvesoftware', 'nintendo', 'sony', 'microsoft', 'apple', 'google', 'meta',
  'amazon', 'tesla', 'spacex', 'blueorigin', 'rivian', 'lucid', 'ford', 'gm', 'toyota', 'honda', 'nissan'
];

async function test() {
  let total = 0;
  for (const board of boards) {
    try {
      const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs`);
      if (!r.ok) continue;
      const data = await r.json();
      const match = data.jobs.filter(j => j.title.toLowerCase().includes('analyst'));
      if (match.length > 0) {
        console.log(`${board}: ${match.length} analyst jobs`);
        total += match.length;
      }
    } catch (e) {}
  }
  console.log(`Total: ${total}`);
}
test();
