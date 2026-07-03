import { ImageResponse } from 'next/og';
import { BRAND_BLUE, markDataUri } from '@/lib/brand';

// Apple touch icon (180×180) — full-bleed brand-blue; iOS applies its own corner mask.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
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
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={markDataUri('#ffffff')} width={116} height={116} alt="" />
      </div>
    ),
    { ...size },
  );
}
