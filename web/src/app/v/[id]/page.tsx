import { VerifierView } from "./view";

export default async function Page({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const q = new URLSearchParams(Object.entries(await searchParams).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
  return <VerifierView id={id} query={q.toString()} />;
}
