import type { Metadata } from "next";
import { StatsView } from "./view";

export const metadata: Metadata = { title: "Stats · ProveIt", robots: { index: false, follow: false } };

export default function Page() {
  return <StatsView />;
}
