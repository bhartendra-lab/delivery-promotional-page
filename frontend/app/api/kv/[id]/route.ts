import { NextResponse, type NextRequest } from "next/server";
import { readKvData } from "@/lib/kv";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    const data = await readKvData(id);
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "KV read failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
