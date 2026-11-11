import { NextRequest, NextResponse } from "next/server";
import { isAuthUser, requireApiUser } from "@/lib/auth";
import { createDataView, listDataViews } from "@/lib/data-views";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (!isAuthUser(auth)) return auth;
  try {
    const dataViews = await listDataViews();
    return NextResponse.json({ dataViews });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to list data views";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (!isAuthUser(auth)) return auth;
  try {
    const body = (await req.json()) as {
      title?: string;
      description?: string;
      defaultColumns?: string[];
    };
    const dataView = await createDataView(
      {
        title: body.title ?? "",
        description: body.description,
        defaultColumns: body.defaultColumns,
      },
      auth.username,
    );
    return NextResponse.json({ dataView }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create data view";
    const status = message.includes("required") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
