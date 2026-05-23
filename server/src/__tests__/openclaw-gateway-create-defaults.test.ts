import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agentRoutes } from "../routes/agents.js";
import { errorHandler } from "../middleware/index.js";

const agentId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";

const baseAgent = {
  id: agentId,
  companyId,
  name: "Chief",
  urlKey: "chief",
  role: "ceo",
  title: "CEO",
  icon: null,
  status: "idle",
  reportsTo: null,
  capabilities: null,
  adapterType: "openclaw_gateway",
  adapterConfig: {},
  runtimeConfig: {},
  budgetMonthlyCents: 0,
  spentMonthlyCents: 0,
  pauseReason: null,
  pausedAt: null,
  permissions: { canCreateAgents: false },
  lastHeartbeatAt: null,
  metadata: null,
  createdAt: new Date("2026-03-19T00:00:00.000Z"),
  updatedAt: new Date("2026-03-19T00:00:00.000Z"),
};

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(async (_id: string, patch: Record<string, unknown>) => {
    const ac = (patch.adapterConfig as Record<string, unknown> | undefined) ?? {};
    return {
      ...baseAgent,
      adapterConfig: { ...((baseAgent.adapterConfig as Record<string, unknown>) ?? {}), ...ac },
    };
  }),
  updatePermissions: vi.fn(),
  getChainOfCommand: vi.fn(),
  resolveByReference: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn(),
  hasPermission: vi.fn(),
  getMembership: vi.fn(),
  ensureMembership: vi.fn(),
  listPrincipalGrants: vi.fn(),
  setPrincipalPermission: vi.fn(),
}));

const mockApprovalService = vi.hoisted(() => ({
  create: vi.fn(),
  getById: vi.fn(),
}));

const mockBudgetService = vi.hoisted(() => ({
  upsertPolicy: vi.fn(),
}));

const mockHeartbeatService = vi.hoisted(() => ({
  listTaskSessions: vi.fn(),
  resetRuntimeSession: vi.fn(),
}));

const mockIssueApprovalService = vi.hoisted(() => ({
  linkManyForApproval: vi.fn(),
}));

const mockIssueService = vi.hoisted(() => ({
  list: vi.fn(),
}));

const mockSecretService = vi.hoisted(() => ({
  normalizeAdapterConfigForPersistence: vi.fn(),
  resolveAdapterConfigForRuntime: vi.fn(),
}));

const mockAgentInstructionsService = vi.hoisted(() => ({
  materializeManagedBundle: vi.fn(),
}));
const mockCompanySkillService = vi.hoisted(() => ({
  listRuntimeSkillEntries: vi.fn(),
  resolveRequestedSkillKeys: vi.fn(),
}));
const mockWorkspaceOperationService = vi.hoisted(() => ({}));
const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  agentService: () => mockAgentService,
  agentInstructionsService: () => mockAgentInstructionsService,
  accessService: () => mockAccessService,
  approvalService: () => mockApprovalService,
  companySkillService: () => mockCompanySkillService,
  budgetService: () => mockBudgetService,
  heartbeatService: () => mockHeartbeatService,
  issueApprovalService: () => mockIssueApprovalService,
  issueService: () => mockIssueService,
  logActivity: mockLogActivity,
  secretService: () => mockSecretService,
  syncInstructionsBundleConfigFromFilePath: vi.fn((_agent, config) => config),
  workspaceOperationService: () => mockWorkspaceOperationService,
}));

function createDbStub() {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          then: vi.fn().mockResolvedValue([
            {
              id: companyId,
              name: "Acme",
              requireBoardApprovalForNewAgents: false,
            },
          ]),
        }),
      }),
    }),
  };
}

function createApp(actor: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", agentRoutes(createDbStub() as any));
  app.use(errorHandler);
  return app;
}

