# Evidence-Bound Product Blog Design

## Purpose

Add reusable static-blog infrastructure without publishing a Search Receipt post or moving product content into shared ownership. A future product lane can add `sites/<approved-site-id>/blog-registry.json` and product-owned tests; shared code discovers only the four fixed product paths.

## Ownership and data flow

- `sites/shared/blog.ts` owns the generic contract, union validation, rendering, Atom serialization, and derived route inventory.
- Each product owns only `sites/<approved-site-id>/blog-registry.json`; missing registries mean no blog routes.
- `scripts/build-sites.ts` loads all four fixed registry paths, validates the union before emitting anything, and then renders only admitted routes into the existing atomic staging tree.
- `scripts/hash-build.ts` derives the exact allowed blog inventory from the same validated registries. It must reject unregistered blog-like files.
- Controlled fixtures live under `fixtures/shared/` and are never discovered by the production builder.

## Contract

Each registry has `schemaVersion: 1`, an allowlisted `siteId`, index title/description, and posts. Each post has a stable id, slug, feed id, unique title/description, canonical UTC published and modified timestamps, author name/role, editorial disclosure, source bindings, source-bound sections, a currentness boundary, a no-causation boundary, and explicitly typed internal/external links.

The validator rejects missing or empty source bindings, references to undeclared sources, invalid or reversed dates, duplicate site namespaces, ids, slugs, derived canonicals, or feed ids, unapproved site ids, non-allowlisted links, current-status claims, and causation claims. Validation is union-wide and returns no admitted routes when any registry is invalid.

## Rendering and safety

The renderer produces a self-canonical product blog index, self-canonical post pages, deterministic Atom entries, and sitemap paths. All contract text and links are escaped. Pages use the existing static renderer and CSP, with no script, form, storage, telemetry, account, or runtime network client. Source links remain user-initiated HTTPS links; no source is fetched.

## Compatibility

At v0.1.56 all product registries are missing, so the public route inventory and output bytes remain unchanged. The four existing products, atomic rollback, deterministic manifests, and the AI Moment Index `#t=132` route remain covered by the existing regression suite.
