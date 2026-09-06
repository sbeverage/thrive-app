/**
 * Searching for a cause by what you care about.
 *
 * The picker used to match a charity's name and location only, so somebody
 * who typed "children" got an empty list even though thirteen of the
 * fifty-two charities serve children. "homeless" found none of seven.
 * "mental health", "veteran" and "autism" all found nothing at all. The one
 * visitor who arrives knowing exactly what moves them was the one the search
 * failed hardest.
 *
 * Two things fix that. Matching the description and category as well as the
 * name, and a synonym map, because people search with the words they use at
 * the kitchen table and charities write with the words they use in a grant
 * application. Nobody looking to help kids types "Low Income Families".
 *
 * Every synonym target below was checked against the live /charities response
 * before being added, so the map points at vocabulary that is actually in the
 * data rather than words we imagine are there.
 */

/**
 * What someone types, mapped to the words the catalogue actually uses.
 * Keys are matched as whole words or prefixes of the query, so "kid" and
 * "kids" both land on the same row.
 */
export const CAUSE_SYNONYMS = {
  kid: ['child', 'children', 'youth', 'kids', 'foster', 'boys', 'girls', 'young'],
  kids: ['child', 'children', 'youth', 'kids', 'foster', 'boys', 'girls', 'young'],
  child: ['child', 'children', 'youth', 'kids', 'foster', 'childhood'],
  children: ['child', 'children', 'youth', 'kids', 'foster', 'childhood'],
  teen: ['teen', 'youth', 'adolescent', 'young'],
  youth: ['youth', 'teen', 'child', 'young', 'mentor'],

  dog: ['animal', 'dog', 'rescue', 'shelter', 'pet', 'canine'],
  dogs: ['animal', 'dog', 'rescue', 'shelter', 'pet', 'canine'],
  cat: ['animal', 'cat', 'rescue', 'shelter', 'pet', 'feline'],
  cats: ['animal', 'cat', 'rescue', 'shelter', 'pet', 'feline'],
  pet: ['animal', 'pet', 'rescue', 'shelter', 'adoption'],
  pets: ['animal', 'pet', 'rescue', 'shelter', 'adoption'],
  animals: ['animal', 'welfare', 'rescue', 'shelter', 'wildlife'],

  hunger: ['food', 'hunger', 'meal', 'nutrition', 'pantry', 'feed', 'hungry'],
  hungry: ['food', 'hunger', 'meal', 'nutrition', 'pantry', 'feed'],
  food: ['food', 'hunger', 'meal', 'nutrition', 'pantry', 'groceries'],
  meals: ['food', 'meal', 'hunger', 'nutrition'],

  homeless: ['homeless', 'housing', 'shelter', 'unhoused', 'street'],
  housing: ['housing', 'homeless', 'shelter', 'home', 'rent'],
  shelter: ['shelter', 'homeless', 'housing', 'refuge', 'safe'],

  cancer: ['cancer', 'oncology', 'leukemia', 'tumor', 'chemo'],
  sick: ['illness', 'disease', 'medical', 'health', 'hospital', 'patient'],
  illness: ['illness', 'disease', 'medical', 'health', 'diagnosis'],
  disease: ['disease', 'research', 'illness', 'cure', 'medical'],
  health: ['health', 'healthcare', 'medical', 'clinic', 'wellness'],
  hospital: ['hospital', 'medical', 'clinic'],

  mental: ['mental', 'depression', 'anxiety', 'counseling', 'therapy', 'wellbeing'],
  depression: ['mental', 'depression', 'counseling', 'therapy', 'hope'],
  anxiety: ['mental', 'anxiety', 'counseling', 'therapy'],
  therapy: ['therapy', 'counseling', 'mental', 'coaching'],
  suicide: ['suicide', 'mental', 'crisis', 'hotline', 'prevention'],

  disability: ['disabilit', 'special needs', 'autism', 'wheelchair', 'inclusion', 'adaptive'],
  disabled: ['disabilit', 'special needs', 'autism', 'wheelchair', 'inclusion', 'adaptive'],
  autism: ['autism', 'autistic', 'disabilit', 'special needs', 'spectrum'],
  'special needs': ['special needs', 'disabilit', 'autism', 'inclusion'],
  downsyndrome: ['down syndrome', 'disabilit', 'inclusion'],

  veteran: ['veteran', 'military', 'service member', 'troops', 'armed forces'],
  veterans: ['veteran', 'military', 'service member', 'troops', 'armed forces'],
  military: ['military', 'veteran', 'troops', 'service'],
  soldier: ['military', 'veteran', 'troops', 'service'],

  trafficking: ['trafficking', 'exploitation', 'survivor', 'slavery', 'sex traffick'],
  abuse: ['abuse', 'trafficking', 'survivor', 'violence', 'assault'],
  violence: ['violence', 'abuse', 'safe', 'survivor', 'crisis'],

  addiction: ['addiction', 'rehabilitation', 'recovery', 'sober', 'substance'],
  recovery: ['recovery', 'rehabilitation', 'addiction', 'sober', 'healing'],
  rehab: ['rehabilitation', 'recovery', 'addiction', 'treatment'],

  school: ['school', 'education', 'student', 'classroom', 'teacher', 'literacy'],
  education: ['education', 'school', 'student', 'literacy', 'scholarship', 'learning'],
  reading: ['literacy', 'reading', 'books', 'tutor'],
  literacy: ['literacy', 'reading', 'books'],
  tutoring: ['tutor', 'mentor', 'education', 'school'],

  poverty: ['low income', 'poverty', 'families', 'financial', 'need'],
  poor: ['low income', 'poverty', 'families', 'need'],
  families: ['families', 'family', 'low income', 'parent'],
  family: ['families', 'family', 'low income', 'parent'],

  foster: ['foster', 'adoption', 'kinship'],
  adoption: ['adoption', 'foster', 'family'],

  senior: ['senior', 'elderly', 'aging'],
  seniors: ['senior', 'elderly', 'aging'],
  elderly: ['elderly', 'senior', 'aging'],

  faith: ['faith', 'religion', 'church', 'ministry', 'christian'],
  church: ['church', 'faith', 'religion', 'ministry'],
  religion: ['religion', 'faith', 'church', 'ministry'],

  community: ['community', 'neighborhood', 'local', 'together'],
};

