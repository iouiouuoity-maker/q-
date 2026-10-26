const MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";

// Міндетті қадам: GitHub Pages сайтыңыздың нақты origin мекенжайына ауыстырыңыз.
// Мысалы: https://username.github.io
const ALLOWED_ORIGIN = "https://YOUR_GITHUB_USERNAME.github.io";

const MAX_MESSAGE_CHARS = 2400;
const MAX_HISTORY_ITEMS = 8;
const MAX_HISTORY_ITEM_CHARS = 1600;
const MAX_REQUEST_BYTES = 20_000;
const MAX_EXCERPT_CHARS = 5000;
const VALID_FEAR_IDS = new Set(["loss", "death", "change", "judgment", "failure", "loneliness"]);

const SYSTEM_PROMPT = `
Ты — FearMap AI, внимательный учебный помощник по русской, казахской и мировой литературе для школьников 5–8 классов. Ты умеешь работать с любым произведением и сравнивать любых персонажей. Твоя цель — помогать анализировать мотивы, страхи, конфликты и выбор героев, а не подменять чтение готовым пересказом.

Главный метод FearMap — «4 следа страха»:
1) событие — что произошло;
2) страх — чего мог бояться герой;
3) поступок — что он сделал;
4) последствие — к чему это привело.

Базовые герои проекта:
- Герда, «Снежная королева»: возможный страх потерять Кая; действует ради дружбы и спасает его.
- Пётр Гринёв, «Капитанская дочка»: сталкивается с угрозой смерти и потерей близких; сохраняет верность присяге и совести.
- Беликов, «Человек в футляре»: боится перемен, нарушения правил и осуждения; избегает нового и замыкается.
- Маленький принц: переживает из-за разлуки с Розой и возможной потери близкого; осознаёт ответственность и ценность заботы.
- Август Пулман, «Чудо»: боится насмешек и отвержения; постепенно находит друзей и принимает себя.

Правила ответа:
- Отвечай на языке вопроса пользователя; если язык неясен, отвечай по-русски.
- Различай «факт текста», «интерпретацию» и «доказательство».
- Не выдумывай цитаты, страницы, эпизоды или авторские формулировки. Если точная цитата не дана, честно скажи, что её нужно проверить по первоисточнику.
- Если пользователь прислал фрагмент, сначала опирайся на него. Для нового произведения при необходимости попроси короткий отрывок.
- Помогай вопросами и подсказками. Не выдавай спорную интерпретацию за единственно верную.
- Для анализа героя по возможности используй структуру: Событие → Возможный страх → Поступок → Последствие → Доказательство.
- Пиши понятно, доброжелательно и компактно. Не используй опасные или унижающие формулировки.
`.trim();

const CARD_SYSTEM_PROMPT = `
Ты создаёшь черновик карточки литературного героя для учебного приложения FearMap. Проанализируй только указанное произведение и героя. Если дан фрагмент, опирайся прежде всего на него. Если текста недостаточно или произведение тебе неизвестно, не выдумывай факты: прямо укажи в поле evidence, что вывод нужно проверить по первоисточнику.

Верни ТОЛЬКО валидный JSON без Markdown и без пояснений вокруг него:
{
  "era": "эпоха или век",
  "genre": "жанр",
  "fears": ["loss"],
  "event": "конкретное событие",
  "fear": "возможный страх героя",
  "action": "поступок героя",
  "consequence": "последствие поступка",
  "evidence": "деталь или эпизод; не выдумывай точную цитату",
  "insight": "краткий вывод о связи страха и выбора"
}

Для fears используй один или несколько идентификаторов только из списка:
loss — потеря; death — смерть или физическая опасность; change — перемены; judgment — осуждение; failure — неудача; loneliness — одиночество.
Все текстовые поля заполняй по-русски, кратко и понятно для школьника. Страх формулируй как интерпретацию, а не доказанный автором диагноз.
`.trim();

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function jsonResponse(data, status, origin = null) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };

  if (origin) Object.assign(headers, corsHeaders(origin));
  return new Response(JSON.stringify(data), { status, headers });
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .slice(-MAX_HISTORY_ITEMS)
    .filter((item) => item && ["user", "assistant"].includes(item.role))
    .map((item) => ({
      role: item.role,
      content: String(item.content ?? "").trim().slice(0, MAX_HISTORY_ITEM_CHARS),
    }))
    .filter((item) => item.content.length > 0);
}

function extractModelText(result) {
  return result?.response
    ?? result?.choices?.[0]?.message?.content
    ?? result?.result?.response
    ?? "";
}

