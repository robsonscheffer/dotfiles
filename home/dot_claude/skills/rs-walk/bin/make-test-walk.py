#!/usr/bin/env python3
"""Reference walk fixture — 33 files across 4 reading-order groups.

Shaped on a real large refactor PR (store removal across a shared layer and one
app), with names generalised. The point is the density, not the content: deep
paths that overflow a file header, many collapsed blocks stacked, sections that
run past a screen so the sticky header and its controls carry real weight, and
enough text at --mate-frame-dim to catch a contrast regression.

A two-file fixture exercises none of that, which is how a walk shipped scoring
94 on accessibility.

Usage: make-test-walk.py <output-dir>
"""
import json
import pathlib
import random
import sys

D = pathlib.Path(sys.argv[1])
D.mkdir(parents=True, exist_ok=True)
rnd = random.Random(4242)  # deterministic — a fixture that drifts is not a fixture


def w(name, obj):
    (D / name).write_text(json.dumps(obj, indent=2))


GROUPS = [
    ("Making the shared layer store-optional",
     "The shared layer assumed a global store existed. Every consumer here learns "
     "to work without one, which is what lets the app boot storeless at all.", [
         "src/shared/analytics/routeTracking.ts",
         "src/shared/components/AppWrapper/AppWrapper.tsx",
         "src/shared/components/AppWrapper/__tests__/AppWrapper.test.tsx",
         "src/shared/hooks/overlays/useOverlayDismiss.ts",
         "src/shared/lib/BannerProvider.tsx",
         "src/shared/lib/__tests__/BannerProvider.test.tsx",
         "src/shared/lib/claimToken/ClaimTokenProvider.tsx",
         "src/shared/lib/sessionExpiration/useSessionValidation.ts",
         "src/shared/providers/TrackingProvider/TrackingProvider.tsx",
         "src/shared/providers/UserContext/useUserContext.ts",
         "src/shared/taps/app/listeners.ts",
         "src/shared/taps/auth/hooks.ts",
     ], "Read this one first — everything after depends on it."),
    ("The redirectTo/navigate rabbit hole",
     "Redirect handling was reading straight from the store. Untangling it turned "
     "out to be the widest part of the change.", [
         "src/shared/services/ajaxHeadersService.ts",
         "src/shared/services/__tests__/ajaxHeadersService.test.ts",
         "src/shared/services/ajaxService.ts",
         "src/shared/lib/router/RequireAuthentication.tsx",
         "src/shared/lib/router/__tests__/RequireAuthentication.test.tsx",
         "src/shared/lib/router/__tests__/RequireSession.test.tsx",
         "src/shared/lib/router/navigate.ts",
     ], None),
    ("The app drops the store and boots",
     "The payoff commit. Six files, and the app comes up without a store.", [
         "src/apps/portal/components/App/App.tsx",
         "src/apps/portal/index.tsx",
         "src/apps/portal/register.ts",
         "src/apps/portal/stores/routeStore.tsx",
         "src/apps/portal/stores/stateStore.ts",
         "src/apps/portal/taps/resources/index.ts",
     ], None),
    ("The last store readers move to useSession",
     "Leaf components that still read user state. Mechanical, but worth a skim for "
     "the ones that changed behaviour rather than just imports.", [
         "src/apps/portal/components/App/ImpersonationBanner.tsx",
         "src/apps/portal/components/App/__tests__/ImpersonationBanner.test.tsx",
         "src/apps/portal/components/TenancyRedirectHandler.tsx",
         "src/apps/portal/components/__tests__/TenancyRedirectHandler.test.tsx",
         "src/apps/portal/components/billing/ProjectedCharges/Card.tsx",
         "src/apps/portal/components/shared/MultiTenant/PreviouslyLinkedAccounts.tsx",
         "src/apps/portal/components/shared/MultiTenant/hooks/useMultiTenantUser.ts",
         "src/apps/portal/components/shared/MultiTenant/hooks/__tests__/useMultiTenantUser.test.ts",
     ], None),
]

w("meta.json", {
    "number": 4242,
    "title": "feat(apps/portal): remove the global store and boot the app storeless",
    "author": {"login": "octocat"},
    "headRefName": "refactor/portal-storeless",
    "baseRefName": "main",
    "additions": 612, "deletions": 1043, "changedFiles": 33,
    "url": "https://github.com/acme/console/pull/4242",
})

