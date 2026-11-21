/**
 * Next.js Server Boot Hook
 * Runs runtime integrity checks (payment mode match & production trusted IP readiness).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { runServerStartupChecks } = await import('@/lib/startupChecks');
    await runServerStartupChecks();
  }
}
