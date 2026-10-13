"use client";

/**
 * Vercel Web Analytics (cookieless page-view counts), with every address scrubbed
 * before it leaves the browser: see lib/analytics-redact.ts.
 */
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { redactAnalyticsUrl } from "../lib/analytics-redact";

export function SafeAnalytics() {
  return (
    <Analytics
      beforeSend={(event: BeforeSendEvent) => {
        const url = redactAnalyticsUrl(event.url);
        return url ? { ...event, url } : null;
      }}
    />
  );
}
