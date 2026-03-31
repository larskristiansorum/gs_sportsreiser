// Vercel serverless: GET /api/scraper-klubber?d=4
import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.fotball.no';
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'nb-NO,nb;q=0.9,no;q=0.8,en;q=0.7',
};

export default async function handler(req, res) {
  const { d } = req.query;
  if (!d) return res.status(400).json({ error: 'Mangler d-parameter' });

  try {
    const url = `${BASE_URL}/fotballdata/klubb/?d=${d}`;
    const response = await fetch(url, { headers: FETCH_HEADERS });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
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

    const unique = [...new Map(clubs.map(c => [c.fiksId, c])).values()]
      .sort((a, b) => a.name.localeCompare(b.name, 'nb'));

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    return res.status(200).json(unique);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
