# Phase 2: Quran Page Asset Storage — Evaluation

Status: design/evaluation only. No source code changed by this document.

## 1. Current state

The app renders one of 604 immutable Quran mushaf page images per active question. Every page is stored as a base64 string inside a root Firestore collection, one document per page.

**Write path** — `scripts/upload_quran_images.py`:
- Finds a local directory of `{pageNumber}.png` files (tries `~/Downloads/small`, `obs/assets/quran`, `assets/quran`, etc. — none of these are committed to the repo; see `find_quran_images_directory()`, lines 68–99).
- For each file, base64-encodes the bytes and stores the **full data URI** in the `page` field:
  ```python
  # scripts/upload_quran_images.py:146-149
  base64_data = base64.b64encode(image_data).decode('utf-8')
  # Add data URL prefix for consistency
  page_data = f"data:image/png;base64,{base64_data}"
  ```
  Document shape at `quran/{pageNumber}`: `{ filename, page: "data:image/png;base64,<...>", pageNumber, uploadedAt }`.

**Read path** — `src/hooks/useQuranPage.ts:7-11`:
```ts
const pageDoc = await getDoc(doc(firestore, "quran", pageNumber.toString()));
return { page: pageDoc.data().page };
```
Returns the Firestore field verbatim (already a full data URI).

**Render path** — `src/components/ui/QuranViewer.tsx:92`:
```tsx
<img src={`data:image/png;base64,${pageData.page}`} ... />
```

**The bug**: the uploader already writes the `data:image/png;base64,` prefix into `page` (upload_quran_images.py:149). The viewer prepends that same prefix again (QuranViewer.tsx:92). The resulting `src` is `data:image/png;base64,data:image/png;base64,<actual base64>` — a doubly-prefixed data URI. The extra literal text `data:image/png;base64,` sits where valid base64 payload should start; browsers either fail to decode it or silently render a broken image depending on how forgiving their data-URI/base64 parser is. `scripts/get_quran_images.py:97-99` shows the *correct* handling was known — it strips the prefix before decoding when reading pages back out — but that fix was never applied on the render path. This is a real, live rendering bug, not just an inefficiency; it should be called out to whoever owns the `quran-page` and `big-screen` routes independent of any storage migration.

**Consumers**: `src/routes/quran-page.lazy.tsx` and `src/routes/big-screen.lazy.tsx` both mount `QuranViewer`, driven by `useActiveParticipant()`'s `activeQuestion` page number. `src/lib/quranUtils.ts` holds a build-time-only juz→page range map (explicitly documented as not to be used at runtime — see its docstring referencing `docs/migrations/phase-1-greenfield.md §3`).

**Testability gap**: `scripts/seed-firestore-emulator.mts` seeds participants, events, evaluation configs, etc., but does **not** seed the `quran` collection at all. Today, running the app against the Firestore emulator means `QuranViewer` always renders its "no participant"/empty state for the page image — there is no fixture path that exercises real image rendering under test.

**Infra note**: `firebase.json` currently configures only `firestore` and `hosting` (serving `dist`) — no `storage` block, no `storage.rules`. Firebase Storage is not enabled/wired into this project today; adding it is a small but real new surface (new rules file, new SDK import, new emulator config), not a zero-cost flip.

## 2. Requirements

1. Serve 604 **immutable** page images (write-once, essentially never change after upload) to three consumers: `big-screen`, `quran-page` (jury display), and any future viewer.
2. Fast first paint on a large-screen display during live competition — this is a real-time, judge/audience-facing UI, not a background job. Cache-friendly, low-latency delivery matters more than write throughput.
3. Must remain testable offline / under the Firestore emulator (or an equivalent local fixture) without requiring live cloud credentials for every contributor running `npm test` / `npm run dev`.
4. Low ongoing cost — this is a small competition app, not a high-traffic consumer product; a few hundred MB of assets served to at most a few dozen concurrent screens per event.
5. Minimal new vendor/infra surface — the project is already on Firebase/GCP (Firestore + Firebase Hosting configured, `fip-hifz` GCP project exists). A new cloud vendor account is a real ongoing cost (another dashboard, another IAM boundary, another thing to rotate credentials for) even if unit pricing looks attractive.

## 3. Why Firestore base64 is the wrong store

