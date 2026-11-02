/**
 * Crop an image to the shape it will be shown in, then upload it.
 *
 * The admin panel's ti-admin-panel/src/components/ImageCropUpload.tsx is the
 * same component against a different upload path: the panel writes through
 * its storage service, this writes through POST /charity/me/image/:role, which
 * is scoped to the signed-in charity. The crop geometry itself is shared code
 * in utils/imageCrop.ts.
 *
 * Why crop at upload at all: the app renders with cover, which centre-crops.
 * A wide photo dropped into the square list slot loses its left and right
 * thirds, and nobody can see that happening at upload time. Deciding the crop
 * here means the stored file is already the right shape and every screen
 * agrees. See CLAUDE.md "Charity images".
 */
import React, { useCallback, useState } from 'react';
import { Upload, Button, message, Modal, Slider, Space, Typography, Spin } from 'antd';
import {
  UploadOutlined,
  DeleteOutlined,
  ScissorOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { IMAGE_PRESETS, exportCrop, prepareCropSource } from '../utils/imageCrop';
import type { ImageRole } from '../utils/imageCrop';
import { charityAPI, apiErrorMessage } from '../lib/api';

const { Text } = Typography;

const ACCEPTED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

interface Props {
  role: ImageRole;
  currentImageUrl?: string | null;
  /** Called with the new URL once the server has stored it. */
  onUploaded: (url: string) => void;
  onRemoved?: () => void;
}

const ImageCropUpload: React.FC<Props> = ({
  role,
  currentImageUrl,
  onUploaded,
  onRemoved,
}) => {
  const preset = IMAGE_PRESETS[role];

  const [source, setSource] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const [preparing, setPreparing] = useState(false);

  const onCropComplete = useCallback((_: Area, pixels: Area) => setArea(pixels), []);

  const closeCropper = () => {
    if (source && source.startsWith('blob:')) URL.revokeObjectURL(source);
    setSource(null);
    setArea(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  /** antd calls this per selected file; returning false stops its own upload. */
  const handleSelect = (file: File) => {
    if (!ACCEPTED.includes(file.type)) {
      message.error('Images need to be a JPG, PNG or WebP.');
      return false;
    }
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setPreparing(true);
    // Downscale a camera photo before the cropper has to move it. At full
    // resolution every pointer move re-transforms the whole image and
    // dragging stops responding.
    prepareCropSource(file)
      .then(({ url, original, downscaledTo }) => {
        setSource(url);
        if (downscaledTo) {
          message.info(
            `That photo was ${original.w} x ${original.h}, so it has been scaled to ` +
              `${downscaledTo.w} x ${downscaledTo.h} to crop. Still plenty for the ` +
              `${preset.outWidth} x ${preset.outHeight} it saves at.`,
          );
        }
      })
      .catch((e: any) =>
        message.error(e?.message || 'That image could not be opened. Give it another try?'),
      )
      .finally(() => setPreparing(false));
    return false;
  };

  const handleRecrop = () => {
    if (!currentImageUrl) return;
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setSource(currentImageUrl);
  };

  const handleSaveCrop = async () => {
    if (!source || !area) return;
    setSaving(true);
    try {
      const blob = await exportCrop(source, area, preset);
      const ext = preset.png ? 'png' : 'jpg';
      const file = new File([blob], `${role}-${Date.now()}.${ext}`, { type: blob.type });
      const { url } = await charityAPI.uploadImage(role, file);
      onUploaded(url);
      message.success(`${preset.label} image saved.`);
      closeCropper();
    } catch (err: any) {
      message.error(
        err?.message?.includes('crop')
          ? err.message
          : apiErrorMessage(err, 'That did not upload. Give it another try?'),
      );
    } finally {
      setSaving(false);
    }
  };

  const previewWidth = preset.round ? 96 : preset.aspect >= 2 ? 240 : 120;
  const previewHeight = Math.round(previewWidth / preset.aspect);

  return (
    <div>
      {currentImageUrl ? (
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <div
            style={{
              width: previewWidth,
              height: previewHeight,
              borderRadius: preset.round ? '50%' : 8,
              overflow: 'hidden',
              background: '#f5f5f5',
              border: '1px solid #f0f0f0',
            }}
          >
            <img
              src={currentImageUrl}
              alt={`${preset.label}`}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
          <Space size="small" wrap>
            <Button icon={<ScissorOutlined />} onClick={handleRecrop}>
              Reframe
            </Button>
            <Upload beforeUpload={handleSelect} showUploadList={false} accept="image/*">
              <Button icon={<UploadOutlined />} loading={preparing}>
                Replace
              </Button>
            </Upload>
            {onRemoved && (
              <Button danger icon={<DeleteOutlined />} onClick={onRemoved}>
                Remove
              </Button>
            )}
          </Space>
        </Space>
      ) : (
        <Upload.Dragger
          beforeUpload={handleSelect}
          showUploadList={false}
          accept="image/*"
          style={{ padding: '12px 8px' }}
        >
          <p style={{ margin: 0 }}>
            <UploadOutlined style={{ fontSize: 22, color: '#DB8633' }} />
          </p>
          <p style={{ margin: '6px 0 0', fontWeight: 500 }}>
            {preparing ? 'Getting the image ready' : `Add the ${preset.label.toLowerCase()} image`}
          </p>
          <p style={{ margin: 0, fontSize: 12, color: '#888' }}>
            {preparing ? 'One moment' : 'You will position and crop it next'}
          </p>
        </Upload.Dragger>
      )}

      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
        {preset.help}
      </Text>

      <Modal
        open={!!source}
        title={`Position the ${preset.label.toLowerCase()} image`}
        onCancel={closeCropper}
        okText="Save this crop"
        cancelText="Cancel"
        confirmLoading={saving}
        onOk={handleSaveCrop}
        width={720}
        destroyOnClose
      >
        <Spin spinning={saving} tip="Saving the crop">
          <Text type="secondary" style={{ fontSize: 13 }}>
            Drag to move, zoom to fill. Whatever is inside the frame is exactly
            what donors will see. You can come back and reframe this at any time.
          </Text>

          <div
            style={{
              position: 'relative',
              width: '100%',
              height: 380,
              marginTop: 12,
              background: '#1f1f1f',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            {source && (
              <Cropper
                image={source}
                crop={crop}
                zoom={zoom}
                aspect={preset.aspect}
                cropShape={preset.round ? 'round' : 'rect'}
                showGrid={!preset.round}
                restrictPosition
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            )}
          </div>

          <Space align="center" style={{ width: '100%', marginTop: 16 }}>
            <ZoomOutOutlined style={{ color: '#888' }} />
            <Slider
              min={1}
              max={4}
              step={0.01}
              value={zoom}
              onChange={setZoom}
              style={{ width: 320 }}
              tooltip={{ formatter: (v) => `${Number(v).toFixed(1)}x` }}
            />
            <ZoomInOutlined style={{ color: '#888' }} />
            <Text type="secondary" style={{ fontSize: 12, marginLeft: 12 }}>
              Saves at {preset.outWidth} x {preset.outHeight}
            </Text>
          </Space>
        </Spin>
      </Modal>
    </div>
  );
};

export default ImageCropUpload;
