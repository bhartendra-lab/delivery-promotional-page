import { notFound } from "next/navigation";
import { readKvData } from "@/lib/kv";
import { ClientPage } from "./ClientPage";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ delivery_landing_page_id: string }>;
};

export default async function ClientLandingPage({ params }: PageProps) {
  const { delivery_landing_page_id: id } = await params;

  let data;
  try {
    data = await readKvData(id);
  } catch {
    data = null;
  }

  if (!data) notFound();

  return <ClientPage id={id} data={data} />;
}
