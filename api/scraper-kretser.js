// Vercel serverless: GET /api/scraper-kretser
export default function handler(req, res) {
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

  res.setHeader('Cache-Control', 's-maxage=86400');
  return res.status(200).json(KRETSER);
}
