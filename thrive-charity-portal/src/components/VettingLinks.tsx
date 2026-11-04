/**
 * Where a charity is independently vetted.
 *
 * This is the only thing that actually blocks submitting a profile. Images
 * and copy can be finished later; whether an organisation is in good standing
 * is the one question a reviewer cannot answer by looking at the profile, so
 * it has to be answered before the profile reaches them.
 *
 * The rule, enforced for real in charityPortal.ts: a Charity Navigator page
 * on its own, or pages on two of the other sites. Two links to the same site
 * count once, because a second page from one source is not a second opinion.
 *
 * Deliberately shows the accepted sites up front. A charity that does not
 * know which sites count will paste their own About page and be told no,
 * which is a worse experience than being told the answer first. Charity
 * Navigator only rates larger organisations, so the "two others" path is the
 * normal one for a small local charity rather than a fallback.
 */
import React, { useState } from 'react';
import { Card, Input, Button, Typography, Space, Tag, Alert, message } from 'antd';
import {
  LinkOutlined, DeleteOutlined, PlusOutlined, CheckCircleFilled,
} from '@ant-design/icons';
import { charityAPI, apiErrorMessage } from '../lib/api';
import type { VettingLink } from '../lib/api';

const { Text, Paragraph } = Typography;

/** Mirrors VETTING_SITES in charityPortal.ts. Shown, not enforced, here. */
const SITES = [
  { name: 'Charity Navigator', home: 'charitynavigator.org', strongest: true },
  { name: 'Candid (GuideStar)', home: 'guidestar.org' },
  { name: 'BBB Wise Giving Alliance', home: 'give.org' },
  { name: 'CharityWatch', home: 'charitywatch.org' },
];

interface Props {
  links: VettingLink[];
  problem: string | null;
  /** Called after a successful save so the page can re-read review state. */
  onSaved: () => void;
}

const VettingLinks: React.FC<Props> = ({ links, problem, onSaved }) => {
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (next: string[]) => {
    setSaving(true);
    try {
      await charityAPI.updateMe({ vettingLinks: next });
      onSaved();
      return true;
    } catch (err) {
      message.error(apiErrorMessage(err, 'That did not save. Give it another try?'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const add = async () => {
    const url = draft.trim();
    if (!url) return;
    if (await save([...links.map((l) => l.url), url])) setDraft('');
  };

  const remove = (url: string) => save(links.map((l) => l.url).filter((u) => u !== url));

  const covered = new Set(links.map((l) => l.host));

  return (
    <Card title="Where you are vetted">
      <Paragraph type="secondary" style={{ fontSize: 13 }}>
        We check every charity against an independent source before it goes
        live. Add your Charity Navigator page, or pages on two of the other
        sites below. This is the one thing we need before you can send your
        profile to us.
      </Paragraph>

      <Space size={[8, 8]} wrap style={{ marginBottom: 16 }}>
        {SITES.map((s) => (
          <Tag
            key={s.home}
            icon={covered.has(s.home) ? <CheckCircleFilled /> : undefined}
            color={covered.has(s.home) ? 'green' : 'default'}
          >
            {s.name}
            {s.strongest && !covered.has(s.home) && (
              <Text type="secondary" style={{ fontSize: 11 }}> (enough on its own)</Text>
            )}
          </Tag>
        ))}
      </Space>

      {links.length > 0 && (
        <Space direction="vertical" size={8} style={{ width: '100%', marginBottom: 16 }}>
          {links.map((l) => (
            <div
              key={l.url}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                background: '#F6F9FA',
                border: '1px solid #E2ECEF',
                borderRadius: 8,
              }}
            >
              <CheckCircleFilled style={{ color: '#389e0d' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text strong style={{ fontSize: 13, display: 'block' }}>{l.site}</Text>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  style={{ fontSize: 12, wordBreak: 'break-all' }}
                >
                  {l.url}
                </a>
              </div>
              <Button
                size="small"
                danger
                type="text"
                icon={<DeleteOutlined />}
                disabled={saving}
                onClick={() => remove(l.url)}
              >
                Remove
              </Button>
            </div>
          ))}
        </Space>
      )}

      <Space.Compact style={{ width: '100%' }}>
        <Input
          size="large"
          prefix={<LinkOutlined style={{ color: '#bbb' }} />}
          placeholder="https://www.charitynavigator.org/ein/123456789"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPressEnter={add}
        />
        <Button
          type="primary"
          size="large"
          icon={<PlusOutlined />}
          loading={saving}
          onClick={add}
        >
          Add
        </Button>
      </Space.Compact>

      {problem && (
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 14 }}
          message={problem}
        />
      )}
    </Card>
  );
};

export default VettingLinks;
