// Weekly: reads recent sale news (Google News headlines) and asks Gemini which ones state an announced
// start date, then adds new sales to sales.json. The workflow then opens a pull request for a human to check and
// emails its link. Nothing is published without that merge.
//
// Env: GOOGLE_API_KEY (Gemini), GEMINI_MODEL (optional). Writes sales.json and prints a summary;
// exits 0 with "NO_CHANGES" on stdout when there is nothing new.
import { readFileSync, writeFileSync } from 'node:fs';

const SHOPS = {
  amazon: 'Amazon India',
  flipkart: 'Flipkart',
  myntra: 'Myntra',
  ajio: 'AJIO',
  nykaa: 'Nykaa',
  croma: 'Croma',
  reliance_digital: 'Reliance Digital',
  tata_cliq: 'Tata CLiQ',
  vijay_sales: 'Vijay Sales',
};
const MODELS = [process.env.GEMINI_MODEL, 'gemini-3.8-flash', 'gemini-3.5-flash'].filter(Boolean);
const today = new Date().toISOString().slice(0, 10);

// Free tier has no Google Search grounding, so the searching is done here: Google News headlines
// per shop (free, no key), and Gemini only reads them.
const QUERIES = {
  amazon: 'Amazon Great Indian Festival sale date',
  flipkart: 'Flipkart Big Billion Days sale date',
  myntra: 'Myntra sale date announced',
  ajio: 'AJIO sale date announced',
  nykaa: 'Nykaa sale date announced',
  croma: 'Croma sale date announced',
  reliance_digital: 'Reliance Digital sale date announced',
  tata_cliq: 'Tata CLiQ sale date announced',
  vijay_sales: 'Vijay Sales sale date announced',
};

async function headlines(q) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:30d`)}&hl=en-IN&gl=IN&ceid=IN:en`;
  const xml = await (await fetch(url, { headers: { 'user-agent': 'ruko-sales-bot (https://harsh-m-10.github.io/ruko-site/)' } })).text();
  const unescape = (t) => t.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8).map(([, item]) => ({
    title: unescape(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ''),
    link: unescape(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? ''),
    date: item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? '',
  }));
}

const news = [];
for (const [retailer, q] of Object.entries(QUERIES)) {
  for (const h of await headlines(q).catch(() => [])) news.push({ retailer, ...h });
}
console.error(`${news.length} headlines`);

const prompt = `Today is ${today}. Below are recent news headlines about online sales in India, one per line as
retailer | published | headline | link.
From them, list sales whose START DATE is stated as confirmed or announced by the shop (not "expected",
"likely", "predicted" or "could"), starting between today and 60 days from now. Prime/Plus early access is not a
separate sale. Use only what the headlines say; never guess a date.
Answer with only a JSON array, no prose, each item:
{"retailer": one of ${JSON.stringify(Object.keys(SHOPS))}, "name": "the sale's name",
 "starts": "YYYY-MM-DD", "ends": "YYYY-MM-DD or null", "source": "the link of the headline that states the date"}
Return [] if none.

${news.map((n) => `${n.retailer} | ${n.date} | ${n.title} | ${n.link}`).join('\n')}`;

async function ask(model) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GOOGLE_API_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0 } }),
  });
  if (!res.ok) throw new Error(`${model}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  const json = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1);
  return JSON.parse(json || '[]');
}

let found;
for (const m of MODELS) {
  try {
    found = await ask(m);
    console.error(`asked ${m}: ${found.length} sales`);
    break;
  } catch (e) {
    console.error(String(e));
  }
}
if (!found) {
  console.error('no model answered');
  found = [];
}

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const file = JSON.parse(readFileSync('sales.json', 'utf8'));
const known = new Set(file.sales.map((s) => `${s.retailer}|${s.starts}`));
const added = [];
for (const s of found) {
  if (!SHOPS[s.retailer] || !isDate(s.starts) || s.starts < today || typeof s.name !== 'string' || !/^https?:\/\//.test(s.source ?? '')) continue;
  if (known.has(`${s.retailer}|${s.starts}`)) continue;
  const sale = { id: `${s.retailer}-${slug(s.name)}-${s.starts.slice(0, 4)}`, retailer: s.retailer, name: s.name.trim(), starts: s.starts, ...(isDate(s.ends) ? { ends: s.ends } : {}) };
  if (file.sales.some((x) => x.id === sale.id)) continue;
  file.sales.push(sale);
  known.add(`${s.retailer}|${s.starts}`);
  added.push({ ...sale, source: s.source });
}

if (!added.length) {
  console.log('NO_CHANGES');
} else {
  file.updated = today;
  file.sales.sort((a, b) => a.starts.localeCompare(b.starts));
  writeFileSync('sales.json', `${JSON.stringify(file, null, 2)}\n`);
  writeFileSync('sales-summary.md', `Sales found by the weekly check (please verify each source before merging):\n\n${added.map((s) => `- **${s.name}** (${SHOPS[s.retailer]}): starts ${s.starts}${s.ends ? `, ends ${s.ends}` : ''}. Source: ${s.source}`).join('\n')}\n`);
  console.log(`ADDED ${added.length}`);
}
