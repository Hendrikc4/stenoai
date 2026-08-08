# Speaker Documentation Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the repository README and public speaker-label documentation in line with the release-ready speaker diarization branch.

**Architecture:** Treat `README.md` as the concise product and contributor overview and `docs/features/speaker-labels.mdx` as the detailed user guide.
Both documents will share the same terminology, privacy boundaries, and platform limits while avoiding implementation details in product copy.

**Tech Stack:** Markdown, MDX, GitHub README rendering, Mintlify documentation.

## Global Constraints

Do not add an unreleased changelog entry or choose a release version.
Do not claim automatic identity recognition, measured accuracy, consent collection, GDPR compliance, or other legal compliance.
State that named-person matching is optional, off by default, and disabled once for existing installations that inherited the former default.
State that individual speaker separation and named voice profiles are currently macOS-only, while Windows retains `[You]` and `[Others]` channel labels.
Qualify representative sample playback as available only while suitable source audio is retained.
Keep implementation names out of product copy, except for the contributor-facing `scripts/build-diarize-sidecar.sh` command.
Write every complete Markdown sentence on its own physical line.

---

### Task 1: Refresh the README product overview

**Files:**
- Modify: `README.md:44-84`
- Modify: `README.md:154-160`
- Modify: `README.md:220-253`

**Interfaces:**
- Consumes: the user-visible behavior in `app/renderer/src/components/SpeakerReviewPanel.tsx`, `app/renderer/src/routes/settings/PeopleTab.tsx`, and `src/config.py`.
- Produces: the canonical concise product wording reused by Task 2.

- [ ] **Step 1: Update What's New**

Add an August 8 entry explaining that Steno now separates individual speakers inside a recording, supports transcript review and renaming, and keeps cross-meeting named-person matching off by default.
Keep the four newest entries by removing the older automatic-update entry.

- [ ] **Step 2: Add separate feature bullets for individual speakers and named people**

Keep the existing live transcription/channel-label bullet.
Add one bullet for anonymous `Speaker 2` and `Speaker 3` separation and another for optional named people.
Mention macOS-only availability, the Windows channel-label fallback, local numerical biometric profiles, human review, Settings > AI, Settings > People, deletion boundaries, and conditional sample playback.

- [ ] **Step 3: Remove completed roadmap items**

Delete live transcription, NVIDIA Parakeet, and editing notes from the roadmap because the README already documents them as shipped.
Keep only verified open work: Windows GA hardening and individual speaker separation on Windows.

- [ ] **Step 4: Add the contributor build prerequisite**

Insert `./scripts/build-diarize-sidecar.sh` after `./scripts/download-ollama.sh` and before the PyInstaller command.
Explain that this macOS-only helper enables individual speaker separation in local builds.

- [ ] **Step 5: Review the README diff**

Run:

```bash
git diff -- README.md
```

Expected: only the approved What's New, Features, Roadmap, and local-development sections change.

- [ ] **Step 6: Commit the README update**

```bash
git add README.md
git commit -m "docs: explain speaker diarization in readme"
```

### Task 2: Replace obsolete speaker-label documentation

**Files:**
- Modify: `docs/features/speaker-labels.mdx`

**Interfaces:**
- Consumes: the terminology and boundaries established in Task 1.
- Produces: the detailed public guide linked by the Mintlify navigation.

- [ ] **Step 1: Rewrite the introduction and how-it-works sections**

Explain channel labels first, then individual speaker separation within each channel.
Cover microphone-only and system-audio recordings without tying individual separation to system audio.

- [ ] **Step 2: Document review and named profiles**

Explain transcript review, rename/change, generic/multiple-speaker markings, optional cross-meeting profiles, Settings > AI, Settings > People, conditional sample playback, and deletion boundaries.

- [ ] **Step 3: Replace obsolete requirements and limitations**

Remove every claim that individual speaker separation is unavailable or only planned.
State macOS-only availability, Windows channel-label behavior, the four-speaker-per-channel limit, possible incorrect separation or suggestions, and the need for human review.

- [ ] **Step 4: Add the privacy boundary**

State that numerical biometric profiles stay local, are off by default, and require the user to confirm they informed the person and are authorized to create the profile.
State that this is not a consent workflow or legal-compliance guarantee.

- [ ] **Step 5: Review the feature-page diff**

Run:

```bash
git diff -- docs/features/speaker-labels.mdx
```

Expected: no roadmap-only or binary-label-only description remains.

- [ ] **Step 6: Commit the feature-page update**

```bash
git add docs/features/speaker-labels.mdx
git commit -m "docs: document individual speaker labels"
```

### Task 3: Verify consistency and publication hygiene

**Files:**
- Verify: `README.md`
- Verify: `docs/features/speaker-labels.mdx`
- Verify: `docs/privacy/confidential-use-cases.mdx`
- Verify: `website/src/pages/privacy.astro`

**Interfaces:**
- Consumes: completed documentation from Tasks 1 and 2.
- Produces: a clean, internally consistent documentation diff ready for review.

- [ ] **Step 1: Check Markdown formatting and whitespace**

Run:

```bash
app/node_modules/.bin/prettier --check README.md docs/features/speaker-labels.mdx
git diff --check
```

Expected: both commands exit successfully.

- [ ] **Step 2: Check that obsolete claims are gone**

Run:

```bash
rg -n "Multi-speaker diarisation.*roadmap|Not currently|In-person meetings.*do not support speaker labels|Individual speaker identification is planned" README.md docs/features/speaker-labels.mdx
```

Expected: no matches.

- [ ] **Step 3: Check the required boundaries remain visible**

Run targeted searches for `off by default`, `macOS`, `Windows`, `Settings`, `recordings`, and `transcripts` in both changed files.
Compare the wording with `docs/privacy/confidential-use-cases.mdx` and `website/src/pages/privacy.astro`.

- [ ] **Step 4: Scan for private data and unrelated files**

Run `git status --short`, inspect the full diff against `origin/feat/speaker-diarization`, and search added lines for local paths, personal names, email addresses, tokens, or secrets.
Expected: only the two public documentation files plus the local workflow artifacts are present, with no private data.

- [ ] **Step 5: Remove local workflow artifacts before publication**

Before creating any public PR, remove the design and implementation-plan files from the public diff while preserving their local history only as needed for the current task.
The public change must contain only `README.md` and `docs/features/speaker-labels.mdx`.

- [ ] **Step 6: Run final documentation verification**

Repeat the formatting, whitespace, stale-claim, privacy-boundary, and private-data checks after removing the workflow artifacts.
Expected: all checks pass and the worktree is clean after the final implementation commit.
