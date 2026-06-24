// Demo mode has been removed from the product. Hook kept for back-compat
// so existing consumers (e.g. ConfigPage) don't break — it always reports
// non-demo.
export function useIsDemo() {
  return {
    isDemo: false,
    planCode: null as string | null,
    planName: null as string | null,
    isLoading: false,
  };
}
