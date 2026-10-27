import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { parse } from "cookie";
import { COOKIE_NAME } from "@shared/const";
import type { User } from "../../drizzle/schema";
import { getUserById } from "../db";
import { isBlockedBySuspension } from "./schoolAccess";
import { verifySessionToken } from "./session";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    const cookies = parse(opts.req.headers.cookie ?? "");
    const token = cookies[COOKIE_NAME];
    if (token) {
      const userId = await verifySessionToken(token);
      if (userId) user = (await getUserById(userId)) ?? null;
    }
    if (isBlockedBySuspension(user)) user = null;
  } catch {
    user = null;
  }

  return { req: opts.req, res: opts.res, user };
}
