import { ImageResponse } from 'next/og';
import { isAnchorBrandApproved } from '@/lib/anchorBrand';

export const runtime = 'edge';
export const alt = 'Relyvora: Safe payments for WhatsApp and Instagram commerce';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  const anchorApproved = isAnchorBrandApproved();
  return new ImageResponse(
    (
      <div
        style={{
          background: '#071229',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          padding: '80px',
          color: '#F4F6F9',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="20 4 92 106"
            width="60"
            height="60"
          >
            <g fill="#FFFFFF" fillRule="evenodd">
              <path d="M24 8L52 8L52 38L24 38Z" />
              <path d="M24 42L52 42L52 72L24 72Z" />
              <path d="M24 76L52 76L52 106L24 106Z" />
            </g>
            <g fill="#22B07F" fillRule="evenodd">
              <path d="M60 8L78 8C95 8 107 20 107 35C107 50 95 63 78 63L68 63C63 63 60 60 60 56L60 45L78 45C85 45 89 41 89 35C89 29 85 26 78 26L60 26Z" />
            </g>
            <g fill="#5BE3AB" fillRule="evenodd">
              <path d="M60 56L82 56L108 106L86 106Z" />
            </g>
          </svg>
          <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#FFFFFF', letterSpacing: '-0.02em' }}>
            Relyvora
          </div>
          <div
            style={{
              marginLeft: '20px',
              padding: '6px 16px',
              borderRadius: '9999px',
              background: 'rgba(91, 227, 171, 0.15)',
              border: '1px solid rgba(91, 227, 171, 0.3)',
              fontSize: '16px',
              fontWeight: 600,
              color: '#5BE3AB',
            }}
          >
            Africa-first payment protection
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '960px' }}>
          <div style={{ fontSize: '64px', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.03em' }}>
            Trade with confidence.
          </div>
          <div style={{ fontSize: '24px', color: '#B4C2DA', lineHeight: 1.5, maxWidth: '850px' }}>
            Payment protection for WhatsApp and Instagram commerce. Your money is held until your order arrives and you confirm with a six‑digit code.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            paddingTop: '30px',
            borderTop: '1px solid #1B315E',
            fontSize: '18px',
            color: '#B4C2DA',
          }}
        >
          <div>relyvora.com</div>
          <div
            style={
              anchorApproved
                ? { color: '#5BE3AB' }
                : { color: '#94A3B8', opacity: 0.4, filter: 'blur(3px)' }
            }
          >
            Payments powered by Anchor
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