- **Document size ceiling.** Firestore hard-caps documents at 1 MiB, counting field names, values, and metadata. A single high-resolution mushaf page PNG (mushaf scans commonly run 150–500 KB depending on source/DPI) is already a meaningful fraction of that budget before encoding overhead; a higher-resolution or color scan risks blowing the limit outright, and there is no room to add fields (translations, per-page metadata, alternate editions) later without risking the ceiling.
- **Base64 bloat.** Base64 encoding inflates binary payload size by ~33% (4 bytes of text per 3 bytes of binary). Every page pays this tax on both write and read, and it's pure waste — Cloud Storage/CDN options serve the original binary bytes directly.
- **No CDN, no HTTP caching.** Firestore reads go through the Firestore client SDK/API, not a CDN edge. Every viewer load re-fetches and re-decodes the full base64 blob from Firestore's backend — no `Cache-Control`, no `ETag`, no browser disk cache reuse across sessions the way a plain `<img src>` to a static URL gets for free.
- **Cost shape.** Firestore document reads are billed per read regardless of payload size, and large documents multiply Firestore's internal storage/replication cost for something that is fundamentally a static file, not transactional data. It's paying database-grade pricing and consistency guarantees for content that never changes.
- **This is a widely documented Firestore anti-pattern** — the standard Firebase guidance is to store binary assets in Cloud Storage and keep Firestore documents to just a reference URL.

## 4. Options compared

| | Cost / egress (2026) | CDN | Setup complexity | Vendor fit (already Firebase/GCP) | Immutability / versioning |
|---|---|---|---|---|---|
| **Firebase Storage + Hosting rewrite** | Storage ~$0.026/GB-mo; egress via Firebase Hosting CDN cache ~$0.15/GB beyond free 360 MB/day (Spark) or pay-as-you-go (Blaze); at this asset volume (tens of MB) effectively free | Yes — Firebase Hosting's global CDN, or Storage's own edge caching | Low-medium — new `storage.rules`, new bucket, new SDK path, but same console/project | Best — same Firebase project, same `firebase deploy`, same auth model | Native versioning via object generations; simple to make paths immutable by convention |
| **Google Cloud Storage + Cloud CDN** | GCS storage ~$0.02/GB-mo; direct GCS egress from $0.12/GB, **Cloud CDN cache egress from $0.08/GB** (drops to $0.02/GB past 500 TB/mo); Storage→CDN transfer itself is not separately billed | Yes — dedicated Cloud CDN in front of a GCS backend bucket | Medium — load balancer + CDN + backend bucket config is real infra to stand up and maintain (Terraform/console), more moving parts than Firebase Hosting | Good — same GCP project/billing, but a materially bigger infra footprint than just using Firebase Hosting | Object versioning available; requires you to own cache invalidation config |
| **Cloudflare R2 (+ custom domain)** | Storage $0.015/GB-mo; **zero egress fees** on all reads via custom domain/public bucket; free tier covers 10 GB storage + 10M Class B ops/mo outright | Yes — Cloudflare's edge network in front of a custom-domain-bound bucket | Medium — new Cloudflare account, new DNS/custom-domain binding, separate credentials/API tokens to manage outside GCP IAM | Weakest — a genuinely new vendor, new billing relationship, new auth surface for a project that has no other Cloudflare presence | Bucket has no native object versioning (opt-in via lifecycle rules); immutability is a convention you enforce yourself |
| **AWS S3 + CloudFront** | S3 storage ~$0.023/GB-mo; S3→CloudFront origin transfer $0/GB (as of late 2024); CloudFront egress to users from $0.085/GB (US tier), higher outside US/EU | Yes — CloudFront is a mature, well-documented CDN | Medium-high — new AWS account, IAM, billing, region choice, bucket policy, CloudFront distribution | Weakest — a second full cloud vendor for a project with zero existing AWS footprint | S3 versioning is native and mature; CloudFront invalidation is a well-known workflow |

Two-to-three sentence notes:

