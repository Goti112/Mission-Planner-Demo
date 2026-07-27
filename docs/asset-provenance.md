# Asset Provenance

The three visual assets shipped by the public demo are original Mission Planner assets generated from repository-owned source. Their prior versions did not carry enough origin or reuse evidence for public portfolio release, so Task 8 replaced them rather than relying on unverifiable provenance.

## Reproducible originals

Run the generator with Node.js 24:

```powershell
node scripts/generate-original-assets.ts
```

The generator uses only Node.js built-in modules and deterministic geometry or pixels. It does not download, trace, embed, or derive from third-party artwork.

| Published asset | Origin | Embedded evidence | SHA-256 |
| --- | --- | --- | --- |
| `public/Logo.svg` | Original vector route mark and wordmark produced by `scripts/generate-original-assets.ts` for Mission Planner | SVG metadata names the owner and portfolio purpose | `89F9AAC1124A92D9C7C59F2C44C8E7EE550CB1BBE8194DF7964E58B6481CC195` |
| `public/assets/aircraft-marker.png` | Original procedural aircraft marker rendered by the same generator | PNG `Copyright` text chunk names the owner and portfolio purpose | `9271C71666CA59C3286F6817481C259829BE281BF475DB8BCAFECA84F21A705A` |
| `public/assets/drone.glb` | Original low-poly fixed-wing model assembled from procedural box geometry by the same generator | glTF `asset.generator`, `asset.copyright`, and `extras.provenance` fields record its source | `48A9917C5E8DBCD2CE8BAEC7C4AE660D104C1C1D00318F83F7DD4C25B486AA7E` |

The hashes above identify the generated files reviewed for this portfolio release. Regenerating them from the committed script produces the same bytes.

## Permitted portfolio use

Copyright © 2026 Goti112. All rights reserved.

The assets may be displayed only as part of the Mission Planner portfolio review and technical-evaluation experience described in [NOTICE.md](../NOTICE.md). No permission is granted to copy, modify, distribute, sublicense, extract, or reuse them for commercial or non-commercial purposes.

This provenance record applies only to the three project-owned files above. Runtime map and terrain content is requested from Mapbox and Cesium under the viewer's separately authorized client credentials and provider terms; it is not redistributed as a repository asset.
