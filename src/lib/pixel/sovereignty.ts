/**
 * Sovereign decentralization — diversity policy for sequencer sets.
 *
 * Goal: no AWS, Cloudflare, or single nation/corp can take the ledger down.
 * The protocol itself must never *require* a hosted API gateway. Explorers and
 * web UIs may use CDNs; light clients and nodes must not.
 *
 * Enforcement status (honest):
 *   - `diversityReport` / `assertSovereign` are real checks.
 *   - They run when a provider registry is attached via `setProviderRegistry`
 *     or `registerSequencerWithProvider` once the set reaches `minProviders`.
 *   - Single-sequencer local prototypes intentionally skip (too small to judge).
 *   - Until a live ≥7-provider set is declared, this is policy-ready code, not
 *     a running sovereignty regime.
 */

export type HostingClass = "home" | "colo" | "cloud" | "mobile" | "unknown";

export interface NodeProvider {
  id: string;
  address: string; // PIX sequencer / node address
  jurisdiction: string; // ISO country code
  hosting: HostingClass;
  /** Optional cloud vendor if hosting === cloud */
  cloudVendor?: "aws" | "gcp" | "azure" | "cloudflare" | "other" | "none";
  asn?: string;
  endpoint?: string; // multiaddress / ws / quic — never a single global hostname requirement
}

export interface DiversityReport {
  providers: number;
  jurisdictions: number;
  hostingBreakdown: Record<HostingClass, number>;
  maxJurisdictionShare: number;
  maxCloudVendorShare: number;
  cloudShare: number;
  passes: boolean;
  reasons: string[];
  /** Whether this report was large enough to enforce (vs local toy set). */
  enforceable: boolean;
}

/** Consensus-critical thresholds (honest nodes enforce when registry is live). */
export const SOVEREIGNTY_POLICY = {
  /** At least this many independent providers in an active sequencer set */
  minProviders: 7,
  /** No single country may exceed this share of sequencers */
  maxJurisdictionShare: 0.34,
  /** Cloud-hosted sequencers must stay under this share */
  maxCloudShare: 0.34,
  /** Single cloud vendor ceiling */
  maxSingleCloudVendorShare: 0.2,
  /** Prefer rejecting quorums that are majority-cloud */
  rejectMajorityCloud: true,
};

export function diversityReport(providers: NodeProvider[]): DiversityReport {
  const n = providers.length || 1;
  const hostingBreakdown: Record<HostingClass, number> = {
    home: 0,
    colo: 0,
    cloud: 0,
    mobile: 0,
    unknown: 0,
  };
  const byCountry = new Map<string, number>();
  const byVendor = new Map<string, number>();

  for (const p of providers) {
    hostingBreakdown[p.hosting] += 1;
    byCountry.set(p.jurisdiction, (byCountry.get(p.jurisdiction) ?? 0) + 1);
    if (p.hosting === "cloud") {
      const v = p.cloudVendor ?? "other";
      byVendor.set(v, (byVendor.get(v) ?? 0) + 1);
    }
  }

  const maxJurisdictionShare = Math.max(0, ...[...byCountry.values()].map((c) => c / n));
  const cloudShare = hostingBreakdown.cloud / n;
  const maxCloudVendorShare = Math.max(0, ...[...byVendor.values()].map((c) => c / n));
  const enforceable = providers.length >= SOVEREIGNTY_POLICY.minProviders;

  const reasons: string[] = [];
  if (providers.length < SOVEREIGNTY_POLICY.minProviders) {
    reasons.push(`need ≥${SOVEREIGNTY_POLICY.minProviders} providers (have ${providers.length})`);
  }
  if (maxJurisdictionShare > SOVEREIGNTY_POLICY.maxJurisdictionShare) {
    reasons.push(
      `jurisdiction concentration ${(maxJurisdictionShare * 100).toFixed(1)}% > ${(SOVEREIGNTY_POLICY.maxJurisdictionShare * 100).toFixed(0)}%`,
    );
  }
  if (cloudShare > SOVEREIGNTY_POLICY.maxCloudShare) {
    reasons.push(
      `cloud share ${(cloudShare * 100).toFixed(1)}% > ${(SOVEREIGNTY_POLICY.maxCloudShare * 100).toFixed(0)}%`,
    );
  }
  if (maxCloudVendorShare > SOVEREIGNTY_POLICY.maxSingleCloudVendorShare) {
    reasons.push(`single cloud vendor ${(maxCloudVendorShare * 100).toFixed(1)}% too high`);
  }
  if (SOVEREIGNTY_POLICY.rejectMajorityCloud && cloudShare > 0.5) {
    reasons.push("majority-cloud sequencer set rejected");
  }

  return {
    providers: providers.length,
    jurisdictions: byCountry.size,
    hostingBreakdown,
    maxJurisdictionShare,
    maxCloudVendorShare,
    cloudShare,
    passes: reasons.length === 0,
    reasons,
    enforceable,
  };
}

export function assertSovereign(providers: NodeProvider[]): DiversityReport {
  const report = diversityReport(providers);
  if (!report.passes) {
    throw new Error(`Sovereignty check failed: ${report.reasons.join("; ")}`);
  }
  return report;
}

/**
 * Enforce diversity when the registry is large enough to be meaningful.
 * Smaller local sets are allowed for single-machine prototypes.
 */
export function assertSovereignIfLive(providers: NodeProvider[]): DiversityReport {
  const report = diversityReport(providers);
  if (report.enforceable && !report.passes) {
    throw new Error(`Sovereignty check failed: ${report.reasons.join("; ")}`);
  }
  return report;
}

/**
 * ICP-like subnet: a sovereign committee that can illuminate and checkpoint.
 * Multiple subnets ⇒ no single committee / cloud region is the kill switch.
 */
export interface LightSubnet {
  id: string;
  providers: NodeProvider[];
  /** Checkpoint every N pixels to peer subnets */
  checkpointEvery: number;
}

export function subnetHealth(subnet: LightSubnet): DiversityReport {
  return diversityReport(subnet.providers);
}

export function sovereigntyThesis(): string[] {
  return [
    "STATUS: diversity policy is implemented and enforced when a ≥7-provider registry is declared.",
    "Local single-sequencer prototypes intentionally skip enforcement (set too small to judge).",
    "Nodes are intended to be run by independent providers — home, colo, and minority-cloud.",
    "Multiple light subnets checkpointing each other is roadmap — not shipped runtime.",
    "Light clients should dial many peer endpoints; there is no required api.pixeledger.com.",
    "Optical capture path ships (getUserMedia + raster); Kindling can seal channel=optical-capture.",
  ];
}
