import { NextResponse } from "next/server";
import {
  assertAuthSessionConfigured,
  normalizeEmail,
  setSessionCookie,
} from "@/lib/auth";
import { getUsersCollection } from "@/lib/mongodb";
import { hashPassword } from "@/lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isDuplicateEmailError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Body harus berupa JSON yang valid." }, { status: 400 });
  }

  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return NextResponse.json({ error: "Data pendaftaran tidak valid." }, { status: 400 });
  }

  const body = input as Record<string, unknown>;
  if (
    typeof body.email !== "string" ||
    body.email.trim().length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ||
    typeof body.password !== "string" ||
    body.password.length < 8 ||
    body.password.length > 256
  ) {
    return NextResponse.json(
      { error: "Masukkan email valid dan password 8 sampai 256 karakter." },
      { status: 400 },
    );
  }

  try {
    assertAuthSessionConfigured();
    const email = normalizeEmail(body.email);
    const users = await getUsersCollection();
    const existing = await users.findOne({ email }, { projection: { _id: 1 } });
    if (existing) {
      return NextResponse.json(
        { error: "Email sudah terdaftar." },
        { status: 409 },
      );
    }

    const result = await users.insertOne({
      email,
      passwordHash: await hashPassword(body.password),
      role: "public",
      createdAt: new Date(),
    });
    const response = NextResponse.json(
      { user: { id: result.insertedId.toString(), email, role: "public" } },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
    setSessionCookie(response, result.insertedId.toString());
    return response;
  } catch (error) {
    if (isDuplicateEmailError(error)) {
      return NextResponse.json(
        { error: "Email sudah terdaftar." },
        { status: 409 },
      );
    }
    console.error(
      "Gagal membuat akun:",
      error instanceof Error ? error.name : "UnknownError",
    );
    const message =
      error instanceof Error && error.message.startsWith("AUTH_SESSION_SECRET")
        ? error.message
        : "Akun gagal dibuat. Periksa koneksi database dan coba lagi.";
    return NextResponse.json(
      { error: message },
      { status: message.startsWith("AUTH_SESSION_SECRET") ? 503 : 500 },
    );
  }
}
