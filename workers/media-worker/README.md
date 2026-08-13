# Media worker

Self-hosted ffmpeg worker for CMS: watches the `MediaJob` table and extracts an
audio-only MP3 from each uploaded sermon video, filling `Sermon.audioUrl`
automatically (only when the sermon has no manually uploaded audio).

Runs anywhere with Node 20+, ffmpeg, and network access to your Postgres —
a $5/month VPS (Hetzner, DigitalOcean, Fly.io, Railway) is plenty. Multiple
replicas are safe: jobs are claimed with `FOR UPDATE SKIP LOCKED`.

## Deploy (Docker)

```sh
docker build -t cms-media-worker .
docker run -d --restart unless-stopped \
  -e DATABASE_URL="postgresql://…"        # the app's Postgres (Neon) \
  -e BLOB_READ_WRITE_TOKEN="vercel_blob…" # same token the app uses \
  cms-media-worker
```

## Deploy (bare Node)

```sh
apt install ffmpeg
npm install
DATABASE_URL=… BLOB_READ_WRITE_TOKEN=… node index.mjs
```

## Env

| Var | Meaning |
| --- | --- |
| `DATABASE_URL` | required — same Postgres the dashboard uses |
| `BLOB_READ_WRITE_TOKEN` | store extracted audio in Vercel Blob (production) |
| `LOCAL_PUBLIC_DIR` / `PUBLIC_BASE_URL` | dev alternative: write into a local `public/` dir |
| `POLL_SECONDS` | poll interval (default 10) |
| `RUN_ONCE=1` | drain the queue once and exit (testing) |

Failures retry up to 3 attempts, then park as `FAILED` with the error kept on
the job row. If the worker is offline nothing user-facing breaks — uploads and
playback don't depend on it; extraction jobs simply wait.
