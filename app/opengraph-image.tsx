import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Relyvora — Safe payments for WhatsApp and Instagram sellers in Nigeria';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
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
          {/* Logo Symbol Render */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="20 4 90 106"
            width="60"
            height="60"
          >
            <g fill="#FFFFFF" fillRule="evenodd">
              <path d="M24 8L52 8L52 38L24 38Z" />
              <path d="M24 42L52 42L52 72L24 72Z" />
              <path d="M24 76L52 76L52 106L24 106Z" />
            </g>
            <g fill="#5BE3AB" fillRule="evenodd">
              <path d="M58 56L80 56L106 106L84 106Z" />
            </g>
            <g fill="#22B07F" fillRule="evenodd">
              <path d="M58 8L76 8C93 8 105 20 105 35C105 50 93 63 76 63L66 63C61 63 58 60 58 56L58 45L76 45C83 45 87 41 87 35C87 29 83 26 76 26L58 26Z" />
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
            Launching in Nigeria
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '960px' }}>
          <div style={{ fontSize: '64px', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.03em' }}>
            Trade with confidence.
          </div>
          <div style={{ fontSize: '24px', color: '#B4C2DA', lineHeight: 1.5, maxWidth: '850px' }}>
            Payment protection for WhatsApp and Instagram commerce. Your money is held until your order arrives and you confirm with a six-digit code.
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
          <div style={{ color: '#5BE3AB' }}>Payments powered by Anchor</div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
