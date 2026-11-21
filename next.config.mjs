import { assertPaymentsModeConsistency } from './lib/paymentsModeCheck.mjs';

/** @type {import('next').NextConfig} */
const baseConfig = {
  reactStrictMode: true,
  env: {
    ANCHOR_BRAND_APPROVED:
      process.env.ANCHOR_BRAND_APPROVED ??
      process.env.NEXT_PUBLIC_ANCHOR_BRAND_APPROVED ??
      'false',
    LAUNCH_STATUS:
      process.env.LAUNCH_STATUS ??
      process.env.NEXT_PUBLIC_LAUNCH_STATUS ??
      'launching',
  },
  experimental: {
    cpus: 1,
    workerThreads: false,
  },
};

export default function nextConfig() {
  // Fail the build immediately if PAYMENTS_MODE and NEXT_PUBLIC_PAYMENTS_MODE disagree.
  assertPaymentsModeConsistency(process.env);
  return baseConfig;
}
