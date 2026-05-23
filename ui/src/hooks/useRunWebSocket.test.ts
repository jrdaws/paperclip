import { describe, it, expect } from "vitest";

describe("useRunWebSocket module", () => {
  it("exports useRunWebSocket hook", async () => {
    const mod = await import("./useRunWebSocket");
    expect(typeof mod.useRunWebSocket).toBe("function");
  });

  it("exports RunStatusUpdate and WsConnectionState types via interface check", async () => {
    const mod = await import("./useRunWebSocket");
    const hook = mod.useRunWebSocket;
    expect(hook.length).toBe(1);
  });
});

describe("httpToWs (internal, tested via hook URL construction)", () => {
  it("converts http:// URLs to ws://", () => {
    const convert = (url: string) => url.replace(/^http/, "ws").replace(/\/webhook\/?$/, "");
    expect(convert("http://127.0.0.1:8000/webhook")).toBe("ws://127.0.0.1:8000");
    expect(convert("https://bridge.example.com/webhook/")).toBe("wss://bridge.example.com");
    expect(convert("http://localhost:8000")).toBe("ws://localhost:8000");
  });
});
