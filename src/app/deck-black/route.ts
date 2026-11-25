import { servirDeck } from "@/lib/deck-publico";

export const dynamic = "force-dynamic";

export async function GET() {
  return servirDeck("deck-black");
}
