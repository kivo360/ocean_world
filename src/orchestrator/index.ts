import { pickStrategy, DomainQueue } from "./domain-queue";
import type { OntologyRegistry } from "../ontology/registry";
import type { Domain } from "../ontology/types";
import { assembleRag, type RagOptions } from "./rag";
import { createCritic, type CriticClient } from "./critic";
import { runGates } from "./gates";
import { integrate, topologicalSort } from "./integration";
import { createProposer, type ProposerClient } from "./proposer";
import { RejectedStore } from "./rejected-store";
import { createEmbeddingClient, type EmbeddingClient } from "./embeddings";
import type {
  Candidate,
  OrchestratorBudget,
  OrchestratorProgress,
  Verdict,
} from "./types";

export type OrchestratorOptions = {
  proposer?: ProposerClient;
  critic?: CriticClient;
  embedder?: EmbeddingClient;
  budget?: Partial<OrchestratorBudget>;
  batchSize?: number;
  ragOptions?: RagOptions;
  targets?: Record<Domain, number>;
  logger?: (msg: string) => void;
  onProgress?: (p: OrchestratorProgress) => void;
};

export type OrchestratorReport = {
  rounds: number;
  llmCalls: number;
  accepted: Candidate[];
  rejected: Array<{ candidate: Candidate; verdict: Verdict }>;
  merged: Array<{ candidate: Candidate; verdict: Verdict }>;
  domainStatuses: ReturnType<DomainQueue["snapshot"]>;
  stoppedReason: string;
};

export async function runOrchestrator(
  registry: OntologyRegistry,
  opts: OrchestratorOptions = {},
): Promise<OrchestratorReport> {
  const budget: OrchestratorBudget = {
    maxRounds: opts.budget?.maxRounds ?? 10,
    maxLlmCalls: opts.budget?.maxLlmCalls ?? 30,
    maxAcceptances: opts.budget?.maxAcceptances ?? 40,
  };
  const batchSize = opts.batchSize ?? 4;
  const log = opts.logger ?? (() => undefined);

  const proposer = opts.proposer ?? createProposer();
  const critic = opts.critic ?? createCritic();
  const embedder = opts.embedder ?? createEmbeddingClient();

  const queue = new DomainQueue(registry, opts.targets);
  const rejectedStore = new RejectedStore();
  const existingEmbeddings = new Map<string, number[]>();

  const accepted: Candidate[] = [];
  const rejected: Array<{ candidate: Candidate; verdict: Verdict }> = [];
  const merged: Array<{ candidate: Candidate; verdict: Verdict }> = [];

  let llmCalls = 0;
  let round = 0;
  let stoppedReason = "budget reached";

  while (round < budget.maxRounds) {
    if (llmCalls >= budget.maxLlmCalls) {
      stoppedReason = `LLM budget exhausted (${llmCalls}/${budget.maxLlmCalls})`;
      break;
    }
    if (accepted.length >= budget.maxAcceptances) {
      stoppedReason = `acceptance cap reached (${accepted.length}/${budget.maxAcceptances})`;
      break;
    }
    const domain = queue.pick();
    if (!domain) {
      stoppedReason = "all domains soft-stopped";
      break;
    }
    round++;
    const fillRatio = registry.fillRatios(opts.targets ?? ({} as Record<Domain, number>))[domain] ?? 0;
    const strategy = pickStrategy(fillRatio);
    log(`round ${round} domain=${domain} strategy=${strategy} accepted=${accepted.length}`);

    const rag = await assembleRag(registry, rejectedStore, domain, strategy, opts.ragOptions);
    let batch;
    try {
      batch = await proposer.propose(rag, batchSize);
      llmCalls += proposer.live ? 1 : 0;
    } catch (err) {
      log(`proposer failed: ${(err as Error).message}`);
      queue.recordRound(domain, 0, 0);
      continue;
    }

    const sorted = topologicalSort(batch.candidates);
    let roundAccepts = 0;
    let roundAttempts = 0;

    for (const candidate of sorted) {
      if (rejectedStore.has(candidate.name)) continue;
      roundAttempts++;
      const input = { candidate, registry, embedder, existingEmbeddings };
      let verdict = await runGates(input);

      if (verdict.zone === "deliberation") {
        // Critic takes over in the 0.80–0.90 zone.
        const nearest = verdict.mergeTargetId
          ? { id: verdict.mergeTargetId, similarity: 0.85 }
          : undefined;
        verdict = await critic.adjudicate(candidate, nearest, registry);
        llmCalls += critic.live ? 1 : 0;
      }

      switch (verdict.decision) {
        case "accept":
          integrate(registry, candidate);
          accepted.push(candidate);
          roundAccepts++;
          existingEmbeddings.delete(candidate.data["@id"]); // force re-embed
          onProgress(opts, {
            round,
            domain,
            strategy,
            accepted: accepted.length,
            rejected: rejected.length,
            merged: merged.length,
            llmCalls,
          });
          break;
        case "merge":
          merged.push({ candidate, verdict });
          rejectedStore.record({
            name: candidate.name,
            kind: candidate.kind,
            domain: candidate.domain,
            reason: `merged into ${verdict.mergeTargetId ?? "unknown"}: ${verdict.reason}`,
            rejectedAt: round,
          });
          break;
        case "reject":
          rejected.push({ candidate, verdict });
          rejectedStore.record({
            name: candidate.name,
            kind: candidate.kind,
            domain: candidate.domain,
            reason: verdict.reason,
            rejectedAt: round,
          });
          break;
      }
    }

    queue.recordRound(domain, roundAccepts, roundAttempts);

    if (queue.allSoftStopped()) {
      stoppedReason = "all domains soft-stopped after round";
      break;
    }
  }

  return {
    rounds: round,
    llmCalls,
    accepted,
    rejected,
    merged,
    domainStatuses: queue.snapshot(),
    stoppedReason,
  };
}

function onProgress(opts: OrchestratorOptions, p: OrchestratorProgress): void {
  opts.onProgress?.(p);
}

export { DomainQueue, pickStrategy, DEFAULT_TARGETS } from "./domain-queue";
export { assembleRag } from "./rag";
export { runGates, gateEmbedding, gateReferences, gateShacl, gateStringMatch } from "./gates";
export { integrate, topologicalSort } from "./integration";
export { createCritic, StubCritic, AnthropicCritic, SandboxAgentCritic } from "./critic";
export {
  createProposer,
  StubProposer,
  AnthropicProposer,
  FireworksProposer,
  renderProposerPrompt,
  parseProposerResponse,
} from "./proposer";
export { RejectedStore } from "./rejected-store";
export {
  createEmbeddingClient,
  StubEmbeddingClient,
  OpenAIEmbeddingClient,
  FireworksEmbeddingClient,
  cosineSimilarity,
  editDistance,
} from "./embeddings";
export { loadOxigraph, bundleToTurtle, checkSubsumption } from "./oxigraph-sidecar";
export type { EmbeddingClient } from "./embeddings";
export type { ProposerClient } from "./proposer";
export type { CriticClient } from "./critic";
export type {
  Candidate,
  CandidateKind,
  DomainStatus,
  Strategy,
  Verdict,
  VerdictZone,
  OrchestratorBudget,
  OrchestratorProgress,
  RAGContext,
  ProposerBatch,
} from "./types";
