import { ImageResponse } from 'next/og';
import { BRAND_BLUE, markDataUri } from '@/lib/brand';

// Favicon — generated from the PNF mark (white glyph on a brand-blue rounded tile). Matches the
// explorer so the two sibling apps share one lockup.
export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: BRAND_BLUE,
          borderRadius: 14,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={markDataUri('#ffffff')} width={42} height={42} alt="" />
      </div>
    ),
    { ...size },
  );
}
