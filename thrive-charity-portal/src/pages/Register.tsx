import React, { useState } from 'react';
import { Card, Form, Input, Button, Typography, message, Alert } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../lib/api';

const { Title, Text } = Typography;

const Register: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const onFinish = async (v: { email: string; password: string; firstName: string; lastName?: string }) => {
    setLoading(true);
    try {
      await register(v);
      navigate('/start', { replace: true });
    } catch (err) {
      message.error(apiErrorMessage(err, 'That did not create your account. Give it another try?'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card style={{ maxWidth: 460, margin: '48px auto' }}>
      <Title level={3} style={{ marginTop: 0 }}>Create your account</Title>
      <Text type="secondary">
        This is your personal sign in. You will connect it to your charity next.
      </Text>

      {/* Said here rather than at the claim step, because it changes which
          email someone picks, and by then it is too late to change it. */}
      <Alert
        type="info"
        showIcon
        style={{ marginTop: 16 }}
        message="Use your work email if you have one"
        description="An address at your charity's own domain lets us confirm you work there, which makes approval a lot quicker."
      />

      <Form layout="vertical" onFinish={onFinish} style={{ marginTop: 20 }}>
        <Form.Item name="firstName" label="First name" rules={[{ required: true, message: 'We need your first name.' }]}>
          <Input size="large" autoComplete="given-name" />
        </Form.Item>
        <Form.Item name="lastName" label="Last name">
          <Input size="large" autoComplete="family-name" />
        </Form.Item>
        <Form.Item name="email" label="Work email" rules={[{ required: true, type: 'email', message: 'We need a valid email.' }]}>
          <Input size="large" autoComplete="email" />
        </Form.Item>
        <Form.Item
          name="password"
          label="Password"
          rules={[{ required: true, min: 8, message: 'Use at least 8 characters.' }]}
        >
          <Input.Password size="large" autoComplete="new-password" />
        </Form.Item>
        <Button type="primary" size="large" htmlType="submit" loading={loading} block>
          Create account
        </Button>
      </Form>
      <Text style={{ display: 'block', marginTop: 16 }}>
        Already have one? <Link to="/login">Sign in</Link>
      </Text>
    </Card>
  );
};

export default Register;
