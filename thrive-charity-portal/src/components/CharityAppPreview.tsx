/**
 * COPY. The original lives in the admin panel at
 *   ti-admin-panel/ti-admin-panel/src/components/CharityAppPreview.tsx
 * and the donor app's slot styles are the other half of the same decision.
 *
 * Duplicated rather than shared because the panel, this portal and the app are
 * three separate builds with no shared package. If one changes, the others
 * have to change with it, or a charity crops to one shape and donors see
 * another. See CLAUDE.md "Charity images".
 */
/**
 * Shows a charity's images as the donor app actually renders them.
 *
 * Why this exists: the three image roles live in three differently-shaped
 * slots, and whether a crop works is a question about the slot, not about the
 * photo. Someone cropping in the admin panel could frame a logo perfectly in a
 * square and still not know that the profile draws it as a circle over the
 * bottom-left corner of the cover, where it hides whatever is underneath.
 *
 * Every measurement here is copied from the app, not approximated:
 *
 *   Highlight card   app/(tabs)/(main)/beneficiary/index.js
 *                    beneficiaryCard / beneficiaryImage / beneficiaryCardContent
 *   Profile header   components/BeneficiaryDetailCard.js
 *                    imageCarousel / profileRow / profileImageContainer / title
 *
 * A preview that is merely close is worse than no preview, because it is
 * trusted. If either of those files changes shape, this has to change with it,
 * the same way IMAGE_PRESETS does. See CLAUDE.md "Charity images".
 */
import React from 'react';
import { Typography } from 'antd';
import { HeartOutlined, EnvironmentFilled, ClockCircleFilled } from '@ant-design/icons';
import { cityStateFromLocation } from '../utils/cityStateFromLocation';

const { Text } = Typography;

/** iPhone logical width the app is laid out against. */
const SCREEN = 390;

/** Browse list background, from the beneficiary index screen. */
const LIST_BG = '#f5f5fa';

export interface CharityPreviewData {
  name?: string | null;
  category?: string | null;
  location?: string | null;
  logoUrl?: string | null;
  highlightUrl?: string | null;
  coverUrl?: string | null;
  isPendingVerification?: boolean;
}

/**
 * The app's render-time fallback chain, repeated here on purpose.
 *
 * formatCharityResponse resolves highlightUrl -> image_url -> logo_url, so a
 * charity with no square crop still shows something in the list: a centre-crop
 * of its wide cover. The preview has to show that too, otherwise it would
 * display an empty slot for exactly the charities whose list card looks worst,
 * which is the opposite of useful.
 */
function resolveHighlight(d: CharityPreviewData): { url: string | null; fellBack: boolean } {
  if (d.highlightUrl) return { url: d.highlightUrl, fellBack: false };
  const fallback = d.coverUrl || d.logoUrl || null;
  return { url: fallback, fellBack: !!fallback };
}

/**
 * Lifts a preview off the tinted section it sits on.
 *
 * The list preview carries the app's own list background (#f5f5fa), which is
 * close enough to the section tint to blend into it. The frame restores the
 * edge so the preview still reads as a screen, without changing any colour
 * inside it, which has to stay exactly what the app renders.
 */
const DeviceFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      width: SCREEN,
      padding: 6,
      background: '#fff',
      borderRadius: 16,
      border: '1px solid #E2ECEF',
      boxShadow: '0 6px 18px rgba(33, 85, 91, 0.10)',
      boxSizing: 'content-box',
    }}
  >
    {children}
  </div>
);

/**
 * Names which of the three images a part of the preview is showing.
 *
 * Placed beside each image rather than over it: the whole reason to look at a
 * preview is to judge the crop, so a label that covers a corner of the picture
 * defeats its own purpose.
 */
