import { NextResponse } from "next/server";
import {
  assertAuthSessionConfigured,
  normalizeEmail,
  setSessionCookie,
} from "@/lib/auth";
import { getUsersCollection } from "@/lib/mongodb";
import { verifyPassword } from "@/lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dummyPasswordHash = `scrypt$${Buffer.alloc(16).toString("base64url")}$${Buffer.alloc(64).toString("base64url")}`;

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Body harus berupa JSON yang valid." }, { status: 400 });
  }

  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    typeof (input as Record<string, unknown>).email !== "string" ||
    typeof (input as Record<string, unknown>).password !== "string"
  ) {
    return NextResponse.json({ error: "Email dan password wajib diisi." }, { status: 400 });
  }

  const body = input as Record<string, unknown>;
  const email = normalizeEmail(body.email as string);
  const password = body.password as string;
  if (email.length > 254 || !password || password.length > 256) {
    return NextResponse.json(
      { error: "Email atau password tidak valid." },
      { status: 400 },
    );
  }

  try {
    assertAuthSessionConfigured();
    const user = await getUsersCollection().then((collection) =>
      collection.findOne({ email }),
    );
    const passwordMatches = await verifyPassword(
      password,
      typeof user?.passwordHash === "string"
        ? user.passwordHash
        : dummyPasswordHash,
    );
    if (
      !user ||
      typeof user.passwordHash !== "string" ||
      (user.role !== "admin" && user.role !== "public") ||
      !passwordMatches
    ) {
      return NextResponse.json(
        { error: "Email atau password salah." },
        { status: 401 },
      );
    }

    const response = NextResponse.json(
      {
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
    setSessionCookie(response, user._id.toString());
    return response;
  } catch (error) {
    console.error(
      "Gagal masuk:",
      error instanceof Error ? error.name : "UnknownError",
    );
    const message =
      error instanceof Error && error.message.startsWith("AUTH_SESSION_SECRET")
        ? error.message
        : "Login gagal. Periksa koneksi database dan coba lagi.";
    return NextResponse.json(
      { error: message },
      { status: message.startsWith("AUTH_SESSION_SECRET") ? 503 : 500 },
    );
  }
}
