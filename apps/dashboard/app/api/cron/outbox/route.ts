import { NextRequest, NextResponse } from "next/server";
import { drainOutbox } from "../../../../lib/outbox-worker";
import { drainWorkflowRuns } from "../../../../lib/workflow-runner";
import { deliverAttemptableWebhooks } from "../../../../lib/webhook-dispatcher";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Durable backstop for the transactional outbox (BLUEPRINT §38) AND the workflow engine's
 * due runs (elapsed WAIT timers, retry backoffs -- §39 "durable timer, not in-memory
 * sleep"). Form submissions drain opportunistically via after() for low latency, but
 * after() is best-effort -- an external scheduler (Vercel Cron, cron(1), etc.) is expected
 * to call this on an interval so no event or parked run is ever stranded. One endpoint on
 * purpose: a single scheduled job keeps ops simple. Same shared-secret gate as the other
 * /api/cron/* routes (no dashboard session exists in a cron context).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Drain in a few passes so a single cron tick clears a modest backlog.
  let processed = 0;
  let failed = 0;
  let retried = 0;
  for (let i = 0; i < 5; i++) {
    const result = await drainOutbox({ batchSize: 50 });
    processed += result.processed;
    failed += result.failed;
    retried += result.retried;
    if (result.processed + result.failed + result.retried === 0) break;
  }

  // Then advance workflow runs whose WAIT timers or retry backoffs are due.
  const advancedRuns = await drainWorkflowRuns();

  // Then re-attempt webhook deliveries (PENDING or FAILED under the retry cap, §43).
  const webhookAttempts = await deliverAttemptableWebhooks();

  return NextResponse.json({ processed, failed, retried, advancedRuns, webhookAttempts });
}