const ImageTag: React.FC<{ label: string; arrow: 'down' | 'left' }> = ({ label, arrow }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      background: '#21555b',
      color: '#fff',
      borderRadius: 999,
      padding: '2px 9px',
      fontSize: 11,
      fontWeight: 600,
      whiteSpace: 'nowrap',
      lineHeight: 1.6,
    }}
  >
    {arrow === 'left' && <span aria-hidden>&#8592;</span>}
    {label}
    {arrow === 'down' && <span aria-hidden>&#8595;</span>}
  </span>
);

const Placeholder: React.FC<{ label: string; round?: boolean }> = ({ label, round }) => (
  <div
    style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'repeating-linear-gradient(45deg,#e9edf1,#e9edf1 8px,#e3e8ee 8px,#e3e8ee 16px)',
      color: '#8a97a3',
      fontSize: 11,
      textAlign: 'center',
      padding: 6,
      borderRadius: round ? '50%' : undefined,
      boxSizing: 'border-box',
    }}
  >
    {label}
  </div>
);

/** One row of the charity browse list, at the app's real dimensions. */
export const HighlightCardPreview: React.FC<{ data: CharityPreviewData }> = ({ data }) => {
  const { url, fellBack } = resolveHighlight(data);

  return (
    <div style={{ background: LIST_BG, padding: '10px 0', width: SCREEN, borderRadius: 10 }}>
      <div
        style={{
          // beneficiaryCard: row, #fff, radius 12, 20pt side margins,
          // height 120 (fixed, so the image slot stays square).
          display: 'flex',
          flexDirection: 'row',
          background: '#fff',
          borderRadius: 12,
          overflow: 'hidden',
          margin: '0 20px',
          height: 120,
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          position: 'relative',
        }}
      >
        {/* beneficiaryImage: 120 x 120, left corners rounded, object-fit cover */}
        <div style={{ width: 120, height: 120, flexShrink: 0, overflow: 'hidden' }}>
          {url ? (
            <img
              src={url}
              alt=""
              style={{ width: 120, height: 120, objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <Placeholder label="No image" />
          )}
        </div>

        {/* favoriteButton: absolute, top 8 right 8 */}
        <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, color: '#DB8633' }}>
          <HeartOutlined style={{ fontSize: 18 }} />
        </div>

        {/* beneficiaryCardContent: flex 1, padding 16, centred */}
        <div
          style={{
            flex: 1,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            minWidth: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: '#324E58',
                marginBottom: 4,
                paddingRight: 32,
                // numberOfLines={2}
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                lineHeight: 1.2,
              }}
            >
              {data.name || 'Charity name'}
            </div>
            {data.isPendingVerification && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  background: '#FDF3E3',
                  borderRadius: 8,
                  padding: '2px 6px',
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#8A5A12',
                  whiteSpace: 'nowrap',
                }}
              >
                <ClockCircleFilled style={{ fontSize: 9 }} />
                Pending
              </span>
            )}
          </div>

          <div style={{ fontSize: 13, color: '#6d6e72', marginBottom: 6 }}>
            {data.category || 'Category'}
          </div>

          {/* No blurb line. The app styles one (beneficiaryBlurb) and guards it
              on b.description, but the object it builds for each card carries
              `about` and never sets `description`, so the guard is always false
              and donors never see a snippet here. Rendering one would be the
              preview inventing a line the app cannot show. */}

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <EnvironmentFilled style={{ fontSize: 12, color: '#8E9BAE' }} />
            <span style={{ fontSize: 12, color: '#8E9BAE', marginLeft: 4 }}>
              {/* The card shows city and state, not the stored address. The
                  location column holds full addresses so the location filter
                  can match them; the app narrows it here and so must this. */}
              {cityStateFromLocation(data.location)}
            </span>
          </div>
        </div>
      </div>

      {fellBack && (
        <Text
          type="warning"
          style={{ fontSize: 12, display: 'block', padding: '8px 20px 0' }}
        >
          No highlight crop yet, so the app is centre-cropping the cover to fill
          this square. Whatever sits on the left and right of that photo is
          being cut off here.
        </Text>
      )}
    </div>
  );
};

