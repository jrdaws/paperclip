// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { BackendCapabilitiesCard } from "./backend-capabilities-card";

const MOCK_CAPABILITIES = {
  backends: {
    crewai: {
      label: "CrewAI Webhook Bridge",
      framework: "CrewAI",
      reachable: true,
      capabilities: {
        features: {
          webhook: true,
          streaming: false,
          hitl_interrupt: false,
          model_routing: true,
        },
      },
    },
    langgraph: {
      label: "LangGraph Webhook Bridge",
      framework: "LangGraph",
      reachable: true,
      capabilities: {
        features: {
          webhook: true,
          streaming: true,
          hitl_interrupt: true,
          checkpointer: true,
          model_routing: true,
          dynamic_graphs: true,
        },
      },
    },
  },
  feature_matrix: {
    crewai: {
      webhook: true,
      streaming: false,
      hitl_interrupt: false,
      model_routing: true,
    },
    langgraph: {
      webhook: true,
      streaming: true,
      hitl_interrupt: true,
      checkpointer: true,
      model_routing: true,
      dynamic_graphs: true,
    },
  },
  routing_signals: {
    streaming_backend: "langgraph",
    hitl_backend: "langgraph",
    default_backend: "crewai",
  },
};

function mockFetchResolving(data: unknown): ReturnType<typeof vi.fn> {
  return vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(data),
    }),
  );
}

function mockFetchRejecting(message: string): ReturnType<typeof vi.fn> {
  return vi.fn(() => Promise.reject(new Error(message)));
}

async function flushMicrotasks() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("BackendCapabilitiesCard", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    root.unmount();
    container.remove();
    vi.unstubAllGlobals();
  });

  it("renders null when no orchestratorUrl provided", () => {
    const html = renderToStaticMarkup(<BackendCapabilitiesCard />);
    expect(html).toBe("");
  });

  it("shows loading state initially", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );

    await act(() => {
      root.render(
        <BackendCapabilitiesCard orchestratorUrl="http://127.0.0.1:8080/webhook" />,
      );
    });

    expect(container.textContent).toContain("Loading backend capabilities");
  });

  it("renders feature matrix table with mock data", async () => {
    vi.stubGlobal("fetch", mockFetchResolving(MOCK_CAPABILITIES));

    await act(() => {
      root.render(
        <BackendCapabilitiesCard orchestratorUrl="http://127.0.0.1:8080/capabilities" />,
      );
    });

    await flushMicrotasks();

    expect(container.textContent).toContain("Backend Capabilities");
    expect(container.textContent).toContain("CrewAI");
    expect(container.textContent).toContain("LangGraph");
    expect(container.textContent).toContain("2/2 reachable");

    expect(container.textContent).toContain("Default:");
    expect(container.textContent).toContain("crewai");
    expect(container.textContent).toContain("Streaming:");
    expect(container.textContent).toContain("langgraph");
    expect(container.textContent).toContain("HITL:");
  });

  it("shows error state when fetch fails", async () => {
    vi.stubGlobal("fetch", mockFetchRejecting("Network failure"));

    await act(() => {
      root.render(
        <BackendCapabilitiesCard orchestratorUrl="http://127.0.0.1:8080/capabilities" />,
      );
    });

    await flushMicrotasks();

    expect(container.textContent).toContain("Capabilities unavailable");
    expect(container.textContent).toContain("Network failure");
  });

  it("rewrites /webhook URL to /capabilities", async () => {
    const mockFetch = mockFetchResolving(MOCK_CAPABILITIES);
    vi.stubGlobal("fetch", mockFetch);

    await act(() => {
      root.render(
        <BackendCapabilitiesCard orchestratorUrl="http://127.0.0.1:8080/webhook" />,
      );
    });

    await flushMicrotasks();

    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8080/capabilities",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("shows unreachable backend correctly", async () => {
    const partialData = {
      ...MOCK_CAPABILITIES,
      backends: {
        ...MOCK_CAPABILITIES.backends,
        crewai: {
          ...MOCK_CAPABILITIES.backends.crewai,
          reachable: false,
        },
      },
    };

    vi.stubGlobal("fetch", mockFetchResolving(partialData));

    await act(() => {
      root.render(
        <BackendCapabilitiesCard orchestratorUrl="http://127.0.0.1:8080/capabilities" />,
      );
    });

    await flushMicrotasks();

    expect(container.textContent).toContain("1/2 reachable");
  });
});
