/**
 * Ask for access to a charity that is already on THRIVE.
 *
 * Collects the three things that are actually worth collecting: who they are,
 * what they do there, and a work email. None of it grants anything. The
 * request goes to the THRIVE team, and the domain check only decides how much
 * checking that takes.
 */
import React, { useState } from 'react';
import { Card, Form, Input, Button, Typography, Alert, message, Result } from 'antd';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { charityAPI, apiErrorMessage, apiErrorCode } from '../lib/api';

const { Title, Paragraph } = Typography;
const { TextArea } = Input;

const ClaimRequest: React.FC = () => {
  const { charityId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<{ domainVerified: boolean; message: string } | null>(null);

  const onFinish = async (v: Record<string, string>) => {
    setLoading(true);
    try {
      const res = await charityAPI.claim({ charityId: Number(charityId), ...v });
      setSent({ domainVerified: res.request.domainVerified, message: res.message });
    } catch (err) {
      const code = apiErrorCode(err);
      if (code === 'already_claimed' || code === 'request_pending' || code === 'already_manages') {
        // These are states, not failures. Say what is true and stop.
        message.info(apiErrorMessage(err, 'We could not send that request.'));
        navigate('/start');
        return;
      }
      message.error(apiErrorMessage(err, 'That did not send. Give it another try?'));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <Result
        status="success"
        title="Request sent"
        subTitle={sent.message}
        extra={[
          <Link key="p" to="/pending">
            <Button type="primary">See where it is up to</Button>
          </Link>,
        ]}
      />
    );
  }

  return (
    <Card style={{ maxWidth: 560, margin: '24px auto' }}>
      <Title level={3} style={{ marginTop: 0 }}>Ask for access</Title>
      <Paragraph type="secondary">
        Tell us who you are at the charity. Someone on the THRIVE team will
        check and get back to you.
      </Paragraph>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 20 }}
        message="A work email speeds this up"
        description="If your email is at the charity's own web address we can confirm it straight away. A personal address is fine, it just means we will check with the charity first."
      />

      <Form layout="vertical" onFinish={onFinish}>
        <Form.Item name="contactName" label="Your name" rules={[{ required: true, message: 'We need your name.' }]}>
          <Input size="large" />
        </Form.Item>
        <Form.Item
          name="contactTitle"
          label="Your role there"
          rules={[{ required: true, message: 'We need your role.' }]}
        >
          <Input size="large" placeholder="Executive Director, Development Manager, Volunteer..." />
        </Form.Item>
        <Form.Item name="workEmail" label="Work email" rules={[{ type: 'email', message: 'That email does not look right.' }]}>
          <Input size="large" placeholder="Leave blank to use the one you signed up with" />
        </Form.Item>
        <Form.Item name="contactPhone" label="Phone">
          <Input size="large" />
        </Form.Item>
        <Form.Item name="note" label="Anything else that helps us place you">
          <TextArea rows={3} placeholder="How you are connected to the charity" />
        </Form.Item>
        <Button type="primary" size="large" htmlType="submit" loading={loading} block>
          Send request
        </Button>
      </Form>
    </Card>
  );
};

export default ClaimRequest;
