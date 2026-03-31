import express from 'express';
import cors from 'cors';
import * as cheerio from 'cheerio';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// KRETS-KONFIGURASJON
// ============================================================
const KRETSER = [
  { name: 'Agder Fotballkrets',         d: 19 },
  { name: 'Rogaland Fotballkrets',      d: 9  },
  { name: 'Hordaland Fotballkrets',     d: 10 },
  { name: 'Vestfold Fotballkrets',      d: 7  },
  { name: 'Buskerud Fotballkrets',      d: 6  },
  { name: 'Oslo Fotballkrets',          d: 4  },
  { name: 'Akershus Fotballkrets',      d: 3  },
  { name: 'Østfold Fotballkrets',       d: 2  },
  { name: 'Indre Østland Fotballkrets', d: 5  },
  { name: 'Telemark Fotballkrets',      d: 8  },
];

const BASE_URL = 'https://www.fotball.no';

const TARGET_ROLES = [
  'trener', 'hovedtrener', 'a-lagstrener',
  'ass.trener', 'assistenttrener',
  'daglig leder', 'sportslig leder',
  'keepertrener', 'trenerveileder',
];

function matchesTargetRole(role) {
  const lower = role.toLowerCase().trim();
  return TARGET_ROLES.some(t => lower.includes(t));
}

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'nb-NO,nb;q=0.9,no;q=0.8,en;q=0.7',
};

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function decodeBase64(str) {
  if (!str) return '';
  try { return Buffer.from(str, 'base64').toString('utf-8'); }
  catch { return str; }
}

async function fetchContactInfo(personId, refererFiksId) {
  try {
    const res = await fetch(`${BASE_URL}/Person/GetObfuscatedInformation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': FETCH_HEADERS['User-Agent'],
        'Referer': `${BASE_URL}/fotballdata/klubb/personer/?fiksId=${refererFiksId}`,
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': BASE_URL,
      },
      body: JSON.stringify({ personId: String(personId) }),
    });
    if (!res.ok) return { email: '', phone: '' };
    const data = await res.json();
    return {
      email: decodeBase64(data.EmailObfuscated),
      phone: decodeBase64(data.MobilePhoneObfuscated),
    };
  } catch { return { email: '', phone: '' }; }
}

function parsePersonsFromHtml(html, clubName, clubFiksId) {
  const $ = cheerio.load(html);
  const persons = [];
  $('.a_contactPersonCard').each((_, el) => {
    const $card = $(el);
    const nameEl = $card.find('.contactName a').first();
    const name = nameEl.text().trim();
    if (!name) return;
    const personHref = nameEl.attr('href') || '';
    const personIdMatch = personHref.match(/fiksId=(\d+)/);
    const personFiksId = personIdMatch ? parseInt(personIdMatch[1], 10) : null;
    const roles = [];
    $card.find('.contactRoles li').each((_, li) => {
      const role = $(li).text().trim();
      if (role) roles.push(role);
    });
    const matchingRoles = roles.filter(matchesTargetRole);
    if (matchingRoles.length === 0) return;
    persons.push({ personName: name, personFiksId, roles: matchingRoles, clubName, clubFiksId, email: '', phone: '' });
  });
  return persons;
}

async function enrichWithContactInfo(persons, clubFiksId) {
  for (const person of persons) {
    if (!person.personFiksId) continue;
    const info = await fetchContactInfo(person.personFiksId, clubFiksId);
    person.email = info.email;
    person.phone = info.phone;
    await delay(80);
  }
  return persons;
}

function parseClubsFromHtml(html) {
  const $ = cheerio.load(html);
  const clubs = [];
  $('a[href*="fotballdata/klubb/hjem/?fiksId="]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href');
    const fiksIdMatch = href.match(/fiksId=(\d+)/);
    if (!fiksIdMatch) return;
    const clone = $el.clone();
    clone.find('script').remove();
    const name = clone.text().trim().replace(/\s+/g, ' ');
    if (name && name.length > 1 && !name.includes('$(') && !name.includes('function')) {
      clubs.push({ fiksId: parseInt(fiksIdMatch[1], 10), name });
    }
  });
  return [...new Map(clubs.map(c => [c.fiksId, c])).values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'nb'));
}

// ============================================================
// API ENDPOINTS (same paths as Vercel serverless functions)
// ============================================================
app.get('/api/scraper-kretser', (req, res) => {
  res.json(KRETSER);
});

app.get('/api/scraper-klubber', async (req, res) => {
  const { d } = req.query;
  if (!d) return res.status(400).json({ error: 'Mangler d-parameter' });
  try {
    const response = await fetch(`${BASE_URL}/fotballdata/klubb/?d=${d}`, { headers: FETCH_HEADERS });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    res.json(parseClubsFromHtml(html));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/scraper-personer', async (req, res) => {
  const { fiksId } = req.query;
  if (!fiksId) return res.status(400).json({ error: 'Mangler fiksId' });
  try {
    const response = await fetch(`${BASE_URL}/fotballdata/klubb/personer/?fiksId=${fiksId}`, { headers: FETCH_HEADERS });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const $ = cheerio.load(html);
    const clubName = $('h1').first().text().trim() || $('title').text().replace(/ - .*/, '').trim();
    const persons = parsePersonsFromHtml(html, clubName, parseInt(fiksId, 10));
    await enrichWithContactInfo(persons, fiksId);
    console.log(`[OK] ${clubName}: ${persons.length} kontakter`);
    res.json({ clubName, fiksId: parseInt(fiksId, 10), persons });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Fallback -> index.html
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  NFF Fotball Scraper: http://localhost:${PORT}\n`);
});
