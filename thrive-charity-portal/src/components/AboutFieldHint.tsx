/**
 * The hint and live character count under "What you do".
 *
 * Replaces antd's `showCount`, which positions its counter absolutely at
 * bottom: -22px of the textarea, exactly where Form.Item renders `extra`.
 * The two overlapped. Laying both out in normal flow cannot collide however
 * long the hint wraps.
 *
 * It also says more than antd's counter can: that one only knows about
 * maxLength, so it cannot tell someone they are still short of the minimum,
 * which is the limit people actually hit.
 */
import React from 'react';
import { Typography } from 'antd';
import { ABOUT_MIN, ABOUT_MAX, ABOUT_HELP } from '../utils/aboutLimits';

const { Text } = Typography;

const AboutFieldHint: React.FC<{ value?: string | null }> = ({ value }) => {
  const length = String(value ?? '').trim().length;

  // Nothing typed yet: the count would just be noise beside a placeholder.
  const started = length > 0;
  const short = started && length < ABOUT_MIN;
  const over = length > ABOUT_MAX;

  const colour = short || over ? '#D4680A' : '#8c8c8c';

  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        alignItems: 'flex-start',
        justifyContent: 'space-between',
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>{ABOUT_HELP}</span>
      {started && (
        <Text
          style={{
            color: colour,
            fontSize: 12,
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
            paddingTop: 1,
          }}
        >
          {short ? `${ABOUT_MIN - length} to go` : `${length} / ${ABOUT_MAX}`}
        </Text>
      )}
    </div>
  );
};

export default AboutFieldHint;
