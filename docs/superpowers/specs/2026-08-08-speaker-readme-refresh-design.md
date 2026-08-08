# Speaker Documentation Refresh Design

## Goal

Bring the public overview and speaker-label documentation in line with the current `feat/speaker-diarization` branch.
Explain the user-visible behavior without exposing internal implementation details or promising unmeasured accuracy or legal compliance.

## Scope

Update `README.md` and `docs/features/speaker-labels.mdx` together so they do not contradict each other.
Do not add an unreleased changelog entry or choose a release version.

The README update will:

- add an August 8 speaker entry to **What's New** and keep that section to four current entries;
- distinguish channel labels (`[You]` and `[Others]`) from individual speaker separation (`Speaker 2`, `Speaker 3`, and similar labels);
- describe transcript review, renaming, multi-person markings, and representative sample playback;
- explain that cross-meeting named-person matching is optional, off by default, and disabled once for existing installations that inherited the former default;
- state that numerical biometric voice profiles stay on the device, suggestions require review, and profile deletion does not delete recordings or transcripts;
- state that individual speaker separation and named voice profiles are currently macOS-only, while Windows retains channel labels;
- remove completed roadmap items and keep only verified open work;
- add the speaker sidecar build step to local development instructions.

The speaker-label feature page will replace its obsolete roadmap language with the same product behavior and platform boundaries.

## Wording boundaries

Do not claim that Steno automatically knows who is speaking.
Named suggestions come only from profiles created from user-confirmed excerpts and can be wrong.

Do not publish accuracy figures because the repository does not contain a release-ready benchmark result.
Do not claim GDPR, consent, or other legal compliance.
The product confirmation records the user's responsibility to inform the affected person and establish an appropriate legal basis.

Do not use implementation names such as Sortformer, WeSpeaker, FluidAudio, sidecar, or embeddings in user-facing feature copy.
The local development instructions may name the build script because contributors need that command.

Sample playback must be qualified as available only while a suitable source recording is retained.

## Verification

Check every platform and privacy statement against the current branch implementation and public privacy documentation.
Run Markdown formatting and link checks available in the repository, build the documentation site, inspect the rendered README diff, and scan the final change for private data.
