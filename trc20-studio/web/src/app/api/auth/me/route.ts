import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET() {
  const s = await getSession();
  return NextResponse.json({ address: s?.address ?? null });
}
