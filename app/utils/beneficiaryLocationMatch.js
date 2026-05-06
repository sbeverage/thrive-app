/**
 * Match filter "City, State" text to charity `location` strings (formatting varies in DB).
 */

const US_STATE_FULL_TO_ABBR = {
  alabama: 'al',
  alaska: 'ak',
  arizona: 'az',
  arkansas: 'ar',
  california: 'ca',
  colorado: 'co',
  connecticut: 'ct',
  delaware: 'de',
  florida: 'fl',
  georgia: 'ga',
  hawaii: 'hi',
  idaho: 'id',
  illinois: 'il',
  indiana: 'in',
  iowa: 'ia',
  kansas: 'ks',
  kentucky: 'ky',
  louisiana: 'la',
  maine: 'me',
  maryland: 'md',
  massachusetts: 'ma',
  michigan: 'mi',
  minnesota: 'mn',
  mississippi: 'ms',
  missouri: 'mo',
  montana: 'mt',
  nebraska: 'ne',
  nevada: 'nv',
  'new hampshire': 'nh',
  'new jersey': 'nj',
  'new mexico': 'nm',
  'new york': 'ny',
  'north carolina': 'nc',
  'north dakota': 'nd',
  ohio: 'oh',
  oklahoma: 'ok',
  oregon: 'or',
  pennsylvania: 'pa',
  'rhode island': 'ri',
  'south carolina': 'sc',
  'south dakota': 'sd',
  tennessee: 'tn',
  texas: 'tx',
  utah: 'ut',
  vermont: 'vt',
  virginia: 'va',
  washington: 'wa',
  'west virginia': 'wv',
  wisconsin: 'wi',
  wyoming: 'wy',
  'district of columbia': 'dc',
};

const US_STATE_ABBR_TO_FULL = Object.fromEntries(
  Object.entries(US_STATE_FULL_TO_ABBR).map(([full, abbr]) => [abbr, full]),
);

function padBlob(s) {
  return ` ${String(s).toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim()} `;
}

function tokenInPadded(tok, padded) {
  if (!tok || tok.length < 2) return true;
  const t = String(tok).toLowerCase();
  return padded.includes(` ${t} `);
}

function stateSegmentMatches(segment, padded) {
  const s = String(segment).trim().toLowerCase();
  if (!s || s.length < 2) return true;
  if (tokenInPadded(s, padded)) return true;
  const abbr = US_STATE_FULL_TO_ABBR[s];
  if (abbr && tokenInPadded(abbr, padded)) return true;
  const full = US_STATE_ABBR_TO_FULL[s];
  if (full && tokenInPadded(full, padded)) return true;
  return false;
}

/**
 * @param {string} [filterLoc]
 * @param {string} [beneficiaryLoc]
 */
export function beneficiaryLocationMatches(filterLoc, beneficiaryLoc) {
  const raw = filterLoc != null && String(filterLoc).trim();
  if (!raw) return true;
  if (!beneficiaryLoc || typeof beneficiaryLoc !== 'string') return false;

  const padded = padBlob(beneficiaryLoc);
  const bRaw = padded.trim();

  const fNorm = raw.toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  if (bRaw.includes(fNorm) || padded.includes(` ${fNorm} `)) return true;

  const commaParts = raw
    .split(',')
    .map((p) => p.trim().toLowerCase().replace(/\s+/g, ' '))
    .filter(Boolean);

  if (commaParts.length >= 2) {
    const stateSeg = commaParts[commaParts.length - 1];
    const citySeg = commaParts.slice(0, -1).join(' ');
    if (!stateSegmentMatches(stateSeg, padded)) return false;
    const cityTokens = citySeg.split(' ').filter((t) => t.length >= 2);
    if (cityTokens.length === 0) return true;
    return cityTokens.every(
      (t) => padded.includes(` ${t} `) || (t.length > 2 && bRaw.includes(t)),
    );
  }

  const tokens = fNorm.split(' ').filter((t) => t.length >= 2);
  if (tokens.length === 0) return true;
  return tokens.every(
    (t) =>
      stateSegmentMatches(t, padded) ||
      padded.includes(` ${t} `) ||
      (t.length > 2 && bRaw.includes(t)),
  );
}