/** The top of the charity profile: 2:1 cover with the logo circle over it. */
export const ProfileHeaderPreview: React.FC<{
  data: CharityPreviewData;
  /** Show a tag beside the logo circle naming it. */
  showLogoTag?: boolean;
}> = ({ data, showLogoTag }) => {
  // The app falls back logo -> cover -> placeholder for the circle.
  const logo = data.logoUrl || data.coverUrl || null;

  return (
    <div style={{ width: SCREEN, background: '#fff', borderRadius: 10, overflow: 'hidden' }}>
      {/* imageCarousel: width 100%, aspectRatio 2 */}
      <div style={{ width: '100%', aspectRatio: '2 / 1', overflow: 'hidden', background: '#eee' }}>
        {data.coverUrl ? (
          <img
            src={data.coverUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <Placeholder label="No cover image" />
        )}
      </div>

      {/* profileRow: marginTop -55, marginLeft 16.
          This is the overlap worth seeing: the circle covers the cover photo's
          bottom-left corner, so anything important down there is hidden. */}
      <div
        style={{
          display: 'flex',
          marginTop: -55,
          marginLeft: 16,
          // Bottom-aligned so the tag lands on the white below the cover
          // rather than on top of it. The circle's upper half overlaps the
          // band; its lower half does not.
          alignItems: 'flex-end',
        }}
      >
        <div
          style={{
            width: 110,
            height: 110,
            borderRadius: '50%',
            background: '#fff',
            border: '3px solid #fff',
            overflow: 'hidden',
            boxSizing: 'border-box',
            flexShrink: 0,
          }}
        >
          {logo ? (
            <img
              src={logo}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <Placeholder label="No logo" round />
          )}
        </div>
        {showLogoTag && (
          <span style={{ marginLeft: 10, marginBottom: 10 }}>
            <ImageTag label="Logo image" arrow="left" />
          </span>
        )}
      </div>

      <div style={{ paddingBottom: 20 }}>
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: '#21555b',
            marginTop: 8,
            padding: '0 24px',
          }}
        >
          {data.name || 'Charity name'}
        </div>

        {/* Buttons, so the preview ends where the app's fold is rather than
            stopping at the title and implying there is nothing below it. */}
        <div style={{ display: 'flex', gap: 12, padding: '16px 24px 0' }}>
          <div
            style={{
              flex: 1,
              background: '#DB8633',
              borderRadius: 10,
              padding: 18,
              textAlign: 'center',
              color: '#fff',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Select This Charity
          </div>
          <div
            style={{
              flex: 1,
              background: '#F2F2F5',
              borderRadius: 10,
              padding: 18,
              textAlign: 'center',
              color: '#324E58',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Favorite
          </div>
        </div>
      </div>
    </div>
  );
};

/** Both previews side by side, labelled with where each one appears. */
const CharityAppPreview: React.FC<{ data: CharityPreviewData }> = ({ data }) => (
  <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
    <div>
      <Text strong style={{ display: 'block', marginBottom: 4, color: '#21555b' }}>
        On the charity list
      </Text>
      <Text style={{ fontSize: 12, display: 'block', marginBottom: 10, color: '#5B7680' }}>
        What a donor sees while scrolling, before they tap in. Uses the
        Highlight image.
      </Text>
      <div style={{ marginBottom: 6, paddingLeft: 32 }}>
        <ImageTag label="Highlight image" arrow="down" />
      </div>
      <DeviceFrame>
        <HighlightCardPreview data={data} />
      </DeviceFrame>
    </div>

    <div>
      <Text strong style={{ display: 'block', marginBottom: 4, color: '#21555b' }}>
        At the top of the profile
      </Text>
      <Text style={{ fontSize: 12, display: 'block', marginBottom: 10, color: '#5B7680' }}>
        Uses the Cover image, with the Logo in the circle over its bottom left.
      </Text>
      <div style={{ marginBottom: 6, paddingLeft: 16 }}>
        <ImageTag label="Cover image" arrow="down" />
      </div>
      <DeviceFrame>
        <ProfileHeaderPreview data={data} showLogoTag />
      </DeviceFrame>
    </div>
  </div>
);

export default CharityAppPreview;
