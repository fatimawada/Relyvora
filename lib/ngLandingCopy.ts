/**
 * Frontend-only copy and status configuration for the Relyvora Nigeria landing page (/ng).
 *
 * Keep all landing page copy here so early-access messaging and example previews
 * can be updated or toggled in one place without touching backend/WhatsApp modules
 * or requiring new Vercel environment variables.
 */

import { LAUNCH_STATUS, isPreLaunchFlag } from '@/lib/feeConfig';

export interface NgLandingCopyConfig {
  /**
   * Master toggle for the early-access status line under the hero buttons.
   * Respects existing LAUNCH_STATUS / PRE_LAUNCH / NEXT_PUBLIC_KYC_ENABLED flags
   * and defaults to true while in pre-launch / early access.
   */
  showEarlyAccessStatus: boolean;
  earlyAccessStatusLine: string;
  hero: {
    eyebrow: string;
    headline: string;
    headlineAccent: string;
    subline: string;
    primaryCtaLabel: string;
    primaryCtaHref: string;
    secondaryCtaLabel: string;
    secondaryCtaHref: string;
  };
  whatsappPreview: {
    senderName: string;
    senderSubtitle: string;
    timestamp: string;
    messageText: string;
    footerText: string;
    quickReplies: readonly [string, string];
    caption: string;
  };
  trustStrip: ReadonlyArray<{
    title: string;
    description: string;
  }>;
  howItWorks: {
    heading: string;
    subline: string;
    steps: ReadonlyArray<{
      stepNumber: string;
      title: string;
      description: string;
    }>;
  };
  comparison: {
    heading: string;
    subline: string;
    buyers: {
      badge: string;
      title: string;
      description: string;
      points: ReadonlyArray<string>;
    };
    sellers: {
      badge: string;
      title: string;
      description: string;
      points: ReadonlyArray<string>;
    };
  };
  closingCta: {
    badge: string;
    heading: string;
    subline: string;
    primaryCtaLabel: string;
    primaryCtaHref: string;
  };
}

/**
 * Determines whether the early-access status line should be displayed.
 * Respects existing pre-launch / launch status / NEXT_PUBLIC_KYC_ENABLED flags
 * without requiring any new Vercel environment variable.
 */
export function isNgEarlyAccessActive(): boolean {
  const kycEnv = (process.env.NEXT_PUBLIC_KYC_ENABLED || '').trim().toLowerCase();
  if (kycEnv === 'true' && LAUNCH_STATUS === 'live' && !isPreLaunchFlag()) {
    return false;
  }
  return LAUNCH_STATUS !== 'live' || isPreLaunchFlag() || true;
}

export const NG_LANDING_COPY: NgLandingCopyConfig = {
  showEarlyAccessStatus: false,
  earlyAccessStatusLine: '',
  hero: {
    eyebrow: 'Payment protection for Nigerian social commerce',
    headline: 'Safe payments for WhatsApp and',
    headlineAccent: 'Instagram orders in Nigeria.',
    subline:
      'Buyer funds are held safely in a dedicated bank account while the seller dispatches the order. At delivery, the buyer inspects the package and hands over a 6-digit release code to pay the seller.',
    primaryCtaLabel: 'Create your seller account',
    primaryCtaHref: '/vendor/onboarding',
    secondaryCtaLabel: 'See how a payment works',
    secondaryCtaHref: '#how-it-works',
  },
  whatsappPreview: {
    senderName: 'Relyvora',
    senderSubtitle: 'Order payment notification',
    timestamp: '14:20',
    messageText:
      'Hello. Lagos Hair Plug has created a payment link on Relyvora for Bone straight wig (₦45,000). Your payment is securely held until your order is delivered. Tap Continue to open your payment page.',
    footerText: "Not expecting this? Tap 'Not my order.'",
    quickReplies: ['Continue', 'Not my order'],
    caption: 'Example message',
  },
  trustStrip: [
    {
      title: 'Funds held until delivery',
      description:
        'The buyer pays into a dedicated virtual bank account for the order. Money stays locked until delivery is confirmed.',
    },
    {
      title: '6-digit release code confirmation',
      description:
        'Only the buyer receives the 6-digit release code. Sharing the code after inspecting the package releases payment to the seller.',
    },
    {
      title: 'Built for Nigerian social commerce',
      description:
        'Designed for everyday orders agreed on WhatsApp and Instagram and paid by standard Nigerian bank transfer.',
    },
  ],
  howItWorks: {
    heading: 'How it works',
    subline: 'Four clear steps from payment link to doorstep payout.',
    steps: [
      {
        stepNumber: '1',
        title: 'Seller creates a payment link',
        description:
          'The seller enters the item name, agreed price, and delivery window in their dashboard and shares the link in chat.',
      },
      {
        stepNumber: '2',
        title: 'Buyer pays into a dedicated bank account',
        description:
          'The buyer reviews the order details and transfers the exact amount to the dedicated bank account shown on the payment page.',
      },
      {
        stepNumber: '3',
        title: 'Seller dispatches the order',
        description:
          'Once the transfer is locked, the seller sees payment confirmation, ships the package, and records dispatch proof.',
      },
      {
        stepNumber: '4',
        title: 'Buyer inspects and shares the 6-digit code',
        description:
          'At delivery, the buyer checks the order and hands over the 6-digit release code to release the money to the seller.',
      },
    ],
  },
  comparison: {
    heading: 'Clear protection on both sides of the order',
    subline:
      'Buyers never pay blind into a personal account, and sellers never dispatch an order without committed payment.',
    buyers: {
      badge: 'For buyers',
      title: 'Pay upfront without risking your money on an unverified seller',
      description:
        'Your transfer is held safely until the package arrives and you confirm what is inside.',
      points: [
        'Transfer to a dedicated order account instead of sending money unprotected to a stranger.',
        'Open and check your package at delivery before handing over your 6-digit release code.',
        'Your release code stays private to you until you are ready to approve delivery.',
        'Raise a dispute with photo or video evidence if an order does not arrive or does not match.',
      ],
    },
    sellers: {
      badge: 'For sellers',
      title: 'Dispatch every order knowing the buyer has already paid in full',
      description:
        'Stop losing rider fees and stock to buyers who cancel or refuse payment at the door.',
      points: [
        'Confirm that the full order amount is locked before handing your item to a dispatch rider.',
        'Create and share a payment link in seconds inside any WhatsApp or Instagram conversation.',
        'Enter the buyer release code at handover to unlock payout to your Nigerian bank account.',
        'Submit dispatch and handover proof if a buyer is unreachable or withholds the code.',
      ],
    },
  },
  closingCta: {
    badge: 'Early access for Nigerian sellers',
    heading: 'Create your seller account ahead of launch',
    subline:
      'Register your store name, email, and WhatsApp number now so your account is ready as soon as live payments open.',
    primaryCtaLabel: 'Create your seller account',
    primaryCtaHref: '/vendor/onboarding',
  },
};
