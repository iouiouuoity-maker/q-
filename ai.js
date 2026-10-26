// Worker жарияланғаннан кейін тек осы жолды бір рет өзгертіңіз.
// Мысалы: const AI_API_URL = "https://fearmap-literary-ai-2026.username.workers.dev";
const AI_API_URL = "https://fearmap-literary-ai-2026.vp5vy7g7db.workers.dev";

export const MAX_INPUT_LENGTH = 2400;

export function isAIConfigured() {
  return AI_API_URL.startsWith("https://") && !AI_API_URL.includes("PASTE_NEW_");
}

function apiEndpoint(path) {
  return `${AI_API_URL.replace(/\/$/, "")}${path}`;
}

function extractSseText(payload) {
  if (!payload || payload === "[DONE]") return "";
  try {
    const data = JSON.parse(payload);
    return data.response
      ?? data.choices?.[0]?.delta?.content
      ?? data.choices?.[0]?.message?.content
      ?? "";
  } catch {
    return "";
  }
}

export async function streamAIResponse({ message, history = [], onChunk, signal }) {
  if (!isAIConfigured()) {
    throw new Error("AI Worker URL әлі орнатылмаған. assets/js/ai.js файлын баптаңыз.");
  }

  const response = await fetch(apiEndpoint("/api/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
    signal,
  });

  if (!response.ok) {
    let errorMessage = `AI сервері ${response.status} қатесін қайтарды.`;
    try {
      const data = await response.json();
      if (data?.error) errorMessage = data.error;
    } catch {
      // Keep the useful fallback message.
    }
    throw new Error(errorMessage);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream") || !response.body) {
    const data = await response.json();
    const text = data.response ?? data.result?.response ?? "";
    onChunk(text);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const chunk = extractSseText(line.slice(5).trim());
      if (chunk) {
        fullText += chunk;
        onChunk(chunk);
      }
    }
  }

  if (buffer.startsWith("data:")) {
    const chunk = extractSseText(buffer.slice(5).trim());
    if (chunk) {
      fullText += chunk;
      onChunk(chunk);
    }
  }

  return fullText;
}

export async function analyzeLiteraryCharacter({ work, author, character, excerpt = "", signal }) {
  if (!isAIConfigured()) {
    throw new Error("AI Worker URL әлі орнатылмаған. assets/js/ai.js файлын баптаңыз.");
  }

  const response = await fetch(apiEndpoint("/api/analyze"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ work, author, character, excerpt }),
    signal,
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    // A readable fallback is returned below.
  }

  if (!response.ok) {
    throw new Error(data?.error || `AI сервері ${response.status} қатесін қайтарды.`);
  }
  if (!data?.analysis) {
    throw new Error("AI карточка үшін құрылымдалған жауап қайтармады.");
  }

  return data.analysis;
}
