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
| `public/Logo.svg` | Original vector route mark and wordmark produced by `scripts/generate-original-assets.ts` for Mission Planner | SVG metadata names the owner and portfolio purpose | `EB39240FD80231FD96DE5A50FE66B70F54D1A205B89BF5E5C9A59702536B1D1F` |
| `public/assets/aircraft-marker.png` | Original procedural aircraft marker rendered by the same generator | PNG `Copyright` text chunk names the owner and portfolio purpose | `52834BE2919EE7D8B74ABA019A2C94965FF4F6E1F5E86A92289B977A19382173` |
| `public/assets/drone.glb` | Original low-poly fixed-wing model assembled from procedural box geometry by the same generator | glTF `asset.generator`, `asset.copyright`, and `extras.provenance` fields record its source | `17FDA3AC7368544AB9CD74DBF96E62452A9AFB7E9E9AB4AD7CF468F0EE42A900` |

The hashes above identify the generated files reviewed for this portfolio release. Regenerating them from the committed script produces the same bytes.

## Permitted portfolio use

Copyright © 2026 Goti112. All rights reserved.

The assets may be displayed only as part of the Mission Planner portfolio review and technical-evaluation experience described in [NOTICE.md](../NOTICE.md). No permission is granted to copy, modify, distribute, sublicense, extract, or reuse them for commercial or non-commercial purposes.

This provenance record applies only to the three project-owned files above. Runtime map and terrain content is requested from Mapbox and Cesium under the viewer's separately authorized client credentials and provider terms; it is not redistributed as a repository asset.
