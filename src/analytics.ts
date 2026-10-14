const measurementId = "G-PYZBW9R664";
const productionHosts = new Set([
  "income-stats.devedge.biz",
  "income-stats-canada.aj-mulford.workers.dev",
]);

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function initialiseAnalytics() {
  // Local previews and browser tests must not populate production reports.
  if (!productionHosts.has(location.hostname)) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function (..._args: unknown[]) {
    window.dataLayer!.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    page_location: `${location.origin}${location.pathname}`,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.append(script);
}

export function trackEvent(name: string, parameters: Record<string, string | number | boolean> = {}) {
  // Analytics failure must never interrupt resident workflows.
  try {
    window.gtag?.("event", name, { send_to: measurementId, ...parameters });
  } catch {
    // Tracking is optional when blocked or unavailable.
  }
}
