/**
 * The 8 Binding Arbitration Scenarios & SLA Windows
 * Governed by the official Relyvora Dispute Policy (/disputes).
 */

export interface DisputeScenario {
  id: number;
  name: string;
  badge: string;
  slaHours: 2 | 6 | 12 | 24;
  slaLabel: string;
  resolutionType: 'FULL_REFUND_BUYER' | 'FULL_PAYOUT_VENDOR' | 'SPLIT_MINUS_DELIVERY' | 'CUSTOM_SPLIT';
  description: string;
  evidenceRequired: string;
  policyResolution: string;
}

export const DISPUTE_SCENARIOS: DisputeScenario[] = [
  {
    id: 1,
    name: 'Quality Mismatch ("What I Ordered vs. What I Got")',
    badge: '100% Full Refund',
    slaHours: 2,
    slaLabel: '2-Hour Buyer Evidence Window',
    resolutionType: 'FULL_REFUND_BUYER',
    description: "The delivered item materially differs from the vendor's description, size, or photos.",
    evidenceRequired: 'Buyer must upload clear unboxing photos/video within 2 hours. Vendor must provide original product listing/chat agreement.',
    policyResolution: 'Once verified as mismatch and rider confirms return of item to vendor, Relyvora issues a 100% full refund to buyer.',
  },
  {
    id: 2,
    name: 'Buyer Refuses Delivery / Unreachable ("Buyer Ghosts")',
    badge: 'Partial Split (Minus Delivery)',
    slaHours: 6,
    slaLabel: '6-Hour Delivery Proof Window',
    resolutionType: 'SPLIT_MINUS_DELIVERY',
    description: 'The vendor dispatches the item, but the buyer switches off their phone, is unreachable, or refuses to show up.',
    evidenceRequired: "Vendor submits screenshots of dispatch rider's call logs showing repeated missed calls and proof of arrival.",
    policyResolution: 'Buyer is refunded purchase price minus delivery fee; delivery fee is paid directly to vendor to cover logistics costs.',
  },
  {
    id: 3,
    name: 'The "Hostage" Situation (Item Taken, Code Withheld)',
    badge: '12-Hour Ultimatum',
    slaHours: 12,
    slaLabel: '12-Hour Ultimatum Window',
    resolutionType: 'FULL_PAYOUT_VENDOR',
    description: 'The buyer takes physical possession without handing over the 6-digit code and refuses to return item or release code.',
    evidenceRequired: 'Vendor provides proof of delivery (rider handover photo, signed waybill, or chat messages acknowledging possession).',
    policyResolution: 'Strict 12-hour ultimatum to buyer to submit defect evidence or release code. If buyer remains silent, Relyvora overrides code and releases full payout to vendor.',
  },
  {
    id: 4,
    name: 'Item Damaged in Transit',
    badge: '100% Full Refund',
    slaHours: 2,
    slaLabel: '2-Hour Doorstep Evidence Window',
    resolutionType: 'FULL_REFUND_BUYER',
    description: 'The item arrives broken, spilled, or physically damaged at point of delivery.',
    evidenceRequired: 'Buyer provides immediate photos or unboxing video taken at doorstep in the presence of rider.',
    policyResolution: 'Damaged item returned immediately with rider. Relyvora issues 100% full refund to buyer. Vendor claims compensation from logistics partner.',
  },
  {
    id: 5,
    name: 'Partial Acceptance (Multi-Item Orders)',
    badge: 'Custom Partial Split',
    slaHours: 6,
    slaLabel: '6-Hour Inventory Check Window',
    resolutionType: 'CUSTOM_SPLIT',
    description: 'Buyer orders multiple items in a single escrow link, accepts some, and rejects others due to defects or inaccuracy.',
    evidenceRequired: 'Photos of rejected item(s) handed back to rider and confirmation from both parties of accepted items.',
    policyResolution: 'Vendor is paid for accepted items (minus 3% platform fee), and buyer receives a proportionate refund for returned items.',
  },
  {
    id: 6,
    name: 'Vendor Failure to Deliver ("Vendor MIA")',
    badge: '100% Full Refund',
    slaHours: 6,
    slaLabel: '6-Hour Vendor Response Window',
    resolutionType: 'FULL_REFUND_BUYER',
    description: 'The agreed delivery timeframe expires, item has not been dispatched, and vendor is unresponsive to buyer.',
    evidenceRequired: 'Buyer submits screenshots of unanswered inquiries; Relyvora system logs confirm zero delivery activity.',
    policyResolution: 'Relyvora gives vendor a 6-hour window to provide valid dispatch proof. If vendor fails, 100% full refund to buyer plus compliance strike on vendor.',
  },
  {
    id: 7,
    name: "Buyer's Remorse at the Door",
    badge: 'Minus Delivery',
    slaHours: 2,
    slaLabel: '2-Hour Refusal Window',
    resolutionType: 'SPLIT_MINUS_DELIVERY',
    description: 'Delivered item matches description accurately, but buyer simply changes mind at door and rejects package.',
    evidenceRequired: 'Vendor provides original listing alongside photos of delivered item showing accurate match.',
    policyResolution: 'Rider returns item to vendor. Relyvora issues refund to buyer minus delivery cost; delivery fee routed to vendor.',
  },
  {
    id: 8,
    name: 'Lost or Stolen in Transit (Rider Absconds)',
    badge: '100% Full Refund',
    slaHours: 12,
    slaLabel: '12-Hour Logistics Verification Window',
    resolutionType: 'FULL_REFUND_BUYER',
    description: 'Vendor hands package to dispatch rider, but rider loses package, has an accident, or absconds.',
    evidenceRequired: 'Vendor provides dispatch waybill/receipt; buyer confirms non-arrival.',
    policyResolution: 'Because buyer never received goods, Relyvora issues a 100% full refund to buyer. Vendor pursues recovery from logistics company.',
  },
];

