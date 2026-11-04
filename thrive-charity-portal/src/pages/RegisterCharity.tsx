/**
 * Add a charity that is not on THRIVE yet.
 *
 * Deliberately short. The vendor wizard is five steps because a vendor has
 * hours, a location and a first discount to configure; a charity has none of
 * that, and a long form is how you lose someone halfway. Images come after
 * this, on the profile, where the crop tools are.
 *
 * The preview beside the form updates as they type. "What you do" is the
 * profile's About text, and a plain textarea gives no sense of how much of it
 * a donor actually reads before the fold, or that the app cuts it at 60 words.
 * Showing it is cheaper than explaining it, and it is the same component the
 * profile page uses, so the two cannot drift apart.
 */
import React, { useState } from 'react';
import {
  Card, Form, Input, Button, Typography, Select, message, Alert, Row, Col,
} from 'antd';
import { useNavigate } from 'react-router-dom';
import { charityAPI, apiErrorMessage, apiErrorCode } from '../lib/api';
import { ProfileHeaderPreview } from '../components/CharityAppPreview';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// Matches the donor app's filter list.
const CATEGORIES = [
  'Animal Welfare', 'Childhood Illness', 'Education', 'Environment',
  'Food Insecurity', 'Health', 'Homelessness', 'Mental Health',
  'Veterans', 'Youth Development', 'Other',
];

const RegisterCharity: React.FC = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  // Live values for the preview. useWatch re-renders on every keystroke,
  // which is the point: the whole value of the preview is that it moves.
  const name = Form.useWatch('name', form);
  const category = Form.useWatch('category', form);
  const location = Form.useWatch('location', form);
  const about = Form.useWatch('about', form);

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
    <Row gutter={[24, 24]} style={{ maxWidth: 1120, margin: '24px auto' }} align="top">
      <Col xs={24} lg={13}>
        <Card>
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

          <Form form={form} layout="vertical" onFinish={onFinish}>
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
            <Form.Item
              name="about"
              label="What you do"
              extra="This becomes the About section on your profile. Donors see the first 60 words before they tap Read More, so lead with what you do and who it helps."
              rules={[{ required: true, message: 'A sentence or two is plenty.' }]}
            >
              <TextArea rows={5} placeholder="A couple of sentences a donor would understand straight away." />
            </Form.Item>
            <Button type="primary" size="large" htmlType="submit" loading={loading} block>
              Add charity
            </Button>
          </Form>
        </Card>
      </Col>

      <Col xs={24} lg={11}>
        <div
          style={{
            position: 'sticky',
            top: 24,
            padding: 20,
            background: '#EFF5F7',
            border: '1px solid #D9E7EC',
            borderRadius: 12,
          }}
        >
          <Text strong style={{ display: 'block', color: '#21555b' }}>
            Your profile, as you type
          </Text>
          <Text style={{ display: 'block', margin: '4px 0 14px', fontSize: 12, color: '#5B7680' }}>
            This is the page a donor lands on. Your photos come next, so the
            picture areas are empty for now.
          </Text>
          <div
            style={{
              padding: 6,
              background: '#fff',
              borderRadius: 16,
              border: '1px solid #E2ECEF',
              boxShadow: '0 6px 18px rgba(33, 85, 91, 0.10)',
              width: 'fit-content',
              maxWidth: '100%',
              overflowX: 'auto',
            }}
          >
            <ProfileHeaderPreview data={{ name, category, location, about }} />
          </div>
        </div>
      </Col>
    </Row>
  );
};

export default RegisterCharity;