- **Firebase Storage + Hosting**: storage is cheap and Firebase Hosting already fronts every static asset the app ships (the SPA bundle itself) with a free global CDN, so adding `/quran/*` under the same rewrite/serving path reuses infra that's already deployed and paid for. The only real cost is standing up `storage.rules` and, if serving via Hosting rewrites, a rewrite rule — otherwise it's Firebase Storage's own public-read URLs, which are also CDN-cached. ([Firebase Storage pricing](https://firebase.google.com/pricing), [Firebase Hosting usage & pricing](https://firebase.google.com/docs/hosting/usage-quotas-pricing))
- **GCS + Cloud CDN**: technically the most "proper" GCP static-asset architecture and cheaper per GB at real scale, but it requires provisioning a backend bucket, load balancer, and CDN configuration that this project has no existing Terraform/infra-as-code for — meaningful setup cost for 604 files totaling well under 1 GB. ([Cloud CDN pricing](https://cloud.google.com/cdn/pricing), [Cloud Storage pricing](https://cloud.google.com/storage/pricing))
- **Cloudflare R2**: the cheapest option at any real traffic volume because egress is genuinely free, and the free tier alone likely covers this entire 604-page set forever — but it's a new vendor account, new credentials, and a DNS/custom-domain binding to maintain outside the existing Firebase/GCP project, for an app whose total transfer volume will never be large enough for R2's egress advantage to matter in absolute dollars. ([R2 pricing](https://developers.cloudflare.com/r2/pricing/), [R2 zero egress](https://www.cloudflare.com/products/r2/))
- **S3 + CloudFront**: mature and well-understood, but it's the only option here that adds a second cloud provider entirely — new billing account, new IAM boundary, new region/latency considerations — for content whose home (GCP) is already a five-minute setup away. ([CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/), [S3 pricing 2026 breakdown](https://infratally.com/articles/aws-s3-pricing-explained-2026/))

## 5. Recommendation

**Firebase Hosting static assets (preferred), with Firebase Storage as the fallback if the asset set needs to be updated independently of app deploys.**

Given the actual scale here — 604 immutable images, plausibly 40–150 KB each as WebP, so roughly 25–90 MB total — this is a case where the "proper" CDN infrastructure (GCS+Cloud CDN, R2, S3+CloudFront) is over-engineering relative to the requirement. Firebase Hosting is already configured (`firebase.json` → `"hosting": { "public": "dist", ... }`), already deploys on every release, and already gives every asset it serves a global CDN, HTTP caching, and `Cache-Control` headers for free. The concrete proposal:

1. Convert and place the 604 pages under `public/quran/{edition}/{page}.webp` (or wherever the build's static-asset root is configured) so they get copied into `dist/` and deployed by the existing `firebase deploy --only hosting` flow.
2. Serve them at an **immutable URL scheme**: `/quran/{edition}/{page}.webp`, e.g. `/quran/hafs-madani-v1/312.webp`. The `{edition}` segment matters even with a single edition today — it future-proofs against ever needing a second mushaf print/riwayah without a URL collision, and it makes the manifest (below) meaningful.
3. Set long-lived, immutable cache headers on that path via `firebase.json`'s `hosting.headers`, e.g.:
   ```json
   {
     "source": "/quran/**",
     "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
   }
   ```
   This is safe specifically *because* the content is genuinely immutable (604 fixed pages) — if a page image is ever wrong and needs correcting, it must be re-uploaded under a **new path** (e.g. a new edition/version segment), not overwritten in place, or every CDN edge and every browser that cached the old bytes for a year will keep serving the stale image.
4. Ship a small **manifest** (`public/quran/hafs-madani-v1/manifest.json`) mapping page number → filename → checksum (sha256) and byte size. This gives the app (and any future integrity check / CI step) a single source of truth for "all 604 pages are present and match what was uploaded," independent of Firestore, and is the natural place to record edition metadata later.

**Strongest alternative**: Cloudflare R2. If this project's asset needs grow substantially (many editions, translations, audio, video — not just 604 static page scans) or traffic ever moves outside the small live-competition use case, R2's zero-egress pricing becomes the more defensible long-term choice, and it's worth revisiting then. For the problem as stated today, the new-vendor cost outweighs a bandwidth saving that's already close to zero on this asset volume.

## 6. Migration outline

**Precondition, must happen first**: the 604-page source image set must be located and its license/provenance confirmed. It is not committed to the repo; `upload_quran_images.py` only knows to look in a handful of local developer directories (`~/Downloads/small`, `obs/assets/quran`, etc.) that clearly assume the images live on whoever originally ran the script's machine. Before any migration work starts, someone needs to either recover that original image set or re-source a mushaf page-image set with a license compatible with redistributing it inside this app's static bundle (many freely-available mushaf image sets are watermarked or restrict redistribution — this needs a real check, not an assumption).

Once the source set is in hand:

1. **Conversion/upload tool** — replace `scripts/upload_quran_images.py`'s Firestore-batch-write logic with a script that: reads each `{page}.png`, converts to WebP (or keeps PNG if WebP introduces visible quality loss on scanned Arabic script — needs a visual check, not just a size assumption), writes it to `public/quran/{edition}/{page}.webp`, and appends its checksum/size to `manifest.json`. Keep the numeric-sort/dedup logic from the existing script; drop the Firestore/`firebase_admin` dependency entirely, or repoint it at Storage if the Firebase Storage fallback is chosen instead.
2. **Hook change** — replace `useQuranPage`'s Firestore `getDoc` with a plain URL builder: `buildQuranPageUrl(edition, pageNumber) => "/quran/{edition}/{pageNumber}.webp"`. This can stay a `useQuery`-shaped hook (for consistency with existing call sites in `quran-page.lazy.tsx`/`big-screen.lazy.tsx`) but the "fetch" becomes trivial — there's no async Firestore round-trip left, just a string, plus optionally a `HEAD`/`Image.onload` check if the UI wants explicit load/error states.
3. **Viewer change** — `QuranViewer.tsx` swaps its `<img src={`data:image/png;base64,${pageData.page}`}>` for `<img src={pageUrl} loading="eager">` (this fixes the double-prefix bug as a side effect of the migration, but see the note in §1 — that bug is real today and worth a standalone one-line fix if this migration is not imminent). Existing loading/error/no-participant states in the component can be kept largely as-is, just re-pointed at URL load state instead of Firestore query state.
4. **Fallback / error state** — if a page URL 404s (manifest/asset drift), show the existing "no participant"/error UI rather than a broken `<img>`; this is a small addition to `QuranViewer`'s existing conditional rendering.
5. **Emulator/offline testability** — this is actually a net improvement over today. Static assets under `public/` are served by the local Vite dev server and by `firebase serve`/`firebase emulators:start` (Hosting emulator) with zero extra fixture work, unlike the current state where `seed-firestore-emulator.mts` doesn't seed `quran` at all. For unit/component tests that don't want the real 604-page set, drop a handful of placeholder WebP fixtures under a test-only path and point tests at those — no Firestore emulator involvement needed for this feature at all once migrated.
6. **Verification** — after upload, script should re-derive checksums for every file under `public/quran/{edition}/` and diff against `manifest.json` (catches truncated conversions/uploads); manually spot-check a sample of pages by rendering them in the actual `QuranViewer` (`big-screen` and `quran-page` routes) before considering the migration done, given the existing double-prefix bug shows this rendering path has gone unverified before.
7. **Cleanup** — once migrated and verified, delete the `quran` Firestore collection (604 documents) to stop paying for it, and retire/rewrite `get_quran_images.py` (it becomes a "re-derive PNGs from the static asset set" tool, or can be deleted if the source PNGs are archived separately e.g. in cloud storage or a private repo).

## 7. Open risks / decisions the human must make

1. **Source image set is missing.** This blocks everything. Someone must locate the original 604-page PNGs (or confirm they only exist as the current base64 blobs in the live Firestore `quran` collection, in which case "migration" starts with an export-from-Firestore step using a fixed version of `get_quran_images.py`, not a fresh scan).
2. **Licensing.** If a new/different mushaf image source is used, its license for redistribution inside a deployed web app must be confirmed — this is a real legal/product decision, not an engineering one.
3. **Firebase Hosting vs. Firebase Storage.** This doc recommends Hosting (simplest, reuses existing deploy flow) but that couples the image set to app deploys — updating a single mis-scanned page requires a full app redeploy. If the images need to be updatable independently (e.g. by a non-engineer, or without a full CI/CD run), Firebase Storage with public read rules is the better fit despite the slightly higher setup cost. This is a genuine tradeoff the human should pick, not something to default silently.
4. **Edition/versioning scope.** Is there currently, or will there ever be, more than one mushaf edition/riwayah in use? If genuinely never, the `{edition}` URL segment can be dropped for simplicity — but it's cheap insurance to keep it now versus a breaking URL-scheme migration later.
5. **WebP vs. PNG.** WebP is recommended for size, but scanned Arabic script at competition-display resolution should be visually spot-checked before committing to lossy WebP — if any artifacting is visible on a big screen, lossless WebP or PNG should be used instead; this is a visual-quality call, not purely a size optimization.
6. **The double-prefix render bug (§1) is live today** regardless of this migration's timeline — worth flagging to whoever owns `QuranViewer.tsx`/`useQuranPage.ts` as a fix-now-or-fix-during-migration decision.
7. **Cost is not the deciding factor here** — at 604 static images totaling well under 1 GB, all four options are effectively free at this project's traffic scale (a handful of screens per live event). The real differentiators are vendor surface and operational simplicity, which is why this doc weights those more heavily than raw per-GB pricing.
