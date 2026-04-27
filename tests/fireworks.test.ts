import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  FireworksClient,
  resetFireworksClientForTests,
} from "../src/llm/fireworks-client";
import { FireworksT3Client } from "../src/llm/fireworks-t3-client";
import { FireworksEmbeddingClient } from "../src/orchestrator/embeddings";
import { FireworksProposer } from "../src/orchestrator/proposer";

function fakeFetch(responses: Array<{ ok: boolean; body: unknown; status?: number }>) {
  let i = 0;
  return vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const next = responses[i++] ?? responses[responses.length - 1]!;
    return new Response(JSON.stringify(next.body), {
      status: next.ok ? 200 : next.status ?? 500,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("FireworksClient", () => {
  beforeEach(() => resetFireworksClientForTests(null));
  afterEach(() => vi.restoreAllMocks());

  it("sends Bearer auth and parses chat response", async () => {
    let authHeader: string | null = null;
    let requestBody: unknown = null;
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      authHeader = (init?.headers as Record<string, string>)?.Authorization ?? null;
      requestBody = JSON.parse((init?.body as string) ?? "{}");
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: { role: "assistant", content: "hello world" },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const client = new FireworksClient({ apiKey: "test-key", fetchImpl });
    const res = await client.chat({
      messages: [{ role: "user", content: "hi" }],
      system: "be terse",
    });
    expect(authHeader).toBe("Bearer test-key");
    expect(res.text).toBe("hello world");
    expect(res.finishReason).toBe("stop");
    expect(res.usage.total_tokens).toBe(8);
    const body = requestBody as { messages: Array<{ role: string; content: string }> };
    expect(body.messages[0]!.role).toBe("system");
    expect(body.messages[0]!.content).toBe("be terse");
  });

  it("embeds returns matrix of vectors", async () => {
    const fetchImpl = fakeFetch([
      {
        ok: true,
        body: {
          data: [
            { embedding: [1, 0, 0] },
            { embedding: [0, 1, 0] },
          ],
        },
      },
    ]);
    const client = new FireworksClient({ apiKey: "k", fetchImpl });
    const out = await client.embed({ input: ["a", "b"], dimensions: 3 });
    expect(out.length).toBe(2);
    expect(out[0]).toEqual([1, 0, 0]);
  });

  it("throws on non-200 response", async () => {
    const fetchImpl = fakeFetch([{ ok: false, status: 401, body: { error: "unauthorized" } }]);
    const client = new FireworksClient({ apiKey: "k", fetchImpl });
    await expect(
      client.chat({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toThrow(/401/);
  });
});

describe("FireworksEmbeddingClient", () => {
  it("returns vectors via shared client", async () => {
    const fetchImpl = fakeFetch([
      { ok: true, body: { data: [{ embedding: [0.5, 0.5] }] } },
    ]);
    const shared = new FireworksClient({ apiKey: "k", fetchImpl });
    const embedder = new FireworksEmbeddingClient({ sharedClient: shared, dimension: 2 });
    const v = await embedder.embed("money trade");
    expect(v).toEqual([0.5, 0.5]);
    expect(embedder.live).toBe(true);
  });
});

describe("FireworksT3Client", () => {
  it("parses batch actions from JSON response", async () => {
    const fetchImpl = fakeFetch([
      {
        ok: true,
        body: {
          choices: [
            {
              message: {
                role: "assistant",
                content: JSON.stringify([
                  { entityId: "e1", action: { kind: "rest" } },
                  { entityId: "e2", action: { kind: "noop" } },
                ]),
              },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        },
      },
    ]);
    const shared = new FireworksClient({ apiKey: "k", fetchImpl });
    const client = new FireworksT3Client({}, shared);
    const contexts = [
      {
        id: "e1",
        name: "Alpha",
        archetype: "Person",
        phase: "Idle",
        values: { profit: 0.5 },
        resources: { money: 10, goods: 0, energy: 0.3 },
        situation: "ambient",
        nearby: [],
        recentMemory: [],
        relevantMemories: [],
        validActions: [],
      },
      {
        id: "e2",
        name: "Beta",
        archetype: "Person",
        phase: "Idle",
        values: { profit: 0.5 },
        resources: { money: 10, goods: 0, energy: 0.9 },
        situation: "ambient",
        nearby: [],
        recentMemory: [],
        relevantMemories: [],
        validActions: [],
      },
    ];
    const out = await client.selectActions(contexts);
    expect(out.length).toBe(2);
    expect(out[0]!.action.kind).toBe("rest");
    expect(out[1]!.action.kind).toBe("noop");
  });
});

describe("FireworksProposer", () => {
  it("parses a ProposerBatch with a single component", async () => {
    const fetchImpl = fakeFetch([
      {
        ok: true,
        body: {
          choices: [
            {
              message: {
                role: "assistant",
                content: JSON.stringify({
                  reasoning: "fill the economic domain",
                  candidates: [
                    {
                      kind: "component",
                      name: "TestCoin",
                      domain: "economic",
                      description: "test currency",
                      data: {
                        "@id": "ecs:TestCoin",
                        name: "TestCoin",
                        category: "resource",
                        domain: "economic",
                        description: "test currency",
                        fields: [{ name: "amount", type: "float" }],
                      },
                    },
                  ],
                }),
              },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        },
      },
    ]);
    const shared = new FireworksClient({ apiKey: "k", fetchImpl });
    const proposer = new FireworksProposer({}, shared);
    const batch = await proposer.propose(
      {
        domain: "economic",
        strategy: "broad_survey",
        existing: [],
        siblings: [],
        rejected: [],
        seeds: { domains: "", schemaOrgActions: "", verbnetClasses: "" },
      },
      1,
    );
    expect(batch.candidates.length).toBe(1);
    expect(batch.candidates[0]!.name).toBe("TestCoin");
    expect(batch.candidates[0]!.kind).toBe("component");
  });
});
