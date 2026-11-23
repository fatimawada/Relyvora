'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Enforces a single light theme across ng.relyvora.com and NG app routes without
 * touching the corporate site's stored theme preference.
 */
export function NgLightThemeGuard() {
  const pathname = usePathname();

  useEffect(() => {
    const enforceLight = () => {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    };

    enforceLight();

    const observer = new MutationObserver(() => {
      if (document.documentElement.classList.contains('dark')) {
        enforceLight();
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
