/**
 * The Photos strip on a charity's profile: up to five 4:3 pictures.
 *
 * The fourth image role, and the only one that is a list rather than a slot.
 * It still goes through the cropper, because the app draws these at 220x165
 * and a photo that is not already 4:3 gets centre-cropped on the device with
 * nobody watching. That is the same bug the other three roles exist to
 * prevent. See CLAUDE.md "Charity images".
 *
 * Uploads append server side, so a half-finished gallery is never lost if
 * someone closes the tab. Removal is a separate save of the whole list.
 */
import React, { useState } from 'react';
import { Card, Typography, Button, message, Modal, Spin } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import ImageCropUpload from './ImageCropUpload';
import { charityAPI, apiErrorMessage } from '../lib/api';

const { Text, Paragraph } = Typography;

/** Matches the charities_image_urls_max_5 CHECK and the server's own cap. */
const MAX_PHOTOS = 5;

interface Props {
  photos: string[];
  /** Re-read the profile after a change. */
  onChanged: () => void;
}

const GalleryPhotos: React.FC<Props> = ({ photos, onChanged }) => {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const full = photos.length >= MAX_PHOTOS;

  const remove = async (url: string) => {
    setRemoving(url);
    try {
      await charityAPI.updateMe({ imageUrls: photos.filter((p) => p !== url) });
      onChanged();
    } catch (err) {
      message.error(apiErrorMessage(err, 'That did not save. Give it another try?'));
    } finally {
      setRemoving(null);
    }
  };

  const confirmRemove = (url: string) =>
    Modal.confirm({
      title: 'Take this photo off your profile?',
      okText: 'Remove it',
      okButtonProps: { danger: true },
      cancelText: 'Keep it',
      content: 'You can add it again later, though you will need to crop it again.',
      onOk: () => remove(url),
    });

  return (
    <Card title="Photos">
      <Paragraph type="secondary" style={{ fontSize: 13 }}>
        Up to five pictures of your work, shown in a strip donors can swipe
        through on your profile. Landscape works best. A profile with no
        photos still looks finished, so add them when you have good ones
        rather than filling the space.
      </Paragraph>

      {photos.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 14,
            marginBottom: 18,
          }}
        >
          {photos.map((url) => (
            <div key={url}>
              <div
                style={{
                  width: '100%',
                  aspectRatio: '4 / 3',
                  borderRadius: 10,
                  overflow: 'hidden',
                  background: '#EDF0F3',
                  border: '1px solid #E2ECEF',
                }}
              >
                <Spin spinning={removing === url}>
                  <img
                    src={url}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </Spin>
              </div>
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                disabled={removing === url}
                onClick={() => confirmRemove(url)}
                style={{ marginTop: 4 }}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      {full ? (
        <Text type="secondary" style={{ fontSize: 13 }}>
          That is all five. Remove one to add another.
        </Text>
      ) : adding ? (
        <div style={{ maxWidth: 320 }}>
          <ImageCropUpload
            role="gallery"
            onUploaded={() => {
              setAdding(false);
              onChanged();
            }}
          />
          <Button type="text" style={{ marginTop: 8 }} onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button icon={<PlusOutlined />} onClick={() => setAdding(true)}>
          {photos.length === 0 ? 'Add your first photo' : 'Add another photo'}
        </Button>
      )}
    </Card>
  );
};

export default GalleryPhotos;
