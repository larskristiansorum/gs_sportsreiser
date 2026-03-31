// Vercel serverless: GET /api/scraper-personer?fiksId=736
import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.fotball.no';
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'nb-NO,nb;q=0.9,no;q=0.8,en;q=0.7',
};

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
  } catch {
    return { email: '', phone: '' };
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default async function handler(req, res) {
  const { fiksId } = req.query;
  if (!fiksId) return res.status(400).json({ error: 'Mangler fiksId' });

  try {
    const url = `${BASE_URL}/fotballdata/klubb/personer/?fiksId=${fiksId}`;
    const response = await fetch(url, { headers: FETCH_HEADERS });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    const $ = cheerio.load(html);

    const clubName = $('h1').first().text().trim()
      || $('title').text().replace(/ - .*/, '').trim();

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

      persons.push({
        personName: name,
        personFiksId,
        roles: matchingRoles,
        clubName,
        clubFiksId: parseInt(fiksId, 10),
        email: '',
        phone: '',
      });
    });

    // Hent kontaktinfo for hver person
    for (const person of persons) {
      if (!person.personFiksId) continue;
      const info = await fetchContactInfo(person.personFiksId, fiksId);
      person.email = info.email;
      person.phone = info.phone;
      await delay(50);
    }

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    return res.status(200).json({ clubName, fiksId: parseInt(fiksId, 10), persons });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
