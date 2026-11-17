import { NextResponse } from "next/server";
import { getReadingsCollection } from "@/lib/mongodb";
import { sensorAssistantPrompt } from "@/lib/chat-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const nvidiaNimEndpoint = "https://integrate.api.nvidia.com/v1/chat/completions";
const freeNvidiaNimChatModels = [
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "nvidia/nemotron-3.5-bolt-e4b",
  "nvidia/nemotron-3-ultra-550b-a55b",
  "stepfun-ai/step-5-preview",
  "z-ai/glm-5.3-flash",
] as const;
const defaultNvidiaNimModel = "nvidia/nemotron-3.5-lightning-30b-a3b";
const maxHistoryMessages = 10;
const apiKeyVariableNames = [
  "NVIDIA_NIM_API_KEY_1",
  "NVIDIA_NIM_API_KEY_2",
  "NVIDIA_NIM_API_KEY_3",
  "NVIDIA_NIM_API_KEY_4",
  "NVIDIA_NIM_API_KEY_5",
] as const;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!Array.isArray(value)) return "";

  return value
    .map((part) => {
      if (typeof part === "string") return part;
      const item = asRecord(part);
      return item &&
        (item.type === "text" || item.type === "output_text") &&
        typeof item.text === "string"
        ? item.text
        : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function getAssistantText(result: unknown) {
  const responseBody = asRecord(result);
  const choices = responseBody?.choices;
  const firstChoice = Array.isArray(choices) ? asRecord(choices[0]) : null;
  const message = asRecord(firstChoice?.message);
  const content =
    extractText(message?.content) ||
    (typeof message?.refusal === "string" ? message.refusal.trim() : "");

  return { responseBody, firstChoice, message, content };
}

function getNvidiaNimApiKeys() {
  return apiKeyVariableNames.flatMap((name, index) => {
    const value = process.env[name]?.trim();
    return value ? [{ slot: index + 1, value }] : [];
  });
}

function getProviderError(value: unknown) {
  const errorValue = asRecord(value)?.error;
  const error = asRecord(errorValue);
  return {
    code: typeof error?.code === "string" ? error.code : "",
    message:
      typeof error?.message === "string"
        ? error.message
        : typeof errorValue === "string"
          ? errorValue
          : "",
  };
}

function shouldTryNextApiKey(status: number, errorCode: string, errorMessage: string) {
  return (
    status === 401 ||
    status === 403 ||
    status === 429 ||
    /insufficient[_ ]quota|quota[_ ]exceeded|rate[_ ]limit/i.test(
      `${errorCode} ${errorMessage}`,
    )
  );
}

function isChatHistory(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.length <= maxHistoryMessages &&
    value.every(
      (message) =>
        typeof message === "object" &&
        message !== null &&
        ((message as Record<string, unknown>).role === "user" ||
          (message as Record<string, unknown>).role === "assistant") &&
        typeof (message as Record<string, unknown>).content === "string" &&
        ((message as { content: string }).content.length <= 1500),
    )
  );
}

export async function POST(request: Request) {
  const apiKeys = getNvidiaNimApiKeys();
  if (apiKeys.length === 0) {
    return NextResponse.json(
      {
        error:
          "Isi minimal satu NVIDIA_NIM_API_KEY_1 sampai NVIDIA_NIM_API_KEY_5 di environment server.",
      },
      { status: 503 },
    );
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Body harus berupa JSON yang valid." }, { status: 400 });
  }

  if (typeof input !== "object" || input === null) {
    return NextResponse.json({ error: "Permintaan chat tidak valid." }, { status: 400 });
  }

  const body = input as Record<string, unknown>;
  if (
    typeof body.message !== "string" ||
    body.message.trim().length === 0 ||
    body.message.length > 1500 ||
    (body.history !== undefined && !isChatHistory(body.history))
  ) {
    return NextResponse.json(
      { error: "Pesan wajib diisi (maksimal 1500 karakter) dan riwayat chat harus valid." },
      { status: 400 },
    );
  }

  try {
    const readings = await getReadingsCollection().then((collection) =>
      collection.find({ deviceId: "esp32-smart-city" })
        .sort({ recordedAt: -1 })
        .limit(5)
        .toArray(),
    );
    const latest = readings[0] ?? null;
    const refreshedAt = new Date();
    const formatReadingForAssistant = (reading: (typeof readings)[number]) => ({
      ...reading,
      _id: reading._id.toString(),
      recordedAt: reading.recordedAt.toISOString(),
      parking: {
        ...reading.parking,
        dashboardSlots: [
          { slot: "A", occupied: reading.parking.slotBOccupied },
          { slot: "B", occupied: reading.parking.slotAOccupied },
          { slot: "C", occupied: reading.parking.slotCOccupied },
        ],
      },
    });
    const sensorSnapshot = {
      refreshedAt: refreshedAt.toISOString(),
      latestReading: latest ? formatReadingForAssistant(latest) : null,
      recentReadings: readings.map(formatReadingForAssistant),
    };

    const history = isChatHistory(body.history) ? body.history.slice(-maxHistoryMessages) : [];
    const messages = [
      { role: "system", content: sensorAssistantPrompt },
      {
        role: "system",
        content: `Snapshot sensor terbaru dari MongoDB (JSON):\n${JSON.stringify(sensorSnapshot)}`,
      },
      ...history,
      { role: "user", content: body.message.trim() },
    ];

    const requestedModel =
      process.env.NVIDIA_NIM_MODEL?.trim() || defaultNvidiaNimModel;
    const model = freeNvidiaNimChatModels.find(
      (freeModel) => freeModel === requestedModel,
    );
    if (!model) {
      return NextResponse.json(
        {
          error: `NVIDIA_NIM_MODEL harus salah satu dari: ${freeNvidiaNimChatModels.join(", ")}.`,
        },
        { status: 503 },
      );
    }

    let response: Response | null = null;
    let result: unknown = null;
    let lastFailure: {
      status: number;
      keySlot: number;
      code: string;
      message: string;
    } | null = null;

    for (const [index, apiKey] of apiKeys.entries()) {
      const currentResponse = await fetch(nvidiaNimEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey.value}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: 1200,
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(30_000),
        cache: "no-store",
      });

      if (currentResponse.ok) {
        response = currentResponse;
        result = await currentResponse.json();
        break;
      }

      const errorBody: unknown = await currentResponse.json().catch(() => null);
      const providerError = getProviderError(errorBody);
      lastFailure = {
        status: currentResponse.status,
        keySlot: apiKey.slot,
        ...providerError,
      };

      if (
        shouldTryNextApiKey(
          currentResponse.status,
          providerError.code,
          providerError.message,
        ) &&
        index < apiKeys.length - 1
      ) {
        console.warn("NVIDIA NIM key gagal; mencoba key berikutnya:", {
          keySlot: apiKey.slot,
          status: currentResponse.status,
          code: providerError.code || undefined,
        });
        continue;
      }

      break;
    }

    if (!response) {
      console.error("NVIDIA NIM request gagal:", {
        model,
        status: lastFailure?.status,
        keySlot: lastFailure?.keySlot,
        code: lastFailure?.code || undefined,
      });
      const quotaReached =
        lastFailure?.status === 429 ||
        /insufficient[_ ]quota|quota[_ ]exceeded|rate[_ ]limit/i.test(
          `${lastFailure?.code ?? ""} ${lastFailure?.message ?? ""}`,
        );
      const unauthorized =
        lastFailure?.status === 401 || lastFailure?.status === 403;
      return NextResponse.json(
        {
          error: quotaReached
            ? "Kuota atau rate limit NVIDIA NIM tercapai untuk semua API key yang diisi."
            : unauthorized
              ? "NVIDIA NIM menolak API key. Periksa key yang diatur di environment server."
              : `NVIDIA NIM gagal menjawab (HTTP ${lastFailure?.status ?? "tidak diketahui"}).`,
        },
        { status: quotaReached ? 429 : unauthorized ? 503 : 502 },
      );
    }

    const { responseBody, firstChoice, message: assistantMessage, content } =
      getAssistantText(result);
    const responseModel =
      typeof responseBody?.model === "string" ? responseBody.model : model;

    if (!content) {
      console.error("NVIDIA NIM mengembalikan pilihan tanpa teks:", {
        model: responseModel,
        finishReason: firstChoice?.finish_reason,
        messageFields: assistantMessage ? Object.keys(assistantMessage) : [],
      });
      return NextResponse.json(
        { error: "NVIDIA NIM tidak menghasilkan jawaban teks. Silakan coba lagi." },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        answer: content,
        model: responseModel,
        refreshedAt: refreshedAt.toISOString(),
        readingAt: latest?.recordedAt.toISOString() ?? null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Gagal memproses chat sensor:", error);
    const timedOut =
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "TimeoutError";
    return NextResponse.json(
      {
        error: timedOut
          ? "Permintaan AI melewati batas waktu. Coba lagi."
          : "Gagal membaca data sensor terbaru atau menghubungi NVIDIA NIM.",
      },
      { status: timedOut ? 504 : 500 },
    );
  }
}
