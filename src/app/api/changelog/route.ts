import { NextResponse } from "next/server";
import {
  addChangelogEntry,
  changelogList,
  deleteChangelogEntry,
  updateChangelogEntry,
} from "@/lib/db";
import { parseChangelogDraft, parseChangelogPatch } from "@/lib/changelog";
import { requireOperator } from "@/lib/studio";

export const dynamic = "force-dynamic";

/* Same gate as the guest list. The changelog holds nothing secret, but every
   verb here writes, and the console is the only surface that reads it — a
   public changelog page would be a separate, read-only route. */
const unauthorized = () =>
  NextResponse.json({ error: "unauthorized" }, { status: 401 });

const noStore = { headers: { "cache-control": "no-store" } };

async function readJson(request: Request): Promise<{ ok: true; body: unknown } | null> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return null;
  }
}

export async function GET() {
  if (!(await requireOperator())) return unauthorized();

  try {
    return NextResponse.json({ entries: await changelogList() }, noStore);
  } catch (err) {
    console.error("[changelog] list", (err as Error).message);
    return NextResponse.json({ error: "query failed" }, { status: 500 });
  }
}

/** Adds one entry. `code` and `ref` are optional; everything else is required. */
export async function POST(request: Request) {
  if (!(await requireOperator())) return unauthorized();

  const json = await readJson(request);
  if (!json) return NextResponse.json({ error: "invalid json" }, { status: 400 });

  const draft = parseChangelogDraft(json.body);
  if (!draft.ok) return NextResponse.json({ error: draft.error }, { status: 400 });

  try {
    return NextResponse.json({ entry: await addChangelogEntry(draft.fields) }, noStore);
  } catch (err) {
    console.error("[changelog] insert", (err as Error).message);
    return NextResponse.json({ error: "insert failed" }, { status: 500 });
  }
}

/** Edits an entry in place — a retitle, a new type, a ref, or a version move. */
export async function PATCH(request: Request) {
  if (!(await requireOperator())) return unauthorized();

  const json = await readJson(request);
  if (!json) return NextResponse.json({ error: "invalid json" }, { status: 400 });

  const patch = parseChangelogPatch(json.body);
  if (!patch.ok) return NextResponse.json({ error: patch.error }, { status: 400 });

  try {
    const entry = await updateChangelogEntry(patch.id, patch.fields);
    if (!entry) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ entry }, noStore);
  } catch (err) {
    console.error("[changelog] patch", (err as Error).message);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!(await requireOperator())) return unauthorized();

  const json = await readJson(request);
  if (!json) return NextResponse.json({ error: "invalid json" }, { status: 400 });

  const { id } = (json.body ?? {}) as { id?: unknown };
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  try {
    if (!(await deleteChangelogEntry(id))) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: id }, noStore);
  } catch (err) {
    console.error("[changelog] delete", (err as Error).message);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
