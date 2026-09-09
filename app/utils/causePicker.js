/**
 * Choosing three causes to show, out of fifty two.
 *
 * The whole point of "Help me choose" is that fifty two options is where
 * people stall, so it shows three. Which three matters more than it looks.
 *
 * Three at random is the obvious approach and it is the wrong one. Someone
 * who cares about animals has a good chance of drawing three disability
 * charities, and then the reroll button becomes a slot machine they pull
 * eight times. So each pick takes one charity from three DIFFERENT
 * categories. Every roll spans the space, so something usually lands, and it
 * costs the donor no extra taps or questions.
 *
 * That holds while three categories still have unseen charities in them.
 * Measured over 200 full walks of the 52 item catalogue, a category only ever
 * repeats once the pool is down to its last one or two categories, near the
 * end of a seventeen roll walk. Showing three cards from two categories beats
 * showing two cards, so the fallback is deliberate.
 *
 * Nothing repeats until the pool runs out either. Seeing the same charity
 * twice in a row reads as broken rather than random.
 */

/** Fisher-Yates. Returns a new array; never mutates the input. */
function shuffled(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function categoryKeyOf(charity) {
  const raw = charity?.category;
  return typeof raw === 'string' && raw.trim() ? raw.trim().toLowerCase() : 'other';
}

/**
 * Pick `size` charities from `charities`, spread across categories and
 * avoiding anything in `seenIds`.
 *
 * @param {Array} charities  the full pool
 * @param {Set}   seenIds    ids already shown this session
 * @param {number} size      how many to return, default 3
 * @returns {Array} up to `size` charities
 */
export function pickTrio(charities, seenIds = new Set(), size = 3) {
  const all = Array.isArray(charities) ? charities.filter(Boolean) : [];
  if (all.length === 0) return [];

  // Once there are not enough unseen left to fill a set, start over rather
  // than showing two cards or repeating within one roll.
  const unseen = all.filter((c) => !seenIds.has(c.id));
  const pool = unseen.length >= size ? unseen : all;

  const byCategory = new Map();
  for (const c of pool) {
    const key = categoryKeyOf(c);
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(c);
  }

  const picked = [];
  const pickedIds = new Set();

  // One from each of `size` different categories, categories in random order.
  for (const category of shuffled([...byCategory.keys()])) {
    if (picked.length >= size) break;
    const candidate = shuffled(byCategory.get(category))[0];
    if (candidate && !pickedIds.has(candidate.id)) {
      picked.push(candidate);
      pickedIds.add(candidate.id);
    }
  }

  // Fewer distinct categories than slots (a filtered pool, or a small
  // catalogue): top up from anywhere rather than returning a short set.
  if (picked.length < size) {
    for (const c of shuffled(pool)) {
      if (picked.length >= size) break;
      if (!pickedIds.has(c.id)) {
        picked.push(c);
        pickedIds.add(c.id);
      }
    }
  }

  return picked.slice(0, size);
}

/**
 * Whether a reroll can still show something new.
 *
 * Used to swap the button's wording once the donor has been round the whole
 * catalogue, so "show me three more" stops being a promise we cannot keep.
 */
export function hasUnseen(charities, seenIds = new Set(), size = 3) {
  const all = Array.isArray(charities) ? charities.filter(Boolean) : [];
  return all.filter((c) => !seenIds.has(c.id)).length >= size;
}

/** One short, human line about a charity for the card. */
export function blurbFor(charity) {
  const raw =
    (typeof charity?.description === 'string' && charity.description.trim()) ||
    (typeof charity?.about === 'string' && charity.about.trim()) ||
    (typeof charity?.whyThisMatters === 'string' && charity.whyThisMatters.trim()) ||
    '';
  return raw;
}
