# ADR-008: S3-compatible object storage + metadata DB

**Status:** Accepted
**Date:** 2026-08-07
**Deciders:** Founding engineering

## Context
The platform stores files and media (sermons, HR documents, child-safety records, service
files). Storing bytes in PostgreSQL bloats the database and complicates access control;
serving from permanently public URLs risks leaking sensitive documents.

## Decision
Store **bytes in S3-compatible object storage** and **metadata in PostgreSQL** (tenant
ownership, access policy, hashes, processing state, relationships). Uploads use short-lived
signed URLs or trusted upload endpoints with size/type validation and malware scanning
where appropriate. Object URLs are **not** authorization: signed-download authorization is
tenant-aware and policy-checked. Private HR, pastoral-care, and child-safety documents are
never served from permanently public URLs. Media processing (thumbnails, transcoding,
transcripts) runs as durable async jobs.

## Alternatives considered
- **Blobs in the database** — poor scaling, expensive backups, awkward access control.
  Rejected.
- **Public bucket URLs as the access model** — treats an unguessable URL as a secret;
  fails for sensitive documents. Rejected.

## Consequences
- Easier: cheap, scalable storage; clean separation of access policy from bytes.
- Harder: signed-URL lifecycle, upload validation, and async processing pipelines must be
  built and monitored.
