import { fetchTicket, TicketError } from "@/lib/jotform"

/** Item class for a Finished Goods ticket: /api/jotform/ticket?no=ERP-003421 */
export async function GET(request: Request) {
  const no = new URL(request.url).searchParams.get("no") ?? ""
  try {
    return Response.json(await fetchTicket(no))
  } catch (e) {
    if (e instanceof TicketError) return Response.json({ error: e.message }, { status: e.status })
    return Response.json({ error: `Could not read Jotform: ${(e as Error).message}` }, { status: 502 })
  }
}
