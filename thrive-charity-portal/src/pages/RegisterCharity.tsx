/**
 * Add a charity that is not on THRIVE yet.
 *
 * Deliberately short. The vendor wizard is five steps because a vendor has
 * hours, a location and a first discount to configure; a charity has none of
 * that, and a long form is how you lose someone halfway. Images come after
 * this, on the profile, where the previews are.
 */
import React, { useState } from 'react';
import { Card, Form, Input, Button, Typography, Select, message, Alert } from 'antd';
import { useNavigate } from 'react-router-dom';
import { charityAPI, apiErrorMessage, apiErrorCode } from '../lib/api';

const { Title, Paragraph } = Typography;
const { TextArea } = Input;

// Matches the donor app's filter list.
const CATEGORIES = [
  'Animal Welfare', 'Childhood Illness', 'Education', 'Environment',
  'Food Insecurity', 'Health', 'Homelessness', 'Mental Health',
  'Veterans', 'Youth Development', 'Other',
];

const RegisterCharity: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const onFinish = async (v: Record<string, string>) => {
    setLoading(true);
    try {
      await charityAPI.signup(v);
      message.success('Added. Now add your images and we will review it.');
      navigate('/profile', { replace: true });
    } catch (err) {
      if (apiErrorCode(err) === 'charity_exists') {
        // The EIN is already on THRIVE, so this was always a claim. Send them
        // back to the search rather than making them work it out.
        message.info(apiErrorMessage(err, 'That charity is already on THRIVE.'));
        navigate('/start');
        return;
      }
      message.error(apiErrorMessage(err, 'That did not save. Give it another try?'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card style={{ maxWidth: 600, margin: '24px auto' }}>
      <Title level={3} style={{ marginTop: 0 }}>Add your charity</Title>
      <Paragraph type="secondary">
        Just the basics for now. You will add photos and your story next, and
        nothing goes live to donors until we have reviewed it.
      </Paragraph>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 20 }}
        message="Your EIN has to match the IRS record"
        description="It is how we confirm you are a registered nonprofit, and how donors' receipts work."
      />

      <Form layout="vertical" onFinish={onFinish}>
        <Form.Item name="name" label="Charity name" rules={[{ required: true, message: 'We need your charity’s name.' }]}>
          <Input size="large" />
        </Form.Item>
        <Form.Item
          name="ein"
          label="EIN"
          rules={[
            { required: true, message: 'We need your EIN.' },
            {
              validator: (_, value) =>
                !value || String(value).replace(/\D/g, '').length === 9
                  ? Promise.resolve()
                  : Promise.reject(new Error('An EIN is nine digits.')),
            },
          ]}
        >
          <Input size="large" placeholder="12-3456789" />
        </Form.Item>
        <Form.Item name="category" label="What you work on" rules={[{ required: true, message: 'Pick the closest one.' }]}>
          <Select size="large" options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
        </Form.Item>
        <Form.Item name="location" label="City and state" rules={[{ required: true, message: 'We need your city.' }]}>
          <Input size="large" placeholder="Alpharetta, GA" />
        </Form.Item>
        <Form.Item name="website" label="Website">
          <Input size="large" placeholder="https://" />
        </Form.Item>
        <Form.Item name="phone" label="Phone">
          <Input size="large" />
        </Form.Item>
        <Form.Item name="about" label="What you do" rules={[{ required: true, message: 'A sentence or two is plenty.' }]}>
          <TextArea rows={4} placeholder="A couple of sentences a donor would understand straight away." />
        </Form.Item>
        <Button type="primary" size="large" htmlType="submit" loading={loading} block>
          Add charity
        </Button>
      </Form>
    </Card>
  );
};

export default RegisterCharity;
