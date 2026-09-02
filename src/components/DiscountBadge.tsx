import type { Pricing } from '../lib/types';
import { discountPercent, formatUsd, perMillion, resolvePricing } from '../lib/pricing';
import { Tooltip } from './Tooltip';

interface DiscountBadgeProps {
  pricing: Pricing;
}

export function DiscountBadge({ pricing }: DiscountBadgeProps) {
  const resolved = resolvePricing(pricing);
  const pct = discountPercent(pricing, resolved.prompt);
  if (!pricing.original || pct <= 0) return null;
  const origPerM = perMillion(pricing.original.prompt);
  const nowPerM = perMillion(resolved.prompt);
  return (
    <Tooltip
      label={
        <span>
          Was {formatUsd(origPerM)} / 1M, now {formatUsd(nowPerM)} / 1M
        </span>
      }
    >
      <span className="discount-badge">−{pct.toFixed(0)}%</span>
    </Tooltip>
  );
}