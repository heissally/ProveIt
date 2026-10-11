import { AskerView } from "./view";

/** The asker's own page. Its URL holds the check they created, which is what results are compared against. */
export default async function Page({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const q = new URLSearchParams(Object.entries(await searchParams).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
  return <AskerView id={id} query={q.toString()} />;
}
