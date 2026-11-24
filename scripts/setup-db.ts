import { loadEnvConfig } from "@next/env";
import {
  closeMongoConnection,
  getReadingsCollection,
  getCommandsCollection,
  getMessagesCollection,
  getUsersCollection,
} from "../src/lib/mongodb";

loadEnvConfig(process.cwd());

async function main() {
  await Promise.all([
    getReadingsCollection(),
    getCommandsCollection(),
    getMessagesCollection(),
    getUsersCollection(),
  ]);
  console.log(
    "MongoDB siap: pembacaan capped (maks. 50), device_commands, sensor_messages, dan users.",
  );
  await closeMongoConnection();
}

main().catch((error: unknown) => {
  console.error("Gagal menyiapkan MongoDB:", error);
  process.exit(1);
});
