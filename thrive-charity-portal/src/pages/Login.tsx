import React, { useState } from 'react';
import { Card, Form, Input, Button, Typography, message } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../lib/api';

const { Title, Text } = Typography;

const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const onFinish = async (v: { email: string; password: string }) => {
    setLoading(true);
    try {
      await login(v.email, v.password);
      navigate('/profile', { replace: true });
    } catch (err) {
      message.error(apiErrorMessage(err, 'That did not sign you in. Check the details and try again?'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card style={{ maxWidth: 420, margin: '48px auto' }}>
      <Title level={3} style={{ marginTop: 0 }}>Welcome back</Title>
      <Text type="secondary">Sign in to manage your charity's profile.</Text>
      <Form layout="vertical" onFinish={onFinish} style={{ marginTop: 20 }}>
        <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'We need your email.' }]}>
          <Input size="large" autoComplete="email" />
        </Form.Item>
        <Form.Item name="password" label="Password" rules={[{ required: true, message: 'We need your password.' }]}>
          <Input.Password size="large" autoComplete="current-password" />
        </Form.Item>
        <Button type="primary" size="large" htmlType="submit" loading={loading} block>
          Sign in
        </Button>
      </Form>
      <Text style={{ display: 'block', marginTop: 16 }}>
        New here? <Link to="/register">Create an account</Link>
      </Text>
    </Card>
  );
};

export default Login;
