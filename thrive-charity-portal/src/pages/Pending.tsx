import React, { useEffect, useState } from 'react';
import { Card, Typography, Spin, Tag, Space, Button, Alert } from 'antd';
import { Link } from 'react-router-dom';
import { charityAPI } from '../lib/api';
import type { AccessRequest } from '../lib/api';

const { Title, Paragraph } = Typography;

/** Where a request is up to. Shown instead of an empty profile. */
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

  return (
    <Card style={{ maxWidth: 560, margin: '24px auto' }}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Space>
          <Title level={4} style={{ margin: 0 }}>{request.charity?.name ?? 'Your request'}</Title>
          <Tag color={request.status === 'pending' ? 'orange' : request.status === 'approved' ? 'green' : 'red'}>
            {request.status === 'pending' ? 'With the THRIVE team' : request.status}
          </Tag>
        </Space>

        {request.status === 'pending' && (
          <Paragraph type="secondary" style={{ margin: 0 }}>
            {request.domainVerified
              ? 'Your email is at the charity’s own web address, so this should be quick.'
              : 'We will check with the charity and come back to you.'}
          </Paragraph>
        )}

        {request.status === 'rejected' && request.rejectionReason && (
          <Alert type="warning" showIcon message="Not approved" description={request.rejectionReason} />
        )}

        {request.status === 'approved' && (
          <Link to="/profile"><Button type="primary">Open your profile</Button></Link>
        )}
      </Space>
    </Card>
  );
};

export default Pending;
