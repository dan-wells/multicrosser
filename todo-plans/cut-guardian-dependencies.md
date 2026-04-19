# Cut Guardian-specific dependencies from react-crossword

## Goal

Keep using `@guardian/react-crossword` as an npm dependency with our existing patch, but eliminate the Guardian-specific peer dependencies. This would remove ~5.4MB of Guardian packages while keeping only `@emotion/react` (1.3MB), which is a general-purpose CSS-in-JS library.

## Dependencies to remove

### @guardian/libs (964KB) — trivial

Used in 10 of 35 built files, but only for 3 utility functions:
- `isUndefined(x)` → `x === undefined`
- `isString(x)` → `typeof x === 'string'`
- `log()` → `console.log` or remove

A few lines added to the patch.

### @guardian/source (4MB) — moderate

Used in 9 of 35 built files for:
- **Design tokens**: typography (`textSans12`, `textSansBold17`, `headlineBold17`, etc.), `space`, `palette`, `visuallyHidden`
- **UI components**: `Button`, `TextInput`, `SvgCross`, `SvgTickRound`

Replace tokens with our own CSS values (we already override most of them in `crossword-overrides.css`). Replace UI components with plain HTML elements. `SvgCross` can just be an ASCII `x`.

### @guardian/ophan-tracker-js (472KB) — free

Analytics tracker pulled in transitively by `@guardian/libs`. Goes away when `@guardian/libs` is removed.

## What stays

### @emotion/react (1.3MB) — too deep to remove

Used in 28 of 35 built files for both JSX rendering (`jsx-runtime`) and styling (`css` function). Removing it would mean rewriting how every component renders — that's a fork, not a patch. It's not Guardian-specific.

## Approach

Extend the existing Yarn patch to replace Guardian imports with inline equivalents. The patch is already maintained for multiplayer hooks (`onMove`, `setCellValue`, etc.), so the incremental maintenance cost is moderate.

## Tradeoff

A larger patch to maintain across version bumps, but no Guardian-specific dependencies to install or keep compatible.

## How dependency handling works

The Guardian packages listed as peer dependencies in `@guardian/react-crossword` only get installed if we explicitly include them in our own `package.json`. Yarn will warn about unmet peer deps but won't block.

More importantly, the client bundle only includes code that's actually `import`ed in the dependency graph. The bundler (esbuild) traces imports from our entry point — if the patch removes all `@guardian/source` and `@guardian/libs` imports from the react-crossword built files, those packages never end up in what browsers download, even if they're still sitting in `node_modules`.

So the wins from cutting these dependencies are:
- **Faster installs** — smaller `node_modules`
- **No version compatibility headaches** — don't need to keep `@guardian/source` v12 in sync with future react-crossword versions
- **Cleaner `package.json`** — fewer things to understand and maintain

Client bundle size is already determined by what the code actually imports, which the patch controls.
