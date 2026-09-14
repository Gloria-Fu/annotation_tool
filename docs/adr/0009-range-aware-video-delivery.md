# ADR 0009: Range-aware video delivery

## Status

Accepted

## Context

The workbench plays videos directly from the dataset filesystem through the
authorized media endpoint. A full-file response for every seek or reload makes
the API process and the shared filesystem carry more traffic than necessary.
The endpoint must still perform the existing task permission check before
serving a file.

## Decision

The media endpoint supports one HTTP `Range` request and returns `206 Partial
Content` with `Content-Range`, `Content-Length`, `Accept-Ranges`, `ETag`, and
`Last-Modified`. Invalid or unsatisfiable ranges return `416`. Matching
`If-None-Match` or `If-Modified-Since` requests return `304`.

Video responses use browser-private caching for one hour. `Vary: Cookie`
prevents an intermediary from treating an authenticated response as shared.
The Nginx frontend proxy disables response and request buffering only for the
video location, sets a longer read timeout, and forwards the range and cache
validator headers. Other API responses keep the default proxy buffering.

The API remains the authorization boundary. Moving video bytes to Nginx
internal redirects or object storage is a later optimization and requires a
separate storage authorization design.

## Consequences

- Seeking and interrupted playback transfer only the requested byte range.
- The current filesystem layout and Docker/CCI deployment interfaces remain
  unchanged.
- Uvicorn still performs the authorized file read, so very high traffic may
  still require a local cache or object storage.
- Cache entries are private to the browser and are invalidated by the file
  validator when the source changes.