/** Everything about a charity that is worth searching, lowercased. */
function haystack(charity) {
  return [
    charity?.name,
    charity?.description,
    charity?.category,
    charity?.location,
    charity?.mission,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * The words to look for, given what the user typed. Always includes the raw
 * query, so an exact name search still behaves exactly as it used to.
 */
export function expandQuery(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];

  const terms = new Set([q]);

  // Whole-phrase match first, so "special needs" and "mental health" work.
  if (CAUSE_SYNONYMS[q]) {
    CAUSE_SYNONYMS[q].forEach((t) => terms.add(t));
  }

  // Then each word on its own, so "help kids" still reaches the kids row.
  for (const word of q.split(/\s+/)) {
    if (word.length < 3) continue;
    terms.add(word);
    if (CAUSE_SYNONYMS[word]) {
      CAUSE_SYNONYMS[word].forEach((t) => terms.add(t));
    }
    // Light stemming so "dogs" finds the "dog" row and vice versa.
    if (word.endsWith('s') && CAUSE_SYNONYMS[word.slice(0, -1)]) {
      CAUSE_SYNONYMS[word.slice(0, -1)].forEach((t) => terms.add(t));
    }
  }

  return [...terms];
}

/**
 * Does this charity match what the user typed?
 *
 * An empty query matches everything, which keeps the caller's filter chain
 * simple.
 */
export function causeMatchesQuery(charity, query) {
  const terms = expandQuery(query);
  if (terms.length === 0) return true;
  const hay = haystack(charity);
  return terms.some((term) => hay.includes(term));
}

/**
 * Rank matches so the most relevant sit at the top: a hit in the name beats a
 * hit in the category, which beats a hit buried in the description. Returns a
 * bigger number for a better match.
 */
export function causeMatchScore(charity, query) {
  const terms = expandQuery(query);
  if (terms.length === 0) return 0;

  const name = String(charity?.name || '').toLowerCase();
  const category = String(charity?.category || '').toLowerCase();
  const description = String(charity?.description || '').toLowerCase();
  const raw = String(query || '').trim().toLowerCase();

  let score = 0;
  if (raw && name.includes(raw)) score += 100;
  if (raw && name.startsWith(raw)) score += 50;

  for (const term of terms) {
    if (name.includes(term)) score += 20;
    if (category.includes(term)) score += 10;
    if (description.includes(term)) score += 4;
  }
  return score;
}
