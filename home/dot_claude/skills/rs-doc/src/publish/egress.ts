// Egress check: does publishing this doc to this target leak company-provenance evidence to a
// target that isn't cleared for it.
import { isCompanyCapability, isCompanyHost, type AdaptersConfig } from "./adapters.ts";
import type { Frontmatter, Ledger } from "../types.ts";

export interface Provenance {
  isCompany: boolean;
  companySources: string[]; // capability names and/or hostnames, deduped, for the refusal message
}

export function computeProvenance(
  ledger: Ledger | null,
  frontmatters: Frontmatter[],
  adapters: AdaptersConfig,
): Provenance {
  const companySources = new Set<string>();

  for (const claim of ledger?.claims ?? []) {
    const needs = claim.evidence?.needs;
    if (needs && isCompanyCapability(adapters, needs)) {
      companySources.add(needs);
    }
  }

  for (const fm of frontmatters) {
    for (const source of fm.sources ?? []) {
      if (isCompanyHost(adapters, source)) {
        companySources.add(source);
      }
    }
  }

  return { isCompany: companySources.size > 0, companySources: [...companySources] };
}
