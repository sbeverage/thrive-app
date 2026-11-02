/**
 * "Find your charity" — the single front door for both ways in.
 *
 * A charity that is already on THRIVE is a claim; one that is not is a new
 * registration. Nobody arriving here should have to know which of those they
 * are, so the search decides it. The same lookup also stops two people
 * creating two rows for one EIN, which is the reason it has to exist at all.
 */
import React, { useState } from 'react';
import {
  Card, Input, Button, Typography, List, Tag, Space, Empty, message, Alert,
} from 'antd';
import { SearchOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { charityAPI, apiErrorMessage } from '../lib/api';
import type { LookupMatch } from '../lib/api';

const { Title, Text, Paragraph } = Typography;

const FindCharity: React.FC = () => {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [matches, setMatches] = useState<LookupMatch[] | null>(null);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    const value = term.trim();
    if (!value) return;
    // Nine digits means they typed an EIN; anything else is a name.
    const digits = value.replace(/\D/g, '');
    const isEin = digits.length === 9;

    setLoading(true);
    try {
      const res = await charityAPI.lookup(isEin ? { ein: digits } : { q: value });
      setMatches(res.matches);
    } catch (err) {
      message.error(apiErrorMessage(err, 'That search did not run. Give it another try?'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card style={{ maxWidth: 720, margin: '24px auto' }}>
      <Title level={3} style={{ marginTop: 0 }}>Find your charity</Title>
      <Paragraph type="secondary">
        Search by EIN or by name. If your charity is already on THRIVE you can
        ask for access to it. If it is not, you can add it.
      </Paragraph>

      <Space.Compact style={{ width: '100%' }}>
        <Input
          size="large"
          placeholder="EIN or charity name"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onPressEnter={search}
          allowClear
        />
        <Button type="primary" size="large" icon={<SearchOutlined />} loading={loading} onClick={search}>
          Search
        </Button>
      </Space.Compact>

      {matches && matches.length > 0 && (
        <List
          style={{ marginTop: 24 }}
          itemLayout="horizontal"
          dataSource={matches}
          renderItem={(m) => (
            <List.Item
              actions={[
                m.isYours ? (
                  <Button type="link" onClick={() => navigate('/profile')}>
                    Open
                  </Button>
                ) : m.alreadyClaimed ? (
                  // Not offered as a button. Someone already manages it and
                  // this is a conversation, not a form.
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Already managed
                  </Text>
                ) : (
                  <Button type="primary" onClick={() => navigate(`/start/claim/${m.id}`)}>
                    This is us
                  </Button>
                ),
              ]}
            >
              <List.Item.Meta
                avatar={
                  m.logoUrl ? (
                    <img
                      src={m.logoUrl}
                      alt=""
                      style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#EEF2F4' }} />
                  )
                }
                title={
                  <Space size={8}>
                    {m.name}
                    {m.isYours && <Tag color="green">Yours</Tag>}
                  </Space>
                }
                description={
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {[m.ein, m.location].filter(Boolean).join(' · ') || 'No details on file'}
                  </Text>
                }
              />
            </List.Item>
          )}
        />
      )}

      {matches && matches.length === 0 && (
        <div style={{ marginTop: 24 }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="We could not find that one on THRIVE yet"
          />
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 12 }}
            message="Searching by EIN is more reliable"
            description="Names on file sometimes differ from the one you use day to day. Your nine digit EIN will find you if we have you."
          />
        </div>
      )}

      <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid #f0f0f0' }}>
        <Text strong style={{ display: 'block', marginBottom: 6 }}>
          Not on THRIVE yet?
        </Text>
        <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>
          Add your charity and we will review it before it goes live to donors.
        </Text>
        <Button icon={<PlusOutlined />} onClick={() => navigate('/start/new')}>
          Add your charity
        </Button>
      </div>
    </Card>
  );
};

export default FindCharity;
