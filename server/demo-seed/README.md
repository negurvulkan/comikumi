# Demo seed content

Sample pages for the public demo's seeded project (`DEMO_MODE=true`, see
`server/src/lib/demoMode.ts`). This folder is copied verbatim into each demo
container's writable data dir on first boot and becomes that container's `scanRoot`.

## Expected layout

One subfolder per sample volume, containing a `<VolumeName>_empty` folder with the
scanned page images directly inside it — nest it at least one level below
`server/demo-seed/` itself (don't put `..._empty` directly at the top level):

```
server/demo-seed/
  Demo Volume 01/
    Demo Volume 01_empty/
      001.jpg
      002.jpg
      ...
```

A volume's id is its path relative to `scanRoot` — a volume whose `..._empty` folder
sits directly at the top level resolves to an empty id (`""`), which breaks its
`/api/volumes/:id/...` routes (an Express routing artifact, not demo-mode-specific).
The one level of nesting above avoids that.

- Folder suffix must be `_empty` (the project's default `emptySuffix`, see
  `shared/src/settings.ts`).
- Page image files: `.png`, `.jpg`, `.jpeg`, or `.webp` (`PAGE_IMAGE_EXTENSIONS` in
  `server/src/lib/projectScanner.ts`).
- Keep the total page count at or below `DEMO_MAX_PAGES` (default 8, see
  `server/src/lib/demoMode.ts`) — visitors can add pages up to that cap themselves, so
  shipping fewer than the cap leaves room for them to try the upload flow too.
- Use only content you have the rights to publish — this folder ships inside the
  public demo Docker image.

This directory is intentionally empty in version control aside from this file; add
your own sample volume folder(s) here before building the demo image
(see `Dockerfile`).
