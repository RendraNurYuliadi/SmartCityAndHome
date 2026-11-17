export type LightCommandIntent =
  | { type: "rgb"; on: boolean }
  | { type: "street-light"; on: boolean };

export type ChatRouteAction =
  | { type: "set-rgb-led"; on: boolean }
  | { type: "set-street-light"; on: boolean };

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

const turnOnPattern =
  /\b(?:nyalakan|nayalakn|nyalakn|hidupkan|aktifkan|nyalain|hidupin|turn\s+on|switch\s+on|web\s+on)\b/i;
const turnOffPattern =
  /\b(?:matikan|padamkan|nonaktifkan|turn\s+off|switch\s+off|web\s+off)\b/i;

export function normalizeChatMessage(message: string) {
  return message
    .normalize("NFKC")
    .toLowerCase()
    .replace(/lam\[u/g, "lampu")
    .replace(/\bkonisi\b/g, "kondisi")
    .replace(/\b(?:sekarnag|sekanrag|skrnag)\b/g, "sekarang")
    .replace(/\btlong\b/g, "tolong")
    .replace(/[.!]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type LightTarget = "rgb" | "street-light";

function getExplicitLightTarget(message: string) {
  const mentionsStreetLight =
    /\b(?:lampu\s+jalan|street[\s-]*light)\b/i.test(message);
  const mentionsRgb = /\brgb\b/i.test(message);
  const mentionsHomeLight = /\blampu\s+rumah\b/i.test(message);
  const mentionsLed = /\bled\b/i.test(message);
  const mentionsLight = /\blampu\b/i.test(message);

  if (mentionsStreetLight && (mentionsRgb || mentionsHomeLight)) {
    return { target: null, hasReference: true, ambiguous: true };
  }
  if (mentionsStreetLight) {
    return { target: "street-light" as const, hasReference: true, ambiguous: false };
  }
  if (mentionsRgb || mentionsHomeLight || mentionsLed) {
    return { target: "rgb" as const, hasReference: true, ambiguous: false };
  }
  return {
    target: null,
    hasReference: mentionsLight,
    ambiguous: false,
  };
}

function getRecentLightTarget(history: readonly ChatHistoryMessage[]) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message.role !== "user") continue;
    return getExplicitLightTarget(normalizeChatMessage(message.content)).target;
  }
  return null;
}

const contextualCommandPattern =
  /^(?:(?:tolong|coba|sekarang|langsung|ya|dong|deh|saja|silakan|please|lampu|lampunya|itu|nya|yang|tadi)\s+)*(?:nyalakan|nayalakn|nyalakn|hidupkan|aktifkan|nyalain|hidupin|matikan|padamkan|nonaktifkan|turn\s+on|turn\s+off|switch\s+on|switch\s+off|web\s+on|web\s+off)(?:\s+(?:tolong|coba|sekarang|langsung|ya|dong|deh|saja|silakan|please|lampu|lampunya|itu|nya|yang|tadi))*$/i;
const contextualStatusQuestionPattern =
  /^(?:(?:bagaimana|gimana|gmn|kondisi|kondisinya|konisi|status|statusnya|sekarang|skrg|saat|ini|masih|nyala|menyala|mati|hidup|on|off|itu|lampu|lampunya|nya|tidak|belum|apakah|sih|ya|kok)\s*)+[?？]?$/i;

function isQuestionOrAutomaticRequest(message: string) {
  if (
    /[?？]|\b(?:apakah|bagaimana|kenapa|mengapa|cara|mau\s+tanya|ingin\s+tahu)\b/i.test(
      message,
    )
  ) {
    return true;
  }

  return /\b(?:otomatis|auto|ldr|sensor)\b/i.test(message);
}

function getLightCommand(message: string) {
  const on = turnOnPattern.test(message);
  const off = turnOffPattern.test(message);
  return on === off ? null : { on };
}

export function getLightCommandIntent(
  message: string,
  history: readonly ChatHistoryMessage[] = [],
): LightCommandIntent | null {
  const normalizedMessage = normalizeChatMessage(message);
  if (isQuestionOrAutomaticRequest(normalizedMessage)) return null;

  const command = getLightCommand(normalizedMessage);
  if (!command) return null;

  const explicitTarget = getExplicitLightTarget(normalizedMessage);
  let target: LightTarget | null = explicitTarget.target;
  if (!target) {
    if (
      !contextualCommandPattern.test(normalizedMessage) ||
      explicitTarget.ambiguous ||
      (explicitTarget.hasReference &&
        !/\blampu(?:nya)?\b/i.test(normalizedMessage))
    ) {
      return null;
    }
    target = getRecentLightTarget(history);
  }
  if (!target) return null;

  return target === "rgb"
    ? { type: "rgb", on: command.on }
    : { type: "street-light", on: command.on };
}

