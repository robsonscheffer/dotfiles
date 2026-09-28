// TypeScript port of rs-walk's bin/make-test-walk.py fixture: a dense multi-group PR (the
// density is the point - a two-file fixture exercises none of the section-order or claim-
// building logic this port needs to prove out). Names generalized per the WK lane brief: a
// neutral repo (acme/console), a placeholder ticket key (ABC-12), and "Sam" instead of a real
// login.
//
// Group 2 deliberately references a file with no matching diff entry, so the fixture exercises
// both branches of claim building: found -> verified code claim, not found -> not_verified with
// an owner.
import type { FetchedPr, StoryGroup, WalkInputs } from "../../src/walk/types.ts";

export const GROUPS: StoryGroup[] = [
  {
    title: "Making the shared layer store-optional",
    lead: "Read this one first",
    framing:
      "The shared layer assumed a global store existed. Every consumer here learns to work without one, which is what lets the app boot storeless at all.",
    files: [
      "src/shared/analytics/routeTracking.ts",
      "src/shared/components/AppWrapper/AppWrapper.tsx",
      "src/shared/components/AppWrapper/__tests__/AppWrapper.test.tsx",
      "src/shared/hooks/overlays/useOverlayDismiss.ts",
      "src/shared/lib/BannerProvider.tsx",
      "src/shared/lib/__tests__/BannerProvider.test.tsx",
    ],
    note: "Everything after this depends on it.",
  },
  {
    title: "The redirectTo/navigate rabbit hole",
    framing: "Redirect handling was reading straight from the store. Untangling it turned out to be the widest part of the change.",
    // Deliberately absent from the fixture diff below.
    files: ["src/shared/lib/router/navigate.ts"],
  },
  {
    title: "The app drops the store and boots",
    lead: "The payoff commit",
    framing: "The payoff commit. Six files, and the app comes up without a store.",
    files: ["src/apps/portal/components/App/App.tsx", "src/apps/portal/index.tsx", "src/apps/portal/register.ts", "src/apps/portal/stores/routeStore.tsx"],
  },
  {
    title: "The last store readers move to useSession",
    framing: "Leaf components that still read user state. Mechanical, but worth a skim for the ones that changed behavior rather than just imports.",
    files: ["src/apps/portal/components/App/ImpersonationBanner.tsx", "src/apps/portal/components/TenancyRedirectHandler.tsx"],
  },
];

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildDiff(): string {
  const rnd = mulberry32(4242);
  const lines: string[] = [];
  for (const group of GROUPS) {
    for (const file of group.files) {
      if (file === "src/shared/lib/router/navigate.ts") continue; // missing on purpose
      lines.push(`diff --git a/${file} b/${file}`, "index 8f2a1c4..b93e017 100644", `--- a/${file}`, `+++ b/${file}`);
      const hunkCount = 1 + Math.floor(rnd() * 3);
      for (let h = 0; h < hunkCount; h++) {
        const start = 1 + Math.floor(rnd() * 240);
        lines.push(`@@ -${start},9 +${start},7 @@`);
        if (/\.test\.tsx?$/.test(file)) {
          lines.push(
            "   const wrapper = render(",
            "-    <Provider store={createTestStore({ user: fixtures.user })}>",
            "-      <AppWrapper>{children}</AppWrapper>",
            "-    </Provider>,",
            "+    <SessionProvider value={fixtures.session}>",
            "+      <AppWrapper>{children}</AppWrapper>",
            "+    </SessionProvider>,",
            "   );",
          );
        } else {
          lines.push(
            " import { useCallback } from 'react';",
            "-import { useSelector, useDispatch } from 'react-redux';",
            "+import { useSession } from '@shared/providers/SessionProvider';",
            " ",
            "-  const user = useSelector((state) => state.session.currentUser);",
            "+  const { currentUser } = useSession();",
            "   if (!currentUser) return null;",
          );
        }
      }
    }
  }
  return lines.join("\n") + "\n";
}

export const DIFF = buildDiff();

export const PR_META = {
  number: 4242,
  title: "feat(apps/portal): remove the global store and boot the app storeless",
  author: { login: "sam" },
  headRefName: "refactor/portal-storeless",
  baseRefName: "main",
  additions: 612,
  deletions: 1043,
  changedFiles: GROUPS.reduce((n, g) => n + g.files.length, 0),
  url: "https://github.com/acme/console/pull/4242",
};

export const FETCHED_PR: FetchedPr = {
  repo: "acme/console",
  meta: PR_META,
  body: "Removes the global store from the portal app and boots it storeless.",
  diff: DIFF,
  files: GROUPS.flatMap((g) => g.files),
};

export const WALK_INPUTS: WalkInputs = {
  story: {
    lead: "Removes a global store almost nothing still reads from.",
    story: [
      "The portal has carried a global store since before hooks existed, and almost nothing reads from it any more.",
      "The shared layer goes store-optional first, then redirect handling gets untangled from it, since that turned out to be the widest part of the change.",
      "Only then does the app boot without one, and the last few readers move to useSession.",
    ],
    groups: GROUPS,
  },
  questions: [
    {
      title: "Rollback",
      question: "If this regresses in production, is reverting one commit enough or does the shared-layer change have to go too?",
      pointer: "src/shared/components/AppWrapper/AppWrapper.tsx",
    },
    {
      title: "Impersonation",
      question: "ImpersonationBanner read admin state from the store. Has the impersonation path actually been exercised?",
      pointer: "src/apps/portal/components/App/ImpersonationBanner.tsx",
    },
  ],
  risks: [
    {
      title: "Redirect loop on expired session",
      description: "navigate.ts no longer has the store to stash a pending route.",
      blast_radius: "all portal users on session expiry",
      file: "src/shared/lib/router/navigate.ts",
    },
    {
      title: "Tenancy handler runs before context",
      description: "Ordering was previously guaranteed by store hydration.",
      blast_radius: "multi-tenant portal only",
      file: "src/apps/portal/components/TenancyRedirectHandler.tsx",
    },
  ],
  judgment: {
    fit: "This is the right shape for the change: shared layer first, app second, leaves last, and it **deletes far more than it adds**.",
    risks_summary: ["navigate.ts loses the store's pending-route slot with no obvious replacement.", "Shared-layer changes reach three apps this PR does not test."],
    gaps: ["No integration test boots the app end to end without a store.", "Impersonation is asserted in unit tests only."],
    overall: "cautious",
  },
  context: {
    mode: "qmd",
    items: [{ path: "store-teardown-order", score: 82, snippet: "Store teardown has to follow provider unmount or listeners leak." }],
  },
  ticketFit: {
    ticket_key: "ABC-12",
    ticket_quality: { score: "adequate", notes: "Clear who/what/why, but the AC only covers the happy path." },
    acceptance_criteria: [
      { criterion: "Portal boots with no global store", status: "Met", evidence: "src/apps/portal/index.tsx" },
      { criterion: "No regression in the impersonation flow", status: "Partially Met", evidence: "" },
      { criterion: "Shared layer stays backward-compatible for other consumers", status: "Not Met", evidence: "" },
    ],
    scope_delta: "The redirect/navigate untangling was not scoped in the ticket.",
  },
  commentTriage: [
    { author: "sam", author_kind: "human", human_authenticity: "genuine", summary: "Confirmed the impersonation path was manually tested in staging.", resolved: true },
    { author: "review-bot", author_kind: "bot", summary: "Flagged the missing shared-layer test coverage as medium risk.", resolved: false },
  ],
};
