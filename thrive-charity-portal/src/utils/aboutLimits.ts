/**
 * Length limits for a charity's "What you do" text.
 *
 * MIRRORS the server. The real check lives in
 *   supabase/functions/api/routes/charityPortal.ts  (ABOUT_MIN / ABOUT_MAX)
 * and these two numbers have to match it, or the form will either accept text
 * the API then rejects, or block text the API would have taken.
 *
 * Both come from the 53 charities already on THRIVE, whose About text runs
 * 224 to 839 characters (median 563): the floor rejects a one-line answer
 * without excluding anyone real, and the ceiling sits above the longest
 * existing entry, so no charity is locked out of saving by a limit that
 * arrived after they wrote their copy.
 */
export const ABOUT_MIN = 150;
export const ABOUT_MAX = 1000;

/** The hint under the field, so both pages word it the same way. */
export const ABOUT_HELP =
  `This becomes the About section on your profile. Donors read the first 60 ` +
  `words before they tap Read More, so lead with what you do and who it ` +
  `helps. Between ${ABOUT_MIN} and ${ABOUT_MAX} characters.`;

/**
 * antd validation rules for the About field.
 *
 * `required` is false on the profile page: an older charity editing its phone
 * number should not be stopped by copy it wrote before these limits existed.
 */
export function aboutRules(required: boolean) {
  return [
    ...(required
      ? [{ required: true, message: 'Tell donors what you do. A couple of sentences is plenty.' }]
      : []),
    {
      validator: (_: unknown, value: unknown) => {
        const text = String(value ?? '').trim();
        if (!text) return Promise.resolve();
        if (text.length < ABOUT_MIN) {
          return Promise.reject(
            new Error(
              `${ABOUT_MIN - text.length} characters short. Around two sentences is the right length.`,
            ),
          );
        }
        if (text.length > ABOUT_MAX) {
          return Promise.reject(
            new Error(`${text.length - ABOUT_MAX} characters over. Trim it to what a donor needs first.`),
          );
        }
        return Promise.resolve();
      },
    },
  ];
}
