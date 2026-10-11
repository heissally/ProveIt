import { CallbackView } from "./view";

/** Google or Discord sends the verifier back here with a one-time code. */
export default async function Page({ params, searchParams }: {
  params: Promise<{ provider: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { provider } = await params;
  const q = await searchParams;
  const one = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : null);
  return <CallbackView provider={provider} code={one("code")} state={one("state")} error={one("error")} />;
}
