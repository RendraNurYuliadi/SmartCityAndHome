export type LightCommandIntent =
  | { type: "rgb"; on: boolean }
  | { type: "street-light"; on: boolean };

export type ChatRouteAction =
  | { type: "set-rgb-led"; on: boolean }
  | { type: "set-street-light"; on: boolean };

const turnOnPattern =
  /\b(?:nyalakan|hidupkan|aktifkan|nyalain|hidupin|turn\s+on|switch\s+on|web\s+on)\b/i;
const turnOffPattern =
  /\b(?:matikan|padamkan|nonaktifkan|turn\s+off|switch\s+off|web\s+off)\b/i;

export function getLightCommandIntent(
  message: string,
): LightCommandIntent | null {
  if (
    /[?？]|\b(?:apakah|bagaimana|kenapa|mengapa|cara|mau\s+tanya|ingin\s+tahu)\b/i.test(
      message,
    )
  ) {
    return null;
  }

  const on = turnOnPattern.test(message);
  const off = turnOffPattern.test(message);
  if (on === off) return null;
  if (/\b(?:otomatis|auto|ldr|sensor)\b/i.test(message)) return null;

  const mentionsRgb = /\b(?:rgb|led)\b/i.test(message);
  const mentionsStreetLight = /\b(?:lampu\s+jalan|street[\s-]*light)\b/i.test(message);

  if (mentionsRgb === mentionsStreetLight) {
    return null;
  }

  return mentionsRgb
    ? { type: "rgb", on }
    : { type: "street-light", on };
}
