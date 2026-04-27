import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SandboxAgentGateway } from "../src/sandbox-agent/gateway";
import { SandboxAgentCritic } from "../src/orchestrator/critic";
import { SandboxAgentObserver } from "../src/observer/observer-agent";
import { InMemoryRepository } from "../src/storage/in-memory-repo";
import { createRegistry, loadOntology } from "../src/ontology";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ONTOLOGY_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "ontology");

/**
 * Construct a gateway whose SDK has been monkey-patched with a fake that
 * emits deterministic agent_message_chunk events carrying `responseText`,
 * then resolves prompt() with a given stopReason.
 */
function gatewayWithFakeSdk(responseText: string) {
  const gateway = new SandboxAgentGateway({ baseUrl: "http://fake" });
  const unsubscribers: Array<() => void> = [];

  const fakeSession = {
    id: "session-1",
    onEvent(listener: (event: unknown) => void) {
      // Fire a couple of chunks synchronously, then one more on next tick.
      queueMicrotask(() => {
        listener({
          sender: "agent",
          payload: {
            params: {
              update: {
                sessionUpdate: "agent_message_chunk",
                content: { type: "text", text: responseText },
              },
            },
          },
        });
      });
      const unsub = () => undefined;
      unsubscribers.push(unsub);
      return unsub;
    },
    async prompt() {
      // Let microtasks flush so the listener runs before we return.
      await Promise.resolve();
      return { stopReason: "end_turn" };
    },
  };

  const fakeSdk = {
    async createSession() {
      return fakeSession;
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (gateway as any).sdk = fakeSdk;
  return gateway;
}

describe("SandboxAgentGateway.runSingleTurn", () => {
  it("accumulates agent_message_chunk text and returns it", async () => {
    const gateway = gatewayWithFakeSdk('{"decision":"accept","reason":"ok"}');
    const result = await gateway.runSingleTurn("test prompt");
    expect(result.text).toContain('"decision":"accept"');
    expect(result.stopReason).toBe("end_turn");
  });
});

describe("SandboxAgentCritic", () => {
  it("parses JSON verdict from the sandbox response", async () => {
    const gateway = gatewayWithFakeSdk(
      '{"decision":"merge","reason":"semantic duplicate","merge_target":"ecs:FinancialState"}',
    );
    const critic = new SandboxAgentCritic(gateway);
    const { bundle } = await loadOntology(ONTOLOGY_DIR);
    const registry = createRegistry(bundle);
    const verdict = await critic.adjudicate(
      {
        kind: "component",
        name: "Wallet",
        domain: "economic",
        description: "money container",
        data: {
          "@id": "ecs:Wallet",
          name: "Wallet",
          category: "resource",
          domain: "economic",
          description: "money container",
          fields: [{ name: "balance", type: "float" }],
        },
      },
      { id: "ecs:FinancialState", similarity: 0.88 },
      registry,
    );
    expect(verdict.decision).toBe("merge");
    expect(verdict.mergeTargetId).toBe("ecs:FinancialState");
  });

  it("falls back to reject on sandbox failure", async () => {
    const gateway = new SandboxAgentGateway({ baseUrl: "http://doesnotexist" });
    // Force ensure() to fail.
    vi.spyOn(gateway, "ensure").mockRejectedValueOnce(new Error("connection refused"));
    const critic = new SandboxAgentCritic(gateway);
    const { bundle } = await loadOntology(ONTOLOGY_DIR);
    const registry = createRegistry(bundle);
    const verdict = await critic.adjudicate(
      {
        kind: "component",
        name: "A",
        domain: "economic",
        description: "",
        data: {
          "@id": "ecs:A",
          name: "A",
          category: "state",
          domain: "economic",
          description: "",
          fields: [{ name: "x", type: "float" }],
        },
      },
      undefined,
      registry,
    );
    expect(verdict.decision).toBe("reject");
    expect(verdict.gateFailures).toContain("sandbox_unavailable");
  });
});

describe("SandboxAgentObserver", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("augments deterministic signals with agent JSON", async () => {
    const gateway = gatewayWithFakeSdk(
      '{"signals":[{"kind":"unbalanced_values","severity":"medium","domain":"social","evidence":"trade heavy","suggestion":"add Rest"}],"domain_pressure":{"social":2}}',
    );
    const observer = new SandboxAgentObserver(gateway);
    const { bundle } = await loadOntology(ONTOLOGY_DIR);
    const registry = createRegistry(bundle);
    const repo = new InMemoryRepository({ seed: 1, initialPersons: 6 });
    await repo.init();
    await repo.advanceTick(8);

    const report = await observer.observe({ repo, registry, sinceTick: 0, endTick: 8 });
    expect(report.signals.length).toBeGreaterThan(0);
    expect(report.signals.some((s) => s.kind === "unbalanced_values")).toBe(true);
    expect(report.domainPressure.social).toBeGreaterThanOrEqual(2);
  });
});
