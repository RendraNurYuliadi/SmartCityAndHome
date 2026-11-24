import { loadEnvConfig } from "@next/env";
import {
  assertAuthSessionConfigured,
  normalizeEmail,
} from "../src/lib/auth-shared";
import { closeMongoConnection, getUsersCollection } from "../src/lib/mongodb";
import { hashPassword } from "../src/lib/password";

loadEnvConfig(process.cwd());

function promptValue(message: string, hidden: boolean) {
  const input = process.stdin;
  if (!input.isTTY || !input.setRawMode) {
    throw new Error("Perintah ini harus dijalankan langsung di terminal interaktif.");
  }

  return new Promise<string>((resolve, reject) => {
    let value = "";
    const previousRawMode = input.isRaw;
    process.stdout.write(message);
    input.setRawMode(true);
    input.setEncoding("utf8");
    input.resume();

    const finish = (error?: Error) => {
      input.off("data", onData);
      input.setRawMode(previousRawMode);
      input.pause();
      process.stdout.write("\r\n");
      if (error) reject(error);
      else resolve(value);
    };

    const onData = (chunk: string | Buffer) => {
      for (const character of chunk.toString()) {
        if (character === "\u0003") {
          finish(new Error("Pembuatan admin dibatalkan."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            if (!hidden) process.stdout.write("\b \b");
          }
          continue;
        }
        if (character >= " ") {
          value += character;
          process.stdout.write(hidden ? "*" : character);
        }
      }
    };

    input.on("data", onData);
  });
}

async function main() {
  assertAuthSessionConfigured();
  const emailInput = await promptValue("Email admin: ", false);
  const email = normalizeEmail(emailInput);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error("Format email tidak valid.");
  }

  const password = await promptValue("Password admin (minimal 12 karakter): ", true);
  if (password.length < 12 || password.length > 256) {
    throw new Error("Password admin harus 12 sampai 256 karakter.");
  }

  const users = await getUsersCollection();
  const existing = await users.findOne({ email });
  const passwordHash = await hashPassword(password);
  if (existing) {
    await users.updateOne(
      { _id: existing._id },
      { $set: { role: "admin", passwordHash } },
    );
    console.log("Akun berhasil diperbarui menjadi admin.");
    return;
  }

  await users.insertOne({
    email,
    passwordHash,
    role: "admin",
    createdAt: new Date(),
  });
  console.log("Akun admin berhasil dibuat.");
}

main()
  .catch((error: unknown) => {
    console.error(
      "Gagal membuat akun admin:",
      error instanceof Error ? error.message : "Kesalahan tidak diketahui.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMongoConnection();
  });
