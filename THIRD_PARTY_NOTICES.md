# Third-party notices

The MIT license in this repository covers the original application code, not third-party dependencies.

| Component | Version | License | Source |
| --- | --- | --- | --- |
| Three.js | 0.180.0 | MIT | https://github.com/mrdoob/three.js |
| Rapier | 0.19.2 | Apache-2.0 | https://github.com/dimforge/rapier.js |
| cubing.js | 0.66.1 | MPL-2.0 OR GPL-3.0-or-later | https://github.com/cubing/cubing.js |
| random-uint-below | 3.3.0 | Unlicense | https://github.com/lgarron/random-uint-below.js |

The generated `docs/vendor/cubing/` files are distributed under MPL-2.0. Their import paths are adjusted for static hosting; original upstream sources are available from the linked repository and the pinned npm package. Original copyright notices are retained. Dependency source and complete metadata remain obtainable through `pnpm install --frozen-lockfile`.

The remaining development and build dependency licenses are recorded in the dependency packages referenced by `pnpm-lock.yaml`.
