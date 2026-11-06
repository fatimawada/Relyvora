/**
 * Utility to detect WebGL capability and device capability
 * Gracefully degrades to high-quality SVG vector illustrations for low-end mobile devices,
 * data-saver modes, or slow networks to protect bundle and bandwidth costs.
 */

export interface DeviceCapability {
  supportsWebGL: boolean;
  isLowEndDevice: boolean;
  isDataSaver: boolean;
  shouldUseFallback: boolean;
}

export function detectDeviceCapability(): DeviceCapability {
  if (typeof window === 'undefined') {
    return {
      supportsWebGL: true,
      isLowEndDevice: false,
      isDataSaver: false,
      shouldUseFallback: false,
    };
  }

  // 1. WebGL Support Check
  let supportsWebGL = false;
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');
    supportsWebGL = Boolean(gl && gl instanceof WebGLRenderingContext);
  } catch {
    supportsWebGL = false;
  }

  // 2. Network Speed & Data-Saver Check
  let isDataSaver = false;
  let isSlowNetwork = false;
  const nav = navigator as unknown as {
    connection?: {
      saveData?: boolean;
      effectiveType?: string;
    };
  };

  if (nav.connection) {
    isDataSaver = Boolean(nav.connection.saveData);
    isSlowNetwork = ['slow-2g', '2g'].includes(nav.connection.effectiveType || '');
  }

  // 3. Hardware Concurrency & Memory Check
  let isLowEndDevice = false;
  const hardwareConcurrency = navigator.hardwareConcurrency || 4;
  if (hardwareConcurrency <= 2) {
    isLowEndDevice = true;
  }

  // 4. Mobile screen check with low hardware
  const isMobile = window.innerWidth < 768;
  if (isMobile && (isLowEndDevice || isSlowNetwork || isDataSaver)) {
    isLowEndDevice = true;
  }

  const shouldUseFallback = !supportsWebGL || isDataSaver || (isSlowNetwork && isMobile);

  return {
    supportsWebGL,
    isLowEndDevice,
    isDataSaver,
    shouldUseFallback,
  };
}
