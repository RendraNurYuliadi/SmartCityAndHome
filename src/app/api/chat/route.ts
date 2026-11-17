import { NextResponse } from "next/server";
import {
  getReadingsCollection,
  type SensorReading,
} from "@/lib/mongodb";
import {
  getLightCommandIntent,
  type ChatRouteAction,
} from "@/lib/chat-command-routing";
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
const maxHistoryMessages = 8;
const maxHistoryMessageCharacters = 1200;
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

function getParkingAvailabilityAnswer(
  question: string,
  reading: SensorReading | null,
) {
  const asksAboutParking =
    /\b(?:parkir|parkiran|parkitan|slot)\b/i.test(question);
  const asksAboutAvailability =
    /\b(?:kosong|tersedia|sisa|berapa|jumlah|available)\b/i.test(question);

  if (!asksAboutParking || !asksAboutAvailability) return null;
  if (!reading) {
    return "Belum ada data parkir terbaru dari ESP32, jadi jumlah slot kosong belum bisa dipastikan.";
  }

  const availableSlots = [
    { name: "A", occupied: reading.parking.slotBOccupied },
    { name: "B", occupied: reading.parking.slotAOccupied },
    { name: "C", occupied: reading.parking.slotCOccupied },
  ]
    .filter((slot) => !slot.occupied)
    .map((slot) => slot.name);

  if (availableSlots.length === 0) {
    return "Saat ini semua 3 slot parkir terisi.";
  }

  return `Saat ini ada ${availableSlots.length} slot parkir kosong: ${availableSlots.join(", ")}.`;
}

function createNvidiaRequestBody(
  model: (typeof freeNvidiaNimChatModels)[number],
  messages: Array<{ role: string; content: string }>,
) {
  const isNemotronLightning =
    model === "nvidia/nemotron-3.5-lightning-30b-a3b";

  return {
    model,
    messages,
    max_tokens: 8192,
    temperature: isNemotronLightning ? 1.0 : 0.2,
    ...(isNemotronLightning
      ? {
          top_p: 0.95,
          chat_template_kwargs: { enable_thinking: false },
        }
      : {}),
  };
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
    value.length <= 40 &&
    value.every(
      (message) =>
        typeof message === "object" &&
        message !== null &&
        ((message as Record<string, unknown>).role === "user" ||
          (message as Record<string, unknown>).role === "assistant") &&
        typeof (message as Record<string, unknown>).content === "string" &&
        ((message as { content: string }).content.length <= 20_000),
    )
  );
}

export async function POST(request: Request) {
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

  const lightIntent = getLightCommandIntent(body.message.trim());
  if (lightIntent) {
    const isRgb = lightIntent.type === "rgb";
    const routeAction: ChatRouteAction = isRgb
      ? { type: "set-rgb-led", on: lightIntent.on }
      : { type: "set-street-light", on: lightIntent.on };
    return NextResponse.json(
      {
        answer: `Baik, saya akan ${lightIntent.on ? "menyalakan" : "mematikan"} ${
          isRgb ? "lampu RGB/LED" : "lampu jalan melalui Web ON/OFF"
        } sekarang.`,
        routeAction,
        model: "device-command",
        refreshedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
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
    const parkingAnswer = getParkingAvailabilityAnswer(body.message, latest);
    if (parkingAnswer) {
      return NextResponse.json(
        {
          answer: parkingAnswer,
          model: "sensor-data",
          refreshedAt: refreshedAt.toISOString(),
          readingAt: latest?.recordedAt.toISOString() ?? null,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

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

    const history = isChatHistory(body.history)
      ? body.history
          .slice(-maxHistoryMessages)
          .map((message) => ({
            ...message,
            content: message.content.slice(0, maxHistoryMessageCharacters),
          }))
      : [];
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

    let response: Response | null = null;
    let result: unknown = null;
    let successfulApiKey: (typeof apiKeys)[number] | null = null;
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
        body: JSON.stringify(createNvidiaRequestBody(model, messages)),
        signal: AbortSignal.timeout(30_000),
        cache: "no-store",
      });

      if (currentResponse.ok) {
        response = currentResponse;
        successfulApiKey = apiKey;
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

    let { responseBody, firstChoice, message: assistantMessage, content } =
      getAssistantText(result);
    let responseModel =
      typeof responseBody?.model === "string" ? responseBody.model : model;

    if (!content) {
      const outputLimitReached = firstChoice?.finish_reason === "length";
      console.error("NVIDIA NIM mengembalikan pilihan tanpa teks:", {
        model: responseModel,
        finishReason: firstChoice?.finish_reason,
        messageFields: assistantMessage ? Object.keys(assistantMessage) : [],
      });

      const fallbackModel =
        model === "nvidia/nemotron-3.5-bolt-e4b"
          ? defaultNvidiaNimModel
          : "nvidia/nemotron-3.5-bolt-e4b";
      if (successfulApiKey) {
        const fallbackResponse = await fetch(nvidiaNimEndpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${successfulApiKey.value}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            createNvidiaRequestBody(fallbackModel, messages),
          ),
          signal: AbortSignal.timeout(25_000),
          cache: "no-store",
        });

        if (fallbackResponse.ok) {
          const fallback = getAssistantText(await fallbackResponse.json());
          if (fallback.content) {
            responseBody = fallback.responseBody;
            firstChoice = fallback.firstChoice;
            assistantMessage = fallback.message;
            content = fallback.content;
            responseModel =
              typeof responseBody?.model === "string"
                ? responseBody.model
                : fallbackModel;
          } else {
            console.error("NVIDIA NIM fallback tidak menghasilkan teks:", {
              model: fallbackModel,
              finishReason: fallback.firstChoice?.finish_reason,
            });
          }
        } else {
          console.error("NVIDIA NIM fallback gagal:", {
            model: fallbackModel,
            status: fallbackResponse.status,
          });
        }
      }

      if (!content) {
        return NextResponse.json(
          {
            error: outputLimitReached
              ? "Model mencapai batas output sebelum jawaban selesai."
              : "Model tidak menghasilkan jawaban teks.",
          },
          { status: 502 },
        );
      }
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
