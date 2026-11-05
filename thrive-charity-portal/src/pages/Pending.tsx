/**
 * Where a request for charity access is up to.
 *
 * The rejected branch is the one that matters. A turned-down request used to
 * render as a name and the word "rejected" and nothing else, which is a dead
 * end on an account that can still do three useful things: ask again with
 * better detail, go after a different charity, or add one that is not in the
 * catalogue yet. The server has always allowed all three, because the unique
 * index covers pending rows only and a rejected row does not block a new
 * request. Only the screen was missing.
 *
 * Status words are never shown raw. "rejected" next to a charity's own name
 * reads as a judgement on the charity rather than on one person's request.
 */
import React, { useEffect, useState } from 'react';
import { Card, Typography, Spin, Tag, Space, Button, Alert, Divider } from 'antd';
import { Link } from 'react-router-dom';
import { charityAPI } from '../lib/api';
import type { AccessRequest } from '../lib/api';

const { Title, Paragraph, Text } = Typography;

/** Published on the account deletion pages, so it is already the public one. */
const SUPPORT_EMAIL = 'support@jointhriveinitiative.org';

/** Matches the labels on the profile page. Nothing shows a raw status value. */
const STATUS: Record<AccessRequest['status'], { colour: string; label: string }> = {
  pending: { colour: 'blue', label: 'Being reviewed' },
  approved: { colour: 'green', label: 'Approved' },
  rejected: { colour: 'orange', label: 'Not approved' },
};

const Pending: React.FC = () => {
  const [request, setRequest] = useState<AccessRequest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    charityAPI
      .me()
      .then((r) => setRequest(r.request ?? null))
      .catch(() => setRequest(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={{ display: 'grid', placeItems: 'center', minHeight: '40vh' }}><Spin /></div>;
  }

  if (!request) {
    return (
      <Card style={{ maxWidth: 560, margin: '24px auto' }}>
        <Title level={4} style={{ marginTop: 0 }}>Nothing pending</Title>
        <Paragraph type="secondary">You have not asked for access to a charity yet.</Paragraph>
        <Link to="/start"><Button type="primary">Find your charity</Button></Link>
      </Card>
    );
  }

  const status = STATUS[request.status] ?? STATUS.pending;
  const charityName = request.charity?.name ?? 'Your request';
  const charityId = request.charity?.id ?? null;

  const supportLink =
    `mailto:${SUPPORT_EMAIL}` +
    `?subject=${encodeURIComponent(`Charity access for ${charityName}`)}` +
    `&body=${encodeURIComponent(
      `Hi THRIVE team,\n\nI asked for access to ${charityName} and it was not approved. ` +
      `Could you help me sort it out?\n\n`,
    )}`;

  return (
    <Card style={{ maxWidth: 560, margin: '24px auto' }}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Space>
          <Title level={4} style={{ margin: 0 }}>{charityName}</Title>
          <Tag color={status.colour}>{status.label}</Tag>
        </Space>

        {request.status === 'pending' && (
          <Paragraph type="secondary" style={{ margin: 0 }}>
            {request.domainVerified
              ? 'Your email is at the charity’s own web address, so this should be quick.'
              : 'We will check with the charity and come back to you.'}
          </Paragraph>
        )}

        {request.status === 'approved' && (
          <Link to="/profile"><Button type="primary">Open your profile</Button></Link>
        )}

        {request.status === 'rejected' && (
          <>
            <Alert
              type="warning"
              showIcon
              message="We could not approve this one"
              description={
                request.rejectionReason ||
                'We could not confirm you work at this charity. Get in touch and we will talk it through.'
              }
            />

            <Paragraph type="secondary" style={{ margin: 0 }}>
              This is not the end of the road. You can ask again with more
              detail, look for a different charity, or add one that is not on
              THRIVE yet.
            </Paragraph>

            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              {charityId !== null && (
                <Link to={`/start/claim/${charityId}`} style={{ display: 'block' }}>
                  <Button type="primary" size="large" block>
                    Ask again for {charityName}
                  </Button>
                </Link>
              )}
              <Link to="/start" style={{ display: 'block' }}>
                <Button size="large" block>Find a different charity</Button>
              </Link>
              <Link to="/start/new" style={{ display: 'block' }}>
                <Button size="large" block>Add a charity that is not listed</Button>
              </Link>
            </Space>

            <Divider style={{ margin: '4px 0' }} />

            <Text type="secondary" style={{ fontSize: 13 }}>
              Stuck, or think this was a mistake?{' '}
              <a href={supportLink}>Email the THRIVE team</a> and we will sort it out.
            </Text>
          </>
        )}
      </Space>
    </Card>
  );
};

export default Pending;
