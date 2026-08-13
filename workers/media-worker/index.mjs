#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import pg from "pg";

/**
 * Self-hosted media worker (docs/domain/app.md "Self-hosted media"): claims
 * MediaJob rows straight from Postgres (FOR UPDATE SKIP LOCKED — run as many
 * replicas as you like), downloads the sermon video, extracts an audio-only
 * MP3 with ffmpeg, stores it, and fills Sermon.audioUrl when the sermon has
 * none. Runs anywhere Node 20+, ffmpeg, and DATABASE_URL exist — a $5 VPS.
 *
 * Env:
 *   DATABASE_URL           required — same Postgres the app uses
 *   BLOB_READ_WRITE_TOKEN  store results in Vercel Blob (production)
 *   LOCAL_PUBLIC_DIR       …or write into a local public/ dir (dev)
 *   PUBLIC_BASE_URL        base URL for LOCAL_PUBLIC_DIR results (dev)
 *   POLL_SECONDS           default 10
 *   RUN_ONCE=1             process one poll cycle then exit (for testing)
 */

const { Client } = pg;
const POLL_MS = (Number(process.env.POLL_SECONDS) || 10) * 1000;
const MAX_ATTEMPTS = 3;

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

async function storeAudio(organizationId, buffer) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`uploads/${organizationId}/${crypto.randomUUID()}.mp3`, buffer, {
      access: "public",
      contentType: "audio/mpeg",
      addRandomSuffix: false,
    });
    return blob.url;
  }
  const dir = process.env.LOCAL_PUBLIC_DIR;
  if (!dir) throw new Error("Set BLOB_READ_WRITE_TOKEN or LOCAL_PUBLIC_DIR");
  const rel = `uploads/${organizationId}/${crypto.randomUUID()}.mp3`;
  const abs = path.join(dir, rel);
  await rm(abs, { force: true });
  await writeFile(abs, buffer).catch(async (err) => {
    if (err.code !== "ENOENT") throw err;
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, buffer);
  });
  const base = (process.env.PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/${rel}`;
}

function ffmpegExtract(input, output) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-y", "-i", input, "-vn", "-codec:a", "libmp3lame", "-b:a", "128k", output], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-400)}`)),
    );
  });
}

async function processJob(db, job) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "media-job-"));
  try {
    const input = path.join(dir, "input");
    const output = path.join(dir, "audio.mp3");

    log(`job ${job.id}: downloading ${job.sourceUrl}`);
    const res = await fetch(job.sourceUrl);
    if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(input));

    log(`job ${job.id}: extracting audio`);
    await ffmpegExtract(input, output);
    const audioUrl = await storeAudio(job.organizationId, await readFile(output));

    // Fill audioUrl only when the sermon has none — never clobber a manual upload.
    await db.query(
      'UPDATE "Sermon" SET "audioUrl" = $1, "updatedAt" = NOW() WHERE id = $2 AND "organizationId" = $3 AND "audioUrl" IS NULL',
      [audioUrl, job.sermonId, job.organizationId],
    );
    await db.query('UPDATE "MediaJob" SET status = \'DONE\', error = NULL, "updatedAt" = NOW() WHERE id = $1', [job.id]);
    log(`job ${job.id}: done → ${audioUrl}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function claimAndRun(db) {
  const { rows } = await db.query(
    `UPDATE "MediaJob" SET status = 'RUNNING', attempts = attempts + 1, "updatedAt" = NOW()
     WHERE id = (
       SELECT id FROM "MediaJob"
       WHERE status = 'PENDING' AND kind = 'EXTRACT_AUDIO'
       ORDER BY "createdAt" ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING id, "organizationId", "sermonId", "sourceUrl", attempts`,
  );
  const job = rows[0];
  if (!job) return false;
  try {
    await processJob(db, job);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = job.attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING";
    log(`job ${job.id}: ${status === "FAILED" ? "failed permanently" : "will retry"} — ${message}`);
    await db.query('UPDATE "MediaJob" SET status = $1, error = $2, "updatedAt" = NOW() WHERE id = $3', [
      status,
      message.slice(0, 500),
      job.id,
    ]);
  }
  return true;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  log("media worker started");
  for (;;) {
    let worked = false;
    try {
      worked = await claimAndRun(db);
    } catch (err) {
      log("poll error:", err instanceof Error ? err.message : err);
    }
    if (process.env.RUN_ONCE === "1" && !worked) break;
    if (!worked) await new Promise((r) => setTimeout(r, POLL_MS));
  }
  await db.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
