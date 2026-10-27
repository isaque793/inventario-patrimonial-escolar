import { afterEach, describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { isBlockedBySuspension, setSchoolAccessSuspended } from "./_core/schoolAccess";
import type { TrpcContext } from "./_core/context";

type User = NonNullable<TrpcContext["user"]>;

function ctxFor(role: User["role"]): TrpcContext {
  const user: User = {
    id: 1,
    openId: "u",
    email: "u@example.com",
    name: "U",
    loginMethod: "password",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  } as User;
  return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

afterEach(() => setSchoolAccessSuspended(false));

describe("suspensão do acesso das escolas", () => {
  it("bloqueia apenas o perfil de escola", () => {
    setSchoolAccessSuspended(true);
    expect(isBlockedBySuspension({ role: "user" })).toBe(true);
    expect(isBlockedBySuspension({ role: "manager" })).toBe(false);
    expect(isBlockedBySuspension({ role: "admin" })).toBe(false);
    expect(isBlockedBySuspension(null)).toBe(false);
  });

  it("não bloqueia ninguém quando não está suspenso", () => {
    expect(isBlockedBySuspension({ role: "user" })).toBe(false);
  });

  it("recusa novos registros durante a suspensão", async () => {
    setSchoolAccessSuspended(true);
    const caller = appRouter.createCaller({ user: null, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
    await expect(caller.auth.register({ email: "nova@escola.com", password: "12345678" })).rejects.toThrow(/suspenso/);
  });

  it("só o administrador altera e lê o estado", async () => {
    await expect(appRouter.createCaller(ctxFor("manager")).management.setSchoolAccessSuspended({ suspended: true })).rejects.toThrow();
    await expect(appRouter.createCaller(ctxFor("user")).management.schoolAccessStatus()).rejects.toThrow();
    const admin = appRouter.createCaller(ctxFor("admin"));
    await expect(admin.management.setSchoolAccessSuspended({ suspended: true })).resolves.toEqual({ suspended: true });
    await expect(admin.management.schoolAccessStatus()).resolves.toEqual({ suspended: true });
  });
});