export function needsLightCommandClarification(
  message: string,
  history: readonly ChatHistoryMessage[] = [],
) {
  const normalizedMessage = normalizeChatMessage(message);
  if (isQuestionOrAutomaticRequest(normalizedMessage)) return false;
  if (!getLightCommand(normalizedMessage)) return false;

  const explicitTarget = getExplicitLightTarget(normalizedMessage);
  if (explicitTarget.target) return false;
  if (explicitTarget.ambiguous) return true;

  const looksLikeLightCommand =
    explicitTarget.hasReference ||
    contextualCommandPattern.test(normalizedMessage);
  return looksLikeLightCommand && !getRecentLightTarget(history);
}

export function getLightStatusTarget(
  question: string,
  history: readonly ChatHistoryMessage[] = [],
): LightTarget | null {
  const normalizedQuestion = normalizeChatMessage(question);
  if (
    !/\b(?:kondisi|kondisinya|status|statusnya|sekarang|saat\s+ini|masih|aktual|terakhir|nyala|nyalanya|menyala|mati|hidup|on|off)\b/i.test(
      normalizedQuestion,
    )
  ) {
    return null;
  }

  const explicitTarget = getExplicitLightTarget(normalizedQuestion);
  if (explicitTarget.target || explicitTarget.ambiguous) {
    return explicitTarget.target;
  }
  if (
    explicitTarget.hasReference ||
    contextualStatusQuestionPattern.test(normalizedQuestion)
  ) {
    return getRecentLightTarget(history);
  }
  return null;
}

export function getLightCommandClarification() {
  return "Lampu mana yang ingin dikendalikan: lampu rumah/RGB atau lampu jalan? Belum ada perintah yang diubah.";
}

/*
 * Parking and light status queries are answered from telemetry instead of the
 * language model so labels and physical state cannot be invented.
 */
export function hasParkingStatusQuestion(message: string) {
  const normalizedMessage = normalizeChatMessage(message);
  const mentionsParking =
    /\b(?:park(?:ir|iran|itan)?|slot(?:s)?)\b/i.test(normalizedMessage);
  const asksForStatus =
    /\b(?:kondisi|status|sekarang|saat\s+ini|berapa|jumlah|kosong|terisi|tersedia|sisa|occupied|available)\b/i.test(
      normalizedMessage,
    );
  return mentionsParking && asksForStatus;
}

function formatTelemetryTime(recordedAt: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(recordedAt);
}

/*
 * The dashboard intentionally maps sensor A to displayed slot B and vice
 * versa; use the dashboard mapping when reporting user-facing slot labels.
 */
export function getParkingStatusAnswer(
  question: string,
  reading: {
    recordedAt: Date;
    parking: {
      slotAOccupied: boolean;
      slotBOccupied: boolean;
      slotCOccupied: boolean;
    };
  } | null,
) {
  if (!hasParkingStatusQuestion(question)) return null;
  if (!reading) {
    return "Belum ada data parkir terbaru dari ESP32.";
  }

  const slots = [
    { name: "A", occupied: reading.parking.slotBOccupied },
    { name: "B", occupied: reading.parking.slotAOccupied },
    { name: "C", occupied: reading.parking.slotCOccupied },
  ];
  const occupied = slots.filter((slot) => slot.occupied).length;
  const available = slots.length - occupied;

  return [
    `Status parkir terbaru (telemetri ${formatTelemetryTime(reading.recordedAt)} WIB):`,
    ...slots.map(
      (slot) => `- Slot ${slot.name}: ${slot.occupied ? "Terisi" : "Kosong"}`,
    ),
    `- Total: ${occupied} terisi, ${available} kosong.`,
  ].join("\n");
}

export function getLightStatusAnswer(
  question: string,
  reading: {
    recordedAt: Date;
    rgbLedOn: boolean;
    streetLightOn: boolean;
  } | null,
  command: {
    rgbLedOn: boolean;
    streetLightOverride?: boolean | null;
    updatedAt: Date;
  } | null,
  history: readonly ChatHistoryMessage[] = [],
) {
  const target = getLightStatusTarget(question, history);
  if (!target) return null;
  const lightName = target === "rgb" ? "lampu rumah/RGB" : "lampu jalan";
  if (!reading) {
    return `Belum ada data sensor terbaru untuk ${lightName}.`;
  }

  const isOn = target === "rgb" ? reading.rgbLedOn : reading.streetLightOn;
  const reportedAt = formatTelemetryTime(reading.recordedAt);
  let answer = `Status fisik terakhir ${lightName}: **${isOn ? "HIDUP" : "MATI"}** (telemetri ${reportedAt} WIB).`;

  const desiredState =
    target === "rgb" ? command?.rgbLedOn : command?.streetLightOverride;
  if (
    command &&
    reading.recordedAt < command.updatedAt &&
    typeof desiredState === "boolean" &&
    desiredState !== isOn
  ) {
    answer += `\n\nPerintah Web ${desiredState ? "ON" : "OFF"} tersimpan setelah telemetri tersebut; perubahan fisik belum terkonfirmasi.`;
  }

  return answer;
}
