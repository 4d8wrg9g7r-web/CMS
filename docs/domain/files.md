# Files (private file primitive)

**Status:** Implemented (v1)
**Owner:** Platform
**Reliability tier:** C (operational)

Implements the [BLUEPRINT §41 (File and media architecture)](../architecture/BLUEPRINT.md#41-file-and-media-architecture)
foundation and the `File` primitive (§4): **object storage holds bytes; PostgreSQL holds
metadata, tenant ownership, and access policy** — and private files are **never served
from public URLs**. Every download passes server-side authorization on every request
("object URLs are not authorization", §32). Complements the existing public storage seam
(logos/branding), which remains for genuinely public assets.

## Problem
Churches attach documents to people (notes, signed forms brought in on paper). Those are
Confidential and must not land in the public assets bucket. Staff need upload, list,
download, and archive on a Person — with access checked at download time and an audit
trail. Success = a staff member attaches a PDF to a person; only Owner/Admin can ever
fetch it; the fetch is audited.

## Actors
- **Owner / Admin** — upload, list, download, archive (files inherit related-entity
  sensitivity; v1 relations are Person-only → Confidential posture).
- **Other roles** — no access; negative tests enforce.

## Scope
- **Included (v1):** `PrivateStorageProvider` seam in `packages/storage` (put/get/delete
  by key) with a filesystem implementation (path-traversal-guarded, outside any public
  dir); `File` metadata model with tenant-prefixed storage keys
  (`<orgId>/<cuid>-<sanitized-name>`); upload via staff server action (size/type-name
  validation, 10 MB cap); download via an authorizing route handler that streams bytes
  after per-request permission + tenant checks and **audits the access** (§47
  data-access class); soft archive; a Files panel on the Person page.
- **Explicitly excluded (non-goals, deferred):** direct-to-storage signed upload URLs
  (needs a cloud provider; the seam is ready), malware scanning, media processing
  pipelines (thumbnails/transcoding are §41 async jobs for the media engine), relations
  beyond Person (HR/pastoral docs arrive with those modules and their stricter
  policies), retention/legal-hold policies.

## Data
- **File** — `organizationId`, `fileName` (display), `contentType`, `sizeBytes`,
  `storageKey` (unique; tenant-prefixed), `relatedPersonId?` (SetNull),
  `uploadedByUserId?`, `archivedAt?`, timestamps. Guard-registered.

## Permissions
`file.view` / `file.manage` — Owner/Admin; pure matrix, negative-tested; enforced in the
upload action, the panel, and **the download route on every request**.

## Storage seam
`LocalPrivateStorageProvider(baseDir)` writes under a non-public directory; keys are
sanitized (`sanitizeStorageKey`) so `../` can never escape the base. Swapping in
S3/R2/Blob-private later touches only the provider (§54 adapter posture).

## Audit
`file.uploaded`, `file.archived`, and `file.downloaded` (data-access audit — §47 calls
out viewing/export of person-related documents).

## Tests
- **Unit (pure):** `sanitizeFileName`/`buildStorageKey` (traversal, weird chars, length),
  permission matrix negatives, guard registration; storage-package tests for the private
  provider (roundtrip, delete, traversal rejection).
- **Live smoke:** metadata + provider roundtrip, tenant scoping, guard.

## Migration
Additive `add_files` — one table, indexes, FKs.

## Unresolved risks
- **Local provider durability** — filesystem storage is a dev/single-node answer; a
  cloud private bucket is the production path (env-switched like the public seam).
- **Size cap** — 10 MB inline upload; large media waits for signed-URL uploads.
