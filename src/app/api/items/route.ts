import { connection } from "next/server"
import { addItem, InputError, parseInput, readAdded, removeItem, updateItem } from "@/lib/added-store"

const fail = (e: unknown) =>
  e instanceof InputError
    ? Response.json({ error: e.message }, { status: e.status })
    : Response.json({ error: `Could not save: ${(e as Error).message}` }, { status: 500 })

/** Items people added in the app. */
export async function GET() {
  await connection()
  try {
    return Response.json(await readAdded())
  } catch (e) {
    return fail(e)
  }
}

/** Add one item: { sheet, fields: { ItemNumber, ItemDescription, … } } */
export async function POST(request: Request) {
  try {
    const item = await addItem(parseInput(await request.json().catch(() => null)))
    return Response.json(item, { status: 201 })
  } catch (e) {
    return fail(e)
  }
}

/** Edit an added item: /api/items?uid=… with the same body as POST. */
export async function PUT(request: Request) {
  const uid = new URL(request.url).searchParams.get("uid")
  if (!uid) return Response.json({ error: "Which item? Missing uid." }, { status: 400 })
  try {
    return Response.json(await updateItem(uid, parseInput(await request.json().catch(() => null))))
  } catch (e) {
    return fail(e)
  }
}

/** Remove an added item: /api/items?uid=… (only items added in the app can be removed). */
export async function DELETE(request: Request) {
  const uid = new URL(request.url).searchParams.get("uid")
  if (!uid) return Response.json({ error: "Which item? Missing uid." }, { status: 400 })
  try {
    await removeItem(uid)
    return new Response(null, { status: 204 })
  } catch (e) {
    return fail(e)
  }
}