describe("openclaw_gateway create defaults (adapterConfig.url)", () => {
  const originalWsUrl = process.env.PAPERCLIP_DEFAULT_OPENCLAW_GATEWAY_WS_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PAPERCLIP_DEFAULT_OPENCLAW_GATEWAY_WS_URL;
    mockAgentService.create.mockImplementation((_cid, data) =>
      Promise.resolve({
        ...baseAgent,
        ...data,
        adapterConfig: data.adapterConfig ?? baseAgent.adapterConfig,
      }),
    );
    mockAccessService.ensureMembership.mockResolvedValue(undefined);
    mockAccessService.setPrincipalPermission.mockResolvedValue(undefined);
    mockCompanySkillService.listRuntimeSkillEntries.mockResolvedValue([]);
    mockCompanySkillService.resolveRequestedSkillKeys.mockImplementation(
      async (_companyId: string, requested: string[]) => requested,
    );
    mockSecretService.normalizeAdapterConfigForPersistence.mockImplementation(async (_companyId, config) => config);
    mockSecretService.resolveAdapterConfigForRuntime.mockImplementation(async (_companyId, config) => ({ config }));
    mockLogActivity.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalWsUrl === undefined) {
      delete process.env.PAPERCLIP_DEFAULT_OPENCLAW_GATEWAY_WS_URL;
    } else {
      process.env.PAPERCLIP_DEFAULT_OPENCLAW_GATEWAY_WS_URL = originalWsUrl;
    }
  });

  it("fills ws://127.0.0.1:18789 when adapterConfig.url is missing", async () => {
    const app = createApp({
      type: "board",
      userId: "board-user",
      source: "local_implicit",
      isInstanceAdmin: true,
      companyIds: [companyId],
    });

    const res = await request(app).post(`/api/companies/${companyId}/agents`).send({
      name: "Chief",
      role: "ceo",
      adapterType: "openclaw_gateway",
      adapterConfig: {},
    });

    expect(res.status).toBe(201);
    expect(mockAgentService.create).toHaveBeenCalledWith(
      companyId,
      expect.objectContaining({
        adapterConfig: expect.objectContaining({
          url: "ws://127.0.0.1:18789",
        }),
      }),
    );
  });

  it("uses PAPERCLIP_DEFAULT_OPENCLAW_GATEWAY_WS_URL when set", async () => {
    process.env.PAPERCLIP_DEFAULT_OPENCLAW_GATEWAY_WS_URL = "ws://host.docker.internal:18789";

    const app = createApp({
      type: "board",
      userId: "board-user",
      source: "local_implicit",
      isInstanceAdmin: true,
      companyIds: [companyId],
    });

    const res = await request(app).post(`/api/companies/${companyId}/agents`).send({
      name: "Chief",
      role: "ceo",
      adapterType: "openclaw_gateway",
      adapterConfig: {},
    });

    expect(res.status).toBe(201);
    expect(mockAgentService.create).toHaveBeenCalledWith(
      companyId,
      expect.objectContaining({
        adapterConfig: expect.objectContaining({
          url: "ws://host.docker.internal:18789",
        }),
      }),
    );
  });

  it("seeds paperclip:agent:<id> sessionKey when fixed strategy uses legacy default", async () => {
    const app = createApp({
      type: "board",
      userId: "board-user",
      source: "local_implicit",
      isInstanceAdmin: true,
      companyIds: [companyId],
    });

    const res = await request(app).post(`/api/companies/${companyId}/agents`).send({
      name: "Chief",
      role: "ceo",
      adapterType: "openclaw_gateway",
      adapterConfig: {
        url: "wss://gw.example.com/oc",
        sessionKeyStrategy: "fixed",
        sessionKey: "paperclip",
      },
    });

    expect(res.status).toBe(201);
    expect(mockAgentService.update).toHaveBeenCalledWith(
      agentId,
      expect.objectContaining({
        adapterConfig: expect.objectContaining({
          sessionKey: `paperclip:agent:${agentId}`,
          url: "wss://gw.example.com/oc",
        }),
      }),
      expect.objectContaining({ recordRevision: expect.objectContaining({ source: "openclaw_session_key_seed" }) }),
    );
    expect(res.body.adapterConfig).toMatchObject({
      sessionKey: `paperclip:agent:${agentId}`,
    });
  });

  it("does not seed sessionKey when operator sets a custom fixed key", async () => {
    const app = createApp({
      type: "board",
      userId: "board-user",
      source: "local_implicit",
      isInstanceAdmin: true,
      companyIds: [companyId],
    });

    mockAgentService.update.mockClear();

    const res = await request(app).post(`/api/companies/${companyId}/agents`).send({
      name: "Chief",
      role: "ceo",
      adapterType: "openclaw_gateway",
      adapterConfig: {
        url: "wss://gw.example.com/oc",
        sessionKeyStrategy: "fixed",
        sessionKey: "ceo-lane",
      },
    });

    expect(res.status).toBe(201);
    expect(mockAgentService.update).not.toHaveBeenCalled();
    expect(res.body.adapterConfig.sessionKey).toBe("ceo-lane");
  });

  it("does not override an explicit url", async () => {
    const app = createApp({
      type: "board",
      userId: "board-user",
      source: "local_implicit",
      isInstanceAdmin: true,
      companyIds: [companyId],
    });

    const res = await request(app).post(`/api/companies/${companyId}/agents`).send({
      name: "Chief",
      role: "ceo",
      adapterType: "openclaw_gateway",
      adapterConfig: { url: "wss://gw.example.com/openclaw" },
    });

    expect(res.status).toBe(201);
    expect(mockAgentService.create).toHaveBeenCalledWith(
      companyId,
      expect.objectContaining({
        adapterConfig: expect.objectContaining({
          url: "wss://gw.example.com/openclaw",
        }),
      }),
    );
  });
});