export function getScenarioById(id: number): DisputeScenario | undefined {
  return DISPUTE_SCENARIOS.find(s => s.id === id);
}

/**
 * Calculates countdown details from a dispute timestamp against an SLA window in hours.
 */
export function calculateSlaCountdown(disputedAtIso: string, slaHours: number): {
  deadline: Date;
  isExpired: boolean;
  hoursRemaining: number;
  minutesRemaining: number;
  secondsRemaining: number;
  formattedRemaining: string;
  percentElapsed: number;
} {
  const disputedAt = new Date(disputedAtIso).getTime();
  const deadlineMs = disputedAt + slaHours * 3600 * 1000;
  const nowMs = Date.now();
  const diffMs = deadlineMs - nowMs;

  const totalSlaMs = slaHours * 3600 * 1000;
  const elapsedMs = Math.max(0, nowMs - disputedAt);
  const percentElapsed = Math.min(100, Math.max(0, Math.round((elapsedMs / totalSlaMs) * 100)));

  if (diffMs <= 0) {
    return {
      deadline: new Date(deadlineMs),
      isExpired: true,
      hoursRemaining: 0,
      minutesRemaining: 0,
      secondsRemaining: 0,
      formattedRemaining: 'EXPIRED',
      percentElapsed: 100,
    };
  }

  const hours = Math.floor(diffMs / (3600 * 1000));
  const minutes = Math.floor((diffMs % (3600 * 1000)) / (60 * 1000));
  const seconds = Math.floor((diffMs % (60 * 1000)) / 1000);

  const formattedRemaining = `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  return {
    deadline: new Date(deadlineMs),
    isExpired: false,
    hoursRemaining: hours,
    minutesRemaining: minutes,
    secondsRemaining: seconds,
    formattedRemaining,
    percentElapsed,
  };
}

export interface BusinessHoursConfig {
  timezone?: string;
  start_hour?: number; // Default 8 (08:00 WAT)
  end_hour?: number;   // Default 20 (20:00 WAT)
  work_days?: number[]; // 0=Sun..6=Sat; default [1,2,3,4,5,6] (Mon-Sat)
}

export const DISPUTE_POLICY_BUSINESS_HOURS_DEFAULT: Required<BusinessHoursConfig> = {
  timezone: 'Africa/Lagos',
  start_hour: 8,
  end_hour: 20,
  work_days: [1, 2, 3, 4, 5, 6],
};

function getZonedParts(date: Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const map = new Map(parts.map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(map.get('year') || 1970),
    month: Number(map.get('month') || 1),
    day: Number(map.get('day') || 1),
    hour: Number(map.get('hour') || 0) % 24,
    minute: Number(map.get('minute') || 0),
    second: Number(map.get('second') || 0),
    weekday: weekdayMap[map.get('weekday') || 'Mon'] ?? 1,
  };
}

/**
 * Adds `slaHours` of business-hour time starting from `startIso`.
 * Defaults to 08:00–20:00 Africa/Lagos, Monday–Saturday.
 */
export function calculateBusinessHoursDeadline(
  startIso: string,
  slaHours: number,
  config?: BusinessHoursConfig
): Date {
  const tz = config?.timezone || DISPUTE_POLICY_BUSINESS_HOURS_DEFAULT.timezone;
  const startHour = Number(config?.start_hour ?? DISPUTE_POLICY_BUSINESS_HOURS_DEFAULT.start_hour);
  const endHour = Number(config?.end_hour ?? DISPUTE_POLICY_BUSINESS_HOURS_DEFAULT.end_hour);
  const workDays = new Set(
    Array.isArray(config?.work_days) && config!.work_days.length > 0
      ? config!.work_days
      : DISPUTE_POLICY_BUSINESS_HOURS_DEFAULT.work_days
  );

  let remainingMinutes = Math.max(1, Math.round(slaHours * 60));
  let cursorMs = new Date(startIso).getTime();
  if (Number.isNaN(cursorMs)) cursorMs = Date.now();

  // Step cleanly minute-by-minute across at most 45 days (fast & timezone-accurate)
  const MAX_ITER = 45 * 24 * 12; // 5-minute steps
  const stepMs = 5 * 60 * 1000;
  let guard = 0;
  while (remainingMinutes > 0 && guard < MAX_ITER) {
    guard++;
    const z = getZonedParts(new Date(cursorMs), tz);
    const inWorkDay = workDays.has(z.weekday);
    const minuteOfDay = z.hour * 60 + z.minute;
    if (inWorkDay && minuteOfDay >= startHour * 60 && minuteOfDay < endHour * 60) {
      remainingMinutes -= 5;
    }
    cursorMs += stepMs;
  }

  return new Date(cursorMs);
}

/**
 * Business-hour aware countdown against either an explicit precomputed deadline ISO or SLA hours.
 */
export function calculateBusinessSlaCountdown(
  disputedAtIso: string,
  slaHours: number,
  explicitDeadlineIso?: string | null,
  config?: BusinessHoursConfig
): {
  deadline: Date;
  isExpired: boolean;
  hoursRemaining: number;
  minutesRemaining: number;
  secondsRemaining: number;
  formattedRemaining: string;
  percentElapsed: number;
} {
  const disputedMs = new Date(disputedAtIso).getTime();
  const deadline = explicitDeadlineIso
    ? new Date(explicitDeadlineIso)
    : calculateBusinessHoursDeadline(disputedAtIso, slaHours, config);
  const deadlineMs = deadline.getTime();
  const nowMs = Date.now();
  const diffMs = deadlineMs - nowMs;
  const spanMs = Math.max(60000, deadlineMs - disputedMs);
  const percentElapsed = Math.min(100, Math.max(0, Math.round(((nowMs - disputedMs) / spanMs) * 100)));

  if (diffMs <= 0) {
    return {
      deadline,
      isExpired: true,
      hoursRemaining: 0,
      minutesRemaining: 0,
      secondsRemaining: 0,
      formattedRemaining: 'EXPIRED',
      percentElapsed: 100,
    };
  }

  const hours = Math.floor(diffMs / (3600 * 1000));
  const minutes = Math.floor((diffMs % (3600 * 1000)) / (60 * 1000));
  const seconds = Math.floor((diffMs % (60 * 1000)) / 1000);
  const formattedRemaining = `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  return {
    deadline,
    isExpired: false,
    hoursRemaining: hours,
    minutesRemaining: minutes,
    secondsRemaining: seconds,
    formattedRemaining,
    percentElapsed,
  };
}
