import { handlers } from "../../../../auth";

// Force Node runtime: bcryptjs and the Prisma client used inside authorize() don't
// run on the edge runtime (build-plan decision).
export const runtime = "nodejs";

export const { GET, POST } = handlers;
