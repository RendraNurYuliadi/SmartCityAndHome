import "server-only";

import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { getUsersCollection } from "@/lib/mongodb";
import { getAuthSessionSecret } from "@/lib/auth-shared";

export { assertAuthSessionConfigured, normalizeEmail } from "@/lib/auth-shared";

const sessionCookieName = "noventra_session";
const sessionMaxAgeSeconds = 60 * 60 * 24 * 7;

export type AuthRole = "admin" | "public";
export type SessionUser = {
  id: string;
  email: string;
  role: AuthRole;
};

function getCookieValue(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  for (const cookie of cookieHeader.split(";")) {
    const separatorIndex = cookie.indexOf("=");
    if (separatorIndex < 0 || cookie.slice(0, separatorIndex).trim() !== name) {
      continue;
    }
    return cookie.slice(separatorIndex + 1).trim();
  }
  return null;
}

function createSessionToken(userId: string) {
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      exp: Math.floor(Date.now() / 1000) + sessionMaxAgeSeconds,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", getAuthSessionSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function setSessionCookie(response: NextResponse, userId: string) {
  response.cookies.set(sessionCookieName, createSessionToken(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionMaxAgeSeconds,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(sessionCookieName, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getAuthenticatedUser(
  request: Request,
): Promise<SessionUser | null> {
  const token = getCookieValue(request, sessionCookieName);
  if (!token) return null;

  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra !== undefined) return null;

  let payload: unknown;
  let signature: Buffer;
  try {
    payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
    signature = Buffer.from(encodedSignature, "base64url");
  } catch {
    return null;
  }

  const expectedSignature = createHmac("sha256", getAuthSessionSecret())
    .update(encodedPayload)
    .digest();
  if (
    signature.length !== expectedSignature.length ||
    !timingSafeEqual(signature, expectedSignature)
  ) {
    return null;
  }

  if (typeof payload !== "object" || payload === null) return null;
  const session = payload as Record<string, unknown>;
  if (
    typeof session.sub !== "string" ||
    !ObjectId.isValid(session.sub) ||
    typeof session.exp !== "number" ||
    session.exp <= Math.floor(Date.now() / 1000)
  ) {
    return null;
  }

  const user = await getUsersCollection().then((collection) =>
    collection.findOne({ _id: new ObjectId(session.sub as string) }),
  );
  if (!user || (user.role !== "admin" && user.role !== "public")) return null;

  return { id: user._id.toString(), email: user.email, role: user.role };
}

