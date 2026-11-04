/**
 * The charity's own profile: their images, their words, and a live preview of
 * how both land in the donor app.
 *
 * The preview is the point of the page, not decoration. A charity cropping a
 * logo cannot otherwise know that the app draws it as a circle over the bottom
 * left of their cover, or that the list card is square while the cover is
 * wide. Showing it is cheaper than explaining it.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Card, Typography, Row, Col, Form, Input, Select, Button, Spin, Alert,
  Tag, Space, message, Divider, Modal, Tooltip,
} from 'antd';
import { EyeOutlined, SaveOutlined, SendOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { charityAPI, apiErrorMessage } from '../lib/api';
import type { CharityMe, ReviewState } from '../lib/api';
import ImageCropUpload from '../components/ImageCropUpload';
import CharityAppPreview from '../components/CharityAppPreview';
import { ABOUT_MAX, aboutRules } from '../utils/aboutLimits';
import AboutFieldHint from '../components/AboutFieldHint';
import VettingLinks from '../components/VettingLinks';
import GalleryPhotos from '../components/GalleryPhotos';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const CATEGORIES = [
  'Animal Welfare', 'Childhood Illness', 'Education', 'Environment',
  'Food Insecurity', 'Health', 'Homelessness', 'Mental Health',
  'Veterans', 'Youth Development', 'Other',
];

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [charity, setCharity] = useState<CharityMe | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Watched rather than read off `charity`, so editing "What you do" in the
  // details form below moves the preview before anything is saved.
  const aboutDraft = Form.useWatch('about', form);

  const load = useCallback(async () => {
    try {
      const res = await charityAPI.me();
      if (!res.charity) {
        // No charity yet: either they have asked for one, or they have not
        // started. Pending handles both and says which.
        navigate(res.request ? '/pending' : '/start', { replace: true });
        return;
      }
      setCharity(res.charity);
      setReview(res.review ?? null);
      form.setFieldsValue({
        name: res.charity.name,
        category: res.charity.category,
        about: res.charity.about,
        website: res.charity.website,
        phone: res.charity.phone,
        location: res.charity.location,
        contactName: res.charity.contactName,
      });
    } catch (err) {
      message.error(apiErrorMessage(err, 'We could not load your profile. Give it another try?'));
    } finally {
      setLoading(false);
    }
  }, [form, navigate]);

  useEffect(() => { load(); }, [load]);

  const onSave = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      const { charity: updated } = await charityAPI.updateMe(values);
      setCharity(updated);
      message.success('Saved.');
    } catch (err) {
      message.error(apiErrorMessage(err, 'That did not save. Give it another try?'));
    } finally {
      setSaving(false);
    }
  };

  /** Images save themselves on upload, so just fold the new URL into state. */
  const onImage = (key: 'logoUrl' | 'highlightUrl' | 'imageUrl') => (url: string) =>
    setCharity((c) => (c ? { ...c, [key]: url } : c));

  const missing = review?.missing ?? [];

  /**
   * Only a draft or a rejection has anything to send.
   *
   * Live is excluded because submitting a published profile would pull it
   * back out of the app, which is never what the button means to the person
   * pressing it. Already-pending is excluded because it would do nothing: a
   * reviewer reads the row as it stands and edits save immediately, so there
   * is no newer version to hand over, and a prominent "Submit for review" on
   * something already submitted only invites a second press.
   */
  /**
   * Anything not yet live can be sent, including one already waiting.
   *
   * This used to exclude the pending state, on the reasoning that a charity
   * in the queue has nothing new to hand over. Vetting made that wrong: a
   * charity that reached the queue before the links were required, or whose
   * row was stamped by hand, sits pending with no links and, under the old
   * rule, no button and no vetting card either. Nothing to press and nothing
   * to fix. Live is still excluded, since submitting a published profile
   * would pull it back out of the app.
   */
  const canSubmit = !!review && !review.liveToDonors;
  // Shown but disabled rather than hidden: a missing button raises "how do I
  // send this?", a disabled one with a reason answers it.
  const submitBlocked = !review?.vettingOk;

  const statusTag = review?.liveToDonors
    ? { colour: 'green', label: 'Live to donors' }
    : review?.rejectedAt
    ? { colour: 'orange', label: 'Needs a change' }
    : review?.isDraft
    ? { colour: 'default', label: 'Draft' }
    // "With the THRIVE team" read like a partnership badge sitting next to a
    // charity's name rather than a status. This says what is happening.
    : { colour: 'blue', label: 'Being reviewed' };

  const sendForReview = async () => {
    setSubmitting(true);
    try {
      const r = await charityAPI.submitForReview();
      message.success(r.message);
      await load();
    } catch (err) {
      message.error(apiErrorMessage(err, 'That did not send. Give it another try?'));
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * An incomplete profile is worth a pause, not a block. They know things we
   * do not, and a charity held hostage by a missing website field is a charity
   * that gives up. So: name what is missing, and let them decide.
   */
  const onSubmitForReview = () => {
    if (missing.length === 0 || review?.rejectedAt) {
      sendForReview();
      return;
    }
    Modal.confirm({
      title: 'Send it as it is?',
      okText: 'Send it anyway',
      cancelText: 'Keep working on it',
      content: (
        <>
          <Paragraph style={{ marginBottom: 8 }}>
            These are still empty, and donors see all of them:
          </Paragraph>
          <ul style={{ margin: '0 0 12px 18px', padding: 0 }}>
            {missing.map((m) => <li key={m}>{m}</li>)}
          </ul>
          <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 0 }}>
            You can send it now and add the rest later, or finish first. Either
            way you can keep editing after you send.
          </Paragraph>
        </>
      ),
      onOk: sendForReview,
    });
  };

  if (loading) {
    return <div style={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }}><Spin size="large" /></div>;
  }
  if (!charity) return null;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Space align="start" style={{ justifyContent: 'space-between', width: '100%' }} wrap>
          <div>
            <Title level={3} style={{ margin: 0 }}>{charity.name}</Title>
            <Text type="secondary">{[charity.category, charity.location].filter(Boolean).join(' · ')}</Text>
          </div>

          <Space align="center" size={12} wrap>
            {review && (
              <Tag color={statusTag.colour} style={{ fontSize: 13, padding: '4px 10px', marginInlineEnd: 0 }}>
                {statusTag.label}
              </Tag>
            )}
            {canSubmit && (
              <Tooltip title={submitBlocked ? review?.vettingProblem : ''}>
                <Button
                  type="primary"
                  size="large"
                  icon={<SendOutlined />}
                  loading={submitting}
                  disabled={submitBlocked}
                  onClick={onSubmitForReview}
                >
                  {review?.rejectedAt
                    ? 'Send back for review'
                    : review?.isDraft
                    ? 'Submit for review'
                    : 'Send updates'}
                </Button>
              </Tooltip>
            )}
          </Space>
        </Space>

        {review?.isDraft && !review.rejectedAt && (
          <Alert
            style={{ marginTop: 16 }}
            type="info"
            showIcon
            message="This is yours to work on. Nobody is reviewing it yet."
            description={
              <>
                Add your images and your story, take as long as you like, then
                press Submit for review. Nothing goes in front of the THRIVE
                team until you do, and you can keep editing afterwards.
                {missing.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <Text strong style={{ fontSize: 13 }}>Still to add: </Text>
                    <Text style={{ fontSize: 13 }}>{missing.join(', ')}</Text>
                  </div>
                )}
              </>
            }
          />
        )}

        {review && !review.isDraft && !review.liveToDonors && !review.rejectedAt && (
          <Alert
            style={{ marginTop: 16 }}
            type="info"
            showIcon
            message="We are reviewing it"
            description={
              review.vettingOk
                ? 'We are looking at your profile and will come back to you. You can keep editing in the meantime; we will see the latest version.'
                : 'Before we can finish, we need to see where you are independently vetted. Add a link below and send it across.'
            }
          />
        )}

        {review?.rejectedAt && (
          <Alert
            style={{ marginTop: 16 }}
            type="warning"
            showIcon
            message="We need a change before this goes live"
            description={review.rejectedReason || 'Get in touch and we will talk it through.'}
          />
        )}
      </Card>

      {canSubmit && (
        <VettingLinks
          links={review?.vettingLinks ?? []}
          problem={review?.vettingOk ? null : review?.vettingProblem ?? null}
          onSaved={load}
        />
      )}

      <Card title="Your images">
        <Paragraph type="secondary" style={{ fontSize: 13 }}>
          Each one appears somewhere different in the app, at a different shape.
          Upload once and position it; you can reframe any of them later.
        </Paragraph>

        <Row gutter={[24, 24]}>
          <Col xs={24} md={8}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Logo</Text>
            <ImageCropUpload role="logo" currentImageUrl={charity.logoUrl} onUploaded={onImage('logoUrl')} />
          </Col>
          <Col xs={24} md={8}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Highlight</Text>
            <ImageCropUpload role="highlight" currentImageUrl={charity.highlightUrl} onUploaded={onImage('highlightUrl')} />
          </Col>
          <Col xs={24} md={8}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Cover</Text>
            <ImageCropUpload role="cover" currentImageUrl={charity.imageUrl} onUploaded={onImage('imageUrl')} />
          </Col>
        </Row>

        <div
          style={{
            marginTop: 28,
            padding: 20,
            background: '#EFF5F7',
            border: '1px solid #D9E7EC',
            borderRadius: 12,
          }}
        >
          <Space align="center" size={10} style={{ marginBottom: 4 }} wrap>
            <Title level={5} style={{ margin: 0, color: '#21555b' }}>
              How this looks in the app
            </Title>
            <Tag
              icon={<EyeOutlined />}
              style={{ background: '#fff', borderColor: '#BBD6DE', color: '#21555b', marginInlineEnd: 0, fontSize: 11 }}
            >
              Preview only
            </Tag>
          </Space>
          <Text style={{ display: 'block', marginBottom: 16, fontSize: 12, color: '#5B7680' }}>
            Shown at the real size donors see. Crop above and this updates straight away.
          </Text>
          <CharityAppPreview
            data={{
              name: charity.name,
              category: charity.category,
              location: charity.location,
              about: aboutDraft ?? charity.about,
              logoUrl: charity.logoUrl,
              highlightUrl: charity.highlightUrl,
              coverUrl: charity.imageUrl,
            }}
          />
        </div>
      </Card>

      <GalleryPhotos photos={charity.imageUrls ?? []} onChanged={load} />

      <Card title="Your details">
        <Form form={form} layout="vertical" onFinish={onSave}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="name" label="Charity name" rules={[{ required: true, message: 'We need your name.' }]}>
                <Input size="large" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="category" label="What you work on">
                <Select size="large" options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="location" label="City and state">
                <Input size="large" placeholder="Alpharetta, GA" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="website" label="Website">
                <Input size="large" placeholder="https://" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="phone" label="Phone">
                <Input size="large" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="contactName" label="Who donors should ask for">
                <Input size="large" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="about"
            label="What you do"
            extra={<AboutFieldHint value={aboutDraft} />}
            rules={aboutRules(false)}
            // See RegisterCharity: validating on every keystroke reddens the
            // field before the minimum could possibly be met.
            validateTrigger="onBlur"
          >
            <TextArea rows={5} maxLength={ABOUT_MAX} />
          </Form.Item>

          <Divider />
          <Button type="primary" size="large" icon={<SaveOutlined />} htmlType="submit" loading={saving}>
            Save changes
          </Button>
        </Form>
      </Card>
    </Space>
  );
};

export default Profile;