function parseModelJson(text) {
  const cleaned = String(text).replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("No JSON object in model response");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

function sanitizeAnalysis(value) {
  const text = (field, max = 700) => String(value?.[field] ?? "").trim().slice(0, max);
  const fears = Array.isArray(value?.fears)
    ? [...new Set(value.fears.map((item) => String(item).trim()).filter((item) => VALID_FEAR_IDS.has(item)))].slice(0, 3)
    : [];

  return {
    era: text("era", 60) || "Эпоха не указана",
    genre: text("genre", 100) || "Жанр не указан",
    fears: fears.length ? fears : ["loneliness"],
    event: text("event", 500),
    fear: text("fear", 500),
    action: text("action", 500),
    consequence: text("consequence", 500),
    evidence: text("evidence", 700),
    insight: text("insight", 240),
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const browserOriginAllowed = origin === ALLOWED_ORIGIN;
    const directRequest = !origin;

    if (request.method === "OPTIONS") {
      if (!browserOriginAllowed) {
        return jsonResponse({ error: "Origin рұқсат етілмеген." }, 403);
      }
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      return jsonResponse({ status: "ok", model: MODEL }, 200, browserOriginAllowed ? origin : null);
    }

    const isApiPost = request.method === "POST" && ["/api/chat", "/api/analyze"].includes(url.pathname);
    if (!isApiPost) {
      return jsonResponse({ error: "Маршрут табылмады." }, 404, browserOriginAllowed ? origin : null);
    }

    if (!browserOriginAllowed && !directRequest) {
      return jsonResponse({ error: "Бұл доменге сұрау жіберуге рұқсат жоқ." }, 403);
    }

    if (!env.AI) {
      return jsonResponse({ error: "AI binding табылмады. Wrangler конфигурациясын тексеріңіз." }, 500, browserOriginAllowed ? origin : null);
    }

    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > MAX_REQUEST_BYTES) {
      return jsonResponse({ error: "Сұрау тым үлкен." }, 413, browserOriginAllowed ? origin : null);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "JSON пішімі дұрыс емес." }, 400, browserOriginAllowed ? origin : null);
    }

    if (url.pathname === "/api/analyze") {
      const work = String(body?.work ?? "").trim().slice(0, 120);
      const author = String(body?.author ?? "").trim().slice(0, 120);
      const character = String(body?.character ?? "").trim().slice(0, 100);
      const excerpt = String(body?.excerpt ?? "").trim();

      if (!work || !character) {
        return jsonResponse({ error: "Шығарма мен кейіпкер атауын енгізіңіз." }, 400, browserOriginAllowed ? origin : null);
      }
      if (excerpt.length > MAX_EXCERPT_CHARS) {
        return jsonResponse({ error: `Мәтін үзіндісі ${MAX_EXCERPT_CHARS} таңбадан аспауы тиіс.` }, 413, browserOriginAllowed ? origin : null);
      }

      const userPrompt = [
        `Произведение: ${work}`,
        `Автор: ${author || "не указан"}`,
        `Герой: ${character}`,
        excerpt ? `Фрагмент для анализа:\n${excerpt}` : "Фрагмент не дан. Не выдумывай цитаты и отметь необходимость проверки по первоисточнику.",
      ].join("\n");

      try {
        const result = await env.AI.run(MODEL, {
          messages: [
            { role: "system", content: CARD_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          stream: false,
          max_tokens: 850,
          temperature: 0.25,
          top_p: 0.85,
        });
        const analysis = sanitizeAnalysis(parseModelJson(extractModelText(result)));
        return jsonResponse({ analysis }, 200, browserOriginAllowed ? origin : null);
      } catch (error) {
        console.error("Workers AI card analysis error", error);
        const status = error?.status === 429 ? 429 : 502;
        const errorMessage = status === 429
          ? "AI лимиті уақытша аяқталды. Кейінірек қайталап көріңіз."
          : "AI карточка черновигін құра алмады. Деректерді қолмен толтырыңыз немесе қайта көріңіз.";
        return jsonResponse({ error: errorMessage }, status, browserOriginAllowed ? origin : null);
      }
    }

    const message = String(body?.message ?? "").trim();
    if (!message) {
      return jsonResponse({ error: "Сұрақ бос болмауы тиіс." }, 400, browserOriginAllowed ? origin : null);
    }
    if (message.length > MAX_MESSAGE_CHARS) {
      return jsonResponse(
        { error: `Сұрақ ${MAX_MESSAGE_CHARS} таңбадан аспауы тиіс.` },
        413,
        browserOriginAllowed ? origin : null,
      );
    }

    const history = normalizeHistory(body?.history);
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: message },
    ];

    try {
      const stream = await env.AI.run(MODEL, {
        messages,
        stream: true,
        max_tokens: 700,
        temperature: 0.45,
        top_p: 0.9,
      });

      const headers = {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-store",
        "X-Content-Type-Options": "nosniff",
      };
      if (browserOriginAllowed) Object.assign(headers, corsHeaders(origin));

      return new Response(stream, { status: 200, headers });
    } catch (error) {
      console.error("Workers AI error", error);
      const status = error?.status === 429 ? 429 : 502;
      const errorMessage = status === 429
        ? "AI лимиті уақытша аяқталды. Кейінірек қайталап көріңіз."
        : "AI жауабын алу мүмкін болмады. Кейінірек қайталап көріңіз.";
      return jsonResponse({ error: errorMessage }, status, browserOriginAllowed ? origin : null);
    }
  },
};
