/**
 * A charity logo that degrades to a placeholder instead of a gap.
 *
 * Measured 2026-09-14 across all 52 charities: six logos do not load at all.
 * Four of those are Google favicon URLs (`google.com/s2/favicons?domain=...`)
 * where that service now answers 404, and two are direct site URLs answering
 * 404 and 403. Thirty of the fifty-two depend on Google's favicon service, so
 * this list grows on its own whenever that service stops resolving a domain,
 * with nothing changing on our side.
 *
 * `resolveBeneficiaryLogoSource` already falls back to the placeholder when a
 * charity is pending verification, but it cannot know that a URL it returns is
 * going to 404. Only the Image can know that, which is why this needs to be a
 * component with state rather than another branch in the resolver.
 *
 * Deliberately not a retry: a 404 is not a transient failure, and retrying it
 * on every render would spend a donor's data confirming the same answer.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Image } from 'react-native';
import { resolveBeneficiaryLogoSource } from '../context/BeneficiaryContext';

const PLACEHOLDER = require('../../assets/images/pending-charity-logo.png');

export default function CharityLogo({
  charity,
  style,
  resizeMode = 'contain',
  ...rest
}) {
  const resolved = resolveBeneficiaryLogoSource(charity);
  const [failed, setFailed] = useState(false);

  // A different charity in the same slot (the trio rerolls in place, lists
  // recycle rows) must get a fresh chance to load. Without this, one broken
  // logo would poison the slot for every charity shown after it.
  const key = charity?.id ?? charity?.name ?? null;
  useEffect(() => {
    setFailed(false);
  }, [key]);

  const onError = useCallback(() => {
    setFailed(true);
  }, []);

  const source = !resolved || failed ? PLACEHOLDER : resolved;

  return (
    <Image
      source={source}
      style={style}
      resizeMode={resizeMode}
      onError={onError}
      {...rest}
    />
  );
}
