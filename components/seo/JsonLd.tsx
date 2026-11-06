import React from 'react';

interface JsonLdProps {
  type: 'Organization' | 'WebSite' | 'FAQPage' | 'BreadcrumbList';
  data?: Record<string, unknown>;
}

export function JsonLd({ type, data }: JsonLdProps) {
  let schema: Record<string, unknown> = {};

  if (type === 'Organization') {
    schema = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Relyvora Technologies Limited',
      url: 'https://relyvora.com',
      logo: 'https://relyvora.com/relyvora-logo.png',
      description: 'Transaction protection and neutral escrow infrastructure for African social commerce.',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Abuja',
        addressCountry: 'NG',
      },
      ...data,
    };
  } else if (type === 'WebSite') {
    schema = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Relyvora',
      url: 'https://relyvora.com',
      description: 'Safe payments for WhatsApp and Instagram sellers in Nigeria.',
      ...data,
    };
  } else if (type === 'FAQPage') {
    schema = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      ...data,
    };
  } else if (type === 'BreadcrumbList') {
    schema = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      ...data,
    };
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