w("story.json", {
    "story": "The portal has carried a global store since before hooks existed, and "
             "almost nothing reads from it any more. This removes it. The shared "
             "layer goes store-optional first, redirect handling gets untangled from "
             "it, then the app boots without one and the last few readers move to "
             "useSession.",
    "groups": [
        {"title": t, "framing": f, "files": files, **({"note": n} if n else {})}
        for t, f, files, n in GROUPS
    ],
})

w("questions.json", [
    {"title": "Rollback", "question": "If this regresses in production, is reverting "
     "one commit enough or does the shared-layer change have to go too?",
     "pointer": "src/shared/components/AppWrapper/AppWrapper.tsx"},
    {"title": "Impersonation", "question": "ImpersonationBanner read admin state from "
     "the store. Has the impersonation path actually been exercised?",
     "pointer": "src/apps/portal/components/App/ImpersonationBanner.tsx"},
    {"title": "Session expiry", "question": "Does the expiry redirect still fire when "
     "there is no store to hold the pending route?",
     "pointer": "src/shared/lib/sessionExpiration/useSessionValidation.ts"},
])

w("risks.json", [
    {"title": "Redirect loop on expired session", "description":
     "navigate.ts no longer has the store to stash a pending route.",
     "blast_radius": "all portal users on session expiry",
     "file": "src/shared/lib/router/navigate.ts"},
    {"title": "Tenancy handler runs before context", "description":
     "Ordering was previously guaranteed by store hydration.",
     "blast_radius": "multi-tenant portal only",
     "file": "src/apps/portal/components/TenancyRedirectHandler.tsx"},
    {"title": "Shared layer is used by three other apps", "description":
     "Store-optional changes ship to consumers not covered by this PR's tests.",
     "blast_radius": "admin, reports, settings",
     "file": "src/shared/components/AppWrapper/AppWrapper.tsx"},
])

w("judgment.json", {
    "fit": "This is the right shape for the change — shared layer first, app second, "
           "leaves last — and it deletes far more than it adds. The care shows in the "
           "test coverage moving alongside each provider rather than in a lump at the end.",
    "risks_summary": [
        "navigate.ts loses the store's pending-route slot with no obvious replacement.",
        "Shared-layer changes reach three apps this PR does not test.",
        "Tenancy ordering was implicitly guaranteed by hydration.",
    ],
    "gaps": [
        "No integration test boots the app end to end without a store.",
        "Impersonation is asserted in unit tests only.",
    ],
    "overall": "cautious",
})

w("context.json", {"mode": "qmd", "items": [
    {"path": "wiki/learning/2026-05-02-store-teardown-order.md", "score": 82,
     "snippet": "Store teardown has to follow provider unmount or listeners leak."},
    {"path": "wiki/decision/2026-04-18-storeless-boot-plan.md", "score": 74,
     "snippet": "Agreed sequencing: shared layer store-optional before any app drops it."},
]})

# Realistic churn: several hunks per file, and test files that read differently
# from source files so the diff colouring gets exercised both ways.
lines = []
for _, _, files, _ in GROUPS:
    for f in files:
        lines += [f"diff --git a/{f} b/{f}", "index 8f2a1c4..b93e017 100644",
                  f"--- a/{f}", f"+++ b/{f}"]
        for _ in range(rnd.randint(1, 3)):
            start = rnd.randint(1, 240)
            lines.append(f"@@ -{start},9 +{start},7 @@")
            if f.endswith((".test.ts", ".test.tsx", ".test.js")):
                lines += [
                    "   const wrapper = render(",
                    "-    <Provider store={createTestStore({ user: fixtures.user })}>",
                    "-      <AppWrapper>{children}</AppWrapper>",
                    "-    </Provider>,",
                    "+    <SessionProvider value={fixtures.session}>",
                    "+      <AppWrapper>{children}</AppWrapper>",
                    "+    </SessionProvider>,",
                    "   );",
                ]
            else:
                lines += [
                    " import { useCallback } from 'react';",
                    "-import { useSelector, useDispatch } from 'react-redux';",
                    "+import { useSession } from '@shared/providers/SessionProvider';",
                    " ",
                    "-  const user = useSelector((state: RootState) => state.session.currentUser);",
                    "+  const { currentUser } = useSession();",
                    "   if (!currentUser) return null;",
                ]
(D / "walk.diff").write_text("\n".join(lines) + "\n")

print(f"{D}  ({sum(len(g[2]) for g in GROUPS)} files across {len(GROUPS)} groups)")
