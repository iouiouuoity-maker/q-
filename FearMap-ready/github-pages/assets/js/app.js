import { characters as starterCharacters, detectiveQuestions, fearCategories } from "./data.js";
import { analyzeLiteraryCharacter, isAIConfigured, MAX_INPUT_LENGTH, streamAIResponse } from "./ai.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const PAGE = document.body.dataset.page || "home";
const PROGRESS_KEY = "fearmap-progress-v1";
const CUSTOM_LIBRARY_KEY = "fearmap-custom-library-v1";
const VALID_FEAR_IDS = new Set(fearCategories.filter((item) => item.id !== "all").map((item) => item.id));

const FEAR_PALETTES = {
  loss: { accent: "#e35f48", tone: "#ffe2db" },
  death: { accent: "#35758c", tone: "#dceef4" },
  change: { accent: "#b67a1e", tone: "#ffedc8" },
  judgment: { accent: "#7457a6", tone: "#eadffc" },
  failure: { accent: "#a94f75", tone: "#f7dfeb" },
  loneliness: { accent: "#4f8771", tone: "#dcefe5" },
};

const NAV_ITEMS = [
  ["home", "Главная", "index.html"],
  ["library", "Библиотека", "library.html"],
  ["map", "Карта", "map.html"],
  ["compare", "Сравнение", "compare.html"],
  ["add", "Добавить", "add-work.html"],
  ["ai", "AI-анализ", "ai.html"],
  ["detective", "Детектив", "detective.html"],
  ["progress", "Прогресс", "progress.html"],
];

const makeDefaultProgress = () => ({
  points: 0,
  viewedHeroes: [],
  comparisons: 0,
  detectiveCorrect: 0,
  detectiveFinished: false,
  aiMessages: 0,
});

let progress = loadProgress();
let library = [
  ...starterCharacters.map((hero) => ({ ...hero, builtIn: true, custom: false })),
  ...loadCustomHeroes(),
];
let activeFear = "all";
let quizIndex = 0;
let quizScore = 0;
let quizLocked = false;
let chatHistory = [];
let activeRequest = null;
let workAnalysisRequest = null;

function cleanText(value, max = 700) {
  return String(value ?? "").trim().slice(0, max);
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function makeShort(name) {
  const words = cleanText(name, 100).split(/\s+/).filter(Boolean);
  return words.length ? words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") : "?";
}

function paletteFor(fears) {
  return FEAR_PALETTES[fears[0]] ?? FEAR_PALETTES.loneliness;
}

function fearById(id) {
  return fearCategories.find((fear) => fear.id === id);
}

function normalizeStoredHero(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = cleanText(raw.id, 80);
  const name = cleanText(raw.name, 100);
  const work = cleanText(raw.work, 120);
  const fears = Array.isArray(raw.fears)
    ? [...new Set(raw.fears.map(String).filter((fear) => VALID_FEAR_IDS.has(fear)))].slice(0, 3)
    : [];
  if (!/^custom-[a-z0-9-]+$/i.test(id) || !name || !work || !fears.length) return null;
  const palette = paletteFor(fears);
  return {
    id,
    name,
    short: makeShort(name),
    work,
    author: cleanText(raw.author, 120) || "Автор не указан",
    era: cleanText(raw.era, 60) || "Эпоха не указана",
    genre: cleanText(raw.genre, 100) || "Жанр не указан",
    fears,
    event: cleanText(raw.event, 500),
    fear: cleanText(raw.fear, 500),
    action: cleanText(raw.action, 500),
    consequence: cleanText(raw.consequence, 500),
    evidence: cleanText(raw.evidence, 700),
    insight: cleanText(raw.insight, 240),
    accent: palette.accent,
    tone: palette.tone,
    custom: true,
    builtIn: false,
  };
}

function loadCustomHeroes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_LIBRARY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeStoredHero).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveCustomHeroes() {
  localStorage.setItem(CUSTOM_LIBRARY_KEY, JSON.stringify(library.filter((hero) => hero.custom)));
}

function loadProgress() {
  try {
    return { ...makeDefaultProgress(), ...JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}") };
  } catch {
    return makeDefaultProgress();
  }
}

function saveProgress() {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  renderProgress();
}

function addPoints(amount, message) {
  progress.points += amount;
  saveProgress();
  if (message) showToast(`+${amount} · ${message}`);
}

function showToast(message) {
  const toast = $("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

function renderChrome() {
  const header = $("#site-header");
  const footer = $("#site-footer");
  if (header) {
    header.className = "site-header";
    header.innerHTML = `
      <a class="brand" href="index.html" aria-label="FearMap, на главную"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>FearMap</span></a>
      <nav class="site-nav site-nav--pages" id="site-nav" aria-label="Основная навигация">
        ${NAV_ITEMS.map(([id, label, href]) => `<a class="${id === PAGE ? "is-current" : ""}" href="${href}" ${id === PAGE ? 'aria-current="page"' : ""}>${label}</a>`).join("")}
      </nav>
      <a class="header-action" href="add-work.html">Новая книга <span aria-hidden="true">＋</span></a>
      <button class="menu-toggle" id="menu-toggle" type="button" aria-label="Открыть меню" aria-expanded="false"><span></span><span></span></button>
    `;
    const toggle = $("#menu-toggle");
    const nav = $("#site-nav");
    toggle?.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }
  if (footer) {
    footer.className = "site-footer";
    footer.innerHTML = `<div><a class="brand brand--footer" href="index.html"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>FearMap</span></a><p>Многостраничная карта литературных героев</p></div><p>${library.length} героев · единая библиотека · 2026</p><a href="add-work.html">Добавить книгу ↑</a>`;
  }
}

function heroCardMarkup(hero) {
  return `
    <article class="hero-card ${hero.custom ? "hero-card--custom" : ""}" style="--hero-accent:${hero.accent};--hero-tone:${hero.tone}">
      <div class="hero-card__top"><div class="hero-avatar" aria-hidden="true">${escapeHTML(hero.short)}</div><div class="hero-card__labels">${hero.custom ? '<span class="custom-pill">Моя книга</span>' : ""}<span class="era-pill">${escapeHTML(hero.era)}</span></div></div>
      <p class="eyebrow">${escapeHTML(hero.author)}</p><h3>${escapeHTML(hero.name)}</h3><p class="work-title">«${escapeHTML(hero.work)}»</p>
      <div class="fear-tags">${hero.fears.map((id) => `<span>${escapeHTML(fearById(id)?.label ?? id)}</span>`).join("")}</div>
      <p class="hero-card__insight">${escapeHTML(hero.insight)}</p><button class="text-button" data-open-hero="${escapeHTML(hero.id)}" type="button">Разобрать героя <span aria-hidden="true">↗</span></button>
    </article>
  `;
}

function traceMarkup(hero) {
  return [
    ["01", "Событие", hero.event],
    ["02", "Страх", hero.fear],
    ["03", "Поступок", hero.action],
    ["04", "Последствие", hero.consequence],
  ].map(([number, title, text]) => `<article class="trace-card"><span class="trace-number">${number}</span><div><h3>${title}</h3><p>${escapeHTML(text)}</p></div></article>`).join("");
}

function ensureHeroDialog() {
  if ($("#hero-dialog")) return;
  document.body.insertAdjacentHTML("beforeend", `<dialog class="hero-dialog" id="hero-dialog"><button class="dialog-close" id="hero-dialog-close" type="button" aria-label="Закрыть">×</button><div id="dialog-content"></div></dialog>`);
  $("#hero-dialog-close").addEventListener("click", () => $("#hero-dialog").close());
  $("#hero-dialog").addEventListener("click", (event) => { if (event.target === $("#hero-dialog")) $("#hero-dialog").close(); });
}

function bindHeroButtons(root = document) {
  $$('[data-open-hero]', root).forEach((button) => button.addEventListener("click", () => openHero(button.dataset.openHero)));
}

function openHero(id) {
  const hero = library.find((item) => item.id === id);
  if (!hero) return;
  ensureHeroDialog();
  $("#dialog-content").innerHTML = `
    <div class="dialog-hero" style="--hero-accent:${hero.accent};--hero-tone:${hero.tone}"><div class="hero-avatar hero-avatar--large" aria-hidden="true">${escapeHTML(hero.short)}</div><div><p class="eyebrow">${escapeHTML(hero.era)} · ${escapeHTML(hero.genre)}</p><h2>${escapeHTML(hero.name)}</h2><p>${escapeHTML(hero.author)}, «${escapeHTML(hero.work)}»</p></div></div>
    <div class="dialog-traces">${traceMarkup(hero)}</div><div class="evidence-box"><span>Доказательство</span><p>${escapeHTML(hero.evidence)}</p></div>
    <p class="dialog-note"><strong>Важно:</strong> страх героя — интерпретация. Её нужно проверять по тексту, а точные цитаты — по первоисточнику.</p>
    ${hero.custom ? `<button class="delete-hero" data-delete-hero="${escapeHTML(hero.id)}" type="button">Удалить мою карточку</button>` : ""}
  `;
  $("#hero-dialog").showModal();
  const deleteButton = $("[data-delete-hero]", $("#hero-dialog"));
  deleteButton?.addEventListener("click", () => deleteCustomHero(deleteButton.dataset.deleteHero));
  if (!progress.viewedHeroes.includes(hero.id)) {
    progress.viewedHeroes.push(hero.id);
    addPoints(10, "Новый герой исследован");
  }
}

function deleteCustomHero(id) {
  const hero = library.find((item) => item.id === id && item.custom);
  if (!hero || !window.confirm(`Удалить карточку «${hero.name}» из вашей библиотеки?`)) return;
  library = library.filter((item) => item.id !== id);
  progress.viewedHeroes = progress.viewedHeroes.filter((heroId) => heroId !== id);
  saveCustomHeroes();
  saveProgress();
  $("#hero-dialog")?.close();
  refreshCurrentPage();
  renderChrome();
  showToast("Карточка удалена");
}

function renderFearFilters(onChange) {
  const container = $("#fear-filters");
  if (!container) return;
  container.innerHTML = fearCategories.map((fear) => `<button class="filter-chip ${fear.id === activeFear ? "is-active" : ""}" data-fear="${fear.id}" type="button"><span aria-hidden="true">${fear.icon}</span>${escapeHTML(fear.label)}</button>`).join("");
  $$('[data-fear]', container).forEach((button) => button.addEventListener("click", () => {
    activeFear = button.dataset.fear;
    renderFearFilters(onChange);
    onChange();
  }));
}

function visibleHeroes() {
  return activeFear === "all" ? library : library.filter((hero) => hero.fears.includes(activeFear));
}

function renderHome() {
  const count = $("#home-work-count");
  if (count) count.textContent = library.length;
  const preview = $("#home-hero-preview");
  if (!preview) return;
  const candidates = [...library.filter((hero) => hero.custom).slice(-1), ...library.filter((hero) => !hero.custom)].slice(0, 3);
  preview.innerHTML = candidates.map(heroCardMarkup).join("");
  bindHeroButtons(preview);
}

function renderLibraryPage() {
  const grid = $("#hero-grid");
  if (!grid) return;
  const visible = visibleHeroes();
  grid.innerHTML = visible.length ? visible.map(heroCardMarkup).join("") : `<div class="empty-library"><span>○</span><h3>В этой категории пока нет героев</h3><p>Добавьте произведение или выберите другой страх.</p><a class="primary-button" href="add-work.html">Добавить героя</a></div>`;
  const count = $("#library-count");
  if (count) count.textContent = library.length;
  bindHeroButtons(grid);
}

function renderMapPage() {
  const atlas = $("#fear-atlas");
  if (!atlas) return;
  const categories = fearCategories.filter((fear) => fear.id !== "all" && (activeFear === "all" || fear.id === activeFear));
  atlas.innerHTML = `<div class="atlas-core"><span>FEAR</span><strong>MAP</strong><small>${library.length} героев</small></div><div class="atlas-zones">${categories.map((fear) => {
    const heroes = library.filter((hero) => hero.fears.includes(fear.id));
    return `<article class="atlas-zone" style="--zone-color:${fear.color}"><header><span>${fear.icon}</span><div><h3>${escapeHTML(fear.label)}</h3><small>${heroes.length} ${heroes.length === 1 ? "герой" : "героев"}</small></div></header><div class="atlas-heroes">${heroes.length ? heroes.map((hero) => `<button type="button" data-open-hero="${escapeHTML(hero.id)}" style="--hero-accent:${hero.accent};--hero-tone:${hero.tone}"><span class="hero-avatar">${escapeHTML(hero.short)}</span><span><b>${escapeHTML(hero.name)}</b><small>«${escapeHTML(hero.work)}»</small></span></button>`).join("") : "<p>Пока пусто</p>"}</div></article>`;
  }).join("")}</div>`;
  bindHeroButtons(atlas);
}

function renderComparePage() {
  const selectA = $("#compare-a");
  const selectB = $("#compare-b");
  if (!selectA || !selectB) return;
  const previousA = selectA.value;
  const previousB = selectB.value;
  const options = library.map((hero) => `<option value="${escapeHTML(hero.id)}">${escapeHTML(hero.name)} · «${escapeHTML(hero.work)}»</option>`).join("");
  selectA.innerHTML = options;
  selectB.innerHTML = options;
  selectA.value = library.some((hero) => hero.id === previousA) ? previousA : library[0]?.id ?? "";
  selectB.value = library.some((hero) => hero.id === previousB) ? previousB : library[Math.min(4, library.length - 1)]?.id ?? selectA.value;
  $("#compare-button").disabled = library.length < 2;
  renderComparison();
}

function renderComparison() {
  const first = library.find((hero) => hero.id === $("#compare-a")?.value) ?? library[0];
  const second = library.find((hero) => hero.id === $("#compare-b")?.value) ?? library[1] ?? first;
  const result = $("#compare-result");
  if (!first || !second || !result) return;
  const commonIds = first.fears.filter((fear) => second.fears.includes(fear));
  const common = commonIds.length ? commonIds.map((id) => fearById(id)?.label.toLowerCase()).join(", ") : "прямого совпадения категорий нет";
  result.innerHTML = `<div class="compare-person" style="--hero-accent:${first.accent};--hero-tone:${first.tone}"><div class="hero-avatar">${escapeHTML(first.short)}</div><div><span>${escapeHTML(first.era)}</span><h3>${escapeHTML(first.name)}</h3><p>${escapeHTML(first.action)}</p></div></div><div class="compare-axis" aria-hidden="true"><span></span><b>VS</b><span></span></div><div class="compare-person" style="--hero-accent:${second.accent};--hero-tone:${second.tone}"><div class="hero-avatar">${escapeHTML(second.short)}</div><div><span>${escapeHTML(second.era)}</span><h3>${escapeHTML(second.name)}</h3><p>${escapeHTML(second.action)}</p></div></div><div class="compare-conclusion"><span>Вывод</span><p><strong>Общее:</strong> ${escapeHTML(common)}. <strong>Различие:</strong> ${escapeHTML(first.name)} — ${escapeHTML(first.insight.toLowerCase())} ${escapeHTML(second.name)} — ${escapeHTML(second.insight.toLowerCase())}</p></div>`;
}

function resetWorkForm() {
  $("#work-form")?.reset();
  const status = $("#work-ai-status");
  if (status) { status.textContent = ""; status.className = "form-status"; }
}

function setWorkField(id, value) {
  const field = $(id);
  if (field && value) field.value = cleanText(value, Number(field.maxLength) > 0 ? Number(field.maxLength) : 700);
}

function applyAIAnalysis(analysis) {
  setWorkField("#work-era", analysis.era); setWorkField("#work-genre", analysis.genre); setWorkField("#work-event", analysis.event);
  setWorkField("#work-fear-text", analysis.fear); setWorkField("#work-action", analysis.action); setWorkField("#work-consequence", analysis.consequence);
  setWorkField("#work-evidence", analysis.evidence); setWorkField("#work-insight", analysis.insight);
  $$('.work-form input[name="work-fear"]').forEach((checkbox) => { checkbox.checked = analysis.fears?.includes(checkbox.value) ?? false; });
}

async function handleAIWorkDraft() {
  if (workAnalysisRequest) return;
  const work = cleanText($("#work-title").value, 120);
  const character = cleanText($("#work-hero").value, 100);
  const status = $("#work-ai-status");
  if (!work || !character) {
    status.textContent = "Сначала укажите произведение и героя.";
    status.className = "form-status has-error";
    return;
  }
  const button = $("#analyze-work-ai");
  const controller = new AbortController();
  workAnalysisRequest = controller;
  button.disabled = true;
  button.innerHTML = 'AI анализирует <span class="typing"><i></i><i></i><i></i></span>';
  status.textContent = "Создаём черновик. Он не заменяет проверку по книге.";
  status.className = "form-status";
  try {
    const analysis = await analyzeLiteraryCharacter({ work, author: cleanText($("#work-author").value, 120), character, excerpt: cleanText($("#work-excerpt").value, 5000), signal: controller.signal });
    applyAIAnalysis(analysis);
    status.textContent = "AI-черновик готов. Проверьте факты и сохраните карточку.";
    status.className = "form-status is-success";
  } catch (error) {
    status.textContent = error.message;
    status.className = "form-status has-error";
  } finally {
    workAnalysisRequest = null;
    button.disabled = false;
    button.innerHTML = "Создать AI-черновик <span>✦</span>";
  }
}

function handleWorkSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const fears = $$('input[name="work-fear"]:checked').map((input) => input.value);
  const status = $("#work-ai-status");
  if (!fears.length) {
    status.textContent = "Выберите хотя бы один вид страха.";
    status.className = "form-status has-error";
    return;
  }
  const hero = normalizeStoredHero({
    id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: cleanText($("#work-hero").value, 100), work: cleanText($("#work-title").value, 120), author: cleanText($("#work-author").value, 120),
    era: cleanText($("#work-era").value, 60), genre: cleanText($("#work-genre").value, 100), fears,
    event: cleanText($("#work-event").value, 500), fear: cleanText($("#work-fear-text").value, 500), action: cleanText($("#work-action").value, 500),
    consequence: cleanText($("#work-consequence").value, 500), evidence: cleanText($("#work-evidence").value, 700), insight: cleanText($("#work-insight").value, 240),
  });
  if (!hero) return;
  library.push(hero);
  saveCustomHeroes();
  addPoints(25, "Произведение добавлено");
  status.textContent = "Карточка сохранена. Открываем библиотеку…";
  status.className = "form-status is-success";
  window.setTimeout(() => window.location.assign(`library.html?added=${encodeURIComponent(hero.id)}`), 450);
}

function setupAddPage() {
  $("#work-form")?.addEventListener("submit", handleWorkSubmit);
  $("#work-form-reset")?.addEventListener("click", resetWorkForm);
  $("#analyze-work-ai")?.addEventListener("click", handleAIWorkDraft);
}

function formatAIText(value) {
  return escapeHTML(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/^#{1,3}\s+(.+)$/gm, "<strong>$1</strong>").replace(/\n/g, "<br>");
}

function appendMessage(role, text = "") {
  const log = $("#chat-log");
  if (!log) return null;
  const message = document.createElement("article");
  message.className = `chat-message chat-message--${role}`;
  message.innerHTML = `<div class="chat-message__avatar" aria-hidden="true">${role === "assistant" ? "AI" : "Вы"}</div><div class="chat-message__bubble"></div>`;
  const bubble = $(".chat-message__bubble", message);
  bubble.innerHTML = formatAIText(text);
  log.append(message);
  log.scrollTop = log.scrollHeight;
  return bubble;
}

function setChatBusy(isBusy) {
  const send = $("#chat-send");
  const input = $("#chat-input");
  const status = $("#chat-status");
  if (!send || !input || !status) return;
  send.disabled = isBusy; input.disabled = isBusy;
  status.textContent = isBusy ? "AI анализирует…" : isAIConfigured() ? "AI готов" : "Требуется URL Worker";
  status.classList.toggle("is-live", !isBusy && isAIConfigured());
}

function updateCharCount() {
  const input = $("#chat-input");
  const count = $("#char-count");
  if (input && count) count.textContent = `${input.value.length} / ${MAX_INPUT_LENGTH}`;
}

async function sendChatMessage(prefilled = null) {
  const input = $("#chat-input");
  const message = String(prefilled ?? input.value).trim();
  if (!message || activeRequest) return;
  if (message.length > MAX_INPUT_LENGTH) return showToast(`Максимум ${MAX_INPUT_LENGTH} символов`);
  input.value = ""; updateCharCount();
  const previousHistory = chatHistory.slice(-8);
  chatHistory.push({ role: "user", content: message });
  appendMessage("user", message);
  const bubble = appendMessage("assistant", "");
  bubble.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  setChatBusy(true);
  const controller = new AbortController();
  activeRequest = controller;
  let answer = "";
  try {
    await streamAIResponse({ message, history: previousHistory, signal: controller.signal, onChunk(chunk) { answer += chunk; bubble.innerHTML = formatAIText(answer); $("#chat-log").scrollTop = $("#chat-log").scrollHeight; } });
    if (!answer) answer = "Ответ получен без текста. Попробуйте сформулировать вопрос иначе.";
    bubble.innerHTML = formatAIText(answer);
    chatHistory.push({ role: "assistant", content: answer });
    progress.aiMessages += 1;
    if (progress.aiMessages === 1) addPoints(20, "Первый AI-анализ выполнен"); else saveProgress();
  } catch (error) {
    bubble.innerHTML = `<strong>Не удалось получить ответ.</strong><br>${escapeHTML(error.message)}`;
    bubble.closest(".chat-message").classList.add("has-error");
  } finally {
    activeRequest = null; setChatBusy(false);
  }
}

function setupAIPage() {
  $("#chat-form")?.addEventListener("submit", (event) => { event.preventDefault(); sendChatMessage(); });
  $("#chat-input")?.addEventListener("input", updateCharCount);
  $("#chat-input")?.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendChatMessage(); } });
  $$('[data-prompt]').forEach((button) => button.addEventListener("click", () => sendChatMessage(button.dataset.prompt)));
  setChatBusy(false); updateCharCount();
  appendMessage("assistant", "Здравствуйте! Назовите любое произведение и героя или вставьте небольшой фрагмент. Я помогу построить четыре следа страха и отделить факт от интерпретации.");
}

function renderQuiz() {
  const question = detectiveQuestions[quizIndex];
  if (!question || !$("#quiz-panel")) return;
  quizLocked = false;
  $("#quiz-progress").style.width = `${((quizIndex + 1) / detectiveQuestions.length) * 100}%`;
  $("#quiz-count").textContent = `${String(quizIndex + 1).padStart(2, "0")} / ${String(detectiveQuestions.length).padStart(2, "0")}`;
  $("#quiz-clue").textContent = question.clue;
  $("#quiz-question").textContent = question.question;
  $("#quiz-answers").innerHTML = question.answers.map((answer, index) => `<button type="button" data-answer="${index}">${escapeHTML(answer.text)}<span>→</span></button>`).join("");
  $("#quiz-feedback").innerHTML = "";
  $("#quiz-next").hidden = true;
  $$('[data-answer]').forEach((button) => button.addEventListener("click", () => answerQuiz(Number(button.dataset.answer))));
}

function answerQuiz(answerIndex) {
  if (quizLocked) return;
  quizLocked = true;
  const question = detectiveQuestions[quizIndex];
  const correct = question.answers[answerIndex].correct;
  if (correct) quizScore += 1;
  $$('[data-answer]').forEach((button, index) => { button.disabled = true; if (question.answers[index].correct) button.classList.add("is-correct"); if (index === answerIndex && !correct) button.classList.add("is-wrong"); });
  $("#quiz-feedback").innerHTML = `<strong>${correct ? "Верно." : "Почти."}</strong> ${escapeHTML(question.explanation)}`;
  $("#quiz-next").hidden = false;
  $("#quiz-next").textContent = quizIndex === detectiveQuestions.length - 1 ? "Узнать результат" : "Следующая улика";
}

function nextQuiz() {
  if (quizIndex < detectiveQuestions.length - 1) { quizIndex += 1; renderQuiz(); return; }
  progress.detectiveCorrect = Math.max(progress.detectiveCorrect, quizScore);
  if (!progress.detectiveFinished) { progress.detectiveFinished = true; addPoints(quizScore * 12, "Дело закрыто"); } else saveProgress();
  $("#quiz-panel").innerHTML = `<div class="quiz-result"><span class="quiz-result__score">${quizScore}/${detectiveQuestions.length}</span><p class="eyebrow">Расследование завершено</p><h3>${quizScore >= 4 ? "Точный читатель" : "Хорошее начало"}</h3><p>${quizScore >= 4 ? "Вы уверенно отделяете факт от интерпретации и замечаете связь между страхом и поступком." : "Откройте библиотеку, пересмотрите карточки и попробуйте ещё раз."}</p><div class="result-actions"><button class="primary-button" id="quiz-restart" type="button">Пройти ещё раз</button><a class="outline-button" href="progress.html">Мой прогресс</a></div></div>`;
  $("#quiz-restart").addEventListener("click", restartQuiz);
}

function restartQuiz() {
  quizIndex = 0; quizScore = 0;
  $("#quiz-panel").innerHTML = `<div class="quiz-panel__top"><span id="quiz-count">01 / 05</span><div class="quiz-track"><i id="quiz-progress"></i></div></div><p class="quiz-clue" id="quiz-clue"></p><h3 id="quiz-question"></h3><div class="quiz-answers" id="quiz-answers"></div><div class="quiz-feedback" id="quiz-feedback" aria-live="polite"></div><button class="secondary-button quiz-next" id="quiz-next" type="button" hidden>Следующая улика</button>`;
  $("#quiz-next").addEventListener("click", nextQuiz); renderQuiz();
}

function setupDetectivePage() {
  $("#quiz-next")?.addEventListener("click", nextQuiz);
  renderQuiz();
}

function renderProgress() {
  if (!$("#points-value")) return;
  const maxPoints = Math.max(250, 150 + library.length * 20);
  const percent = Math.min(100, Math.round((progress.points / maxPoints) * 100));
  const viewed = progress.viewedHeroes.filter((id) => library.some((hero) => hero.id === id));
  $("#points-value").textContent = progress.points;
  $("#progress-fill").style.width = `${percent}%`;
  $("#progress-percent").textContent = `${percent}%`;
  $("#stat-heroes").textContent = `${viewed.length}/${library.length}`;
  $("#stat-comparisons").textContent = progress.comparisons;
  $("#stat-detective").textContent = progress.detectiveFinished ? `${progress.detectiveCorrect}/5` : "—";
  const badges = [
    ["Внимательный читатель", "Откройте 3 карточки героев", viewed.length >= 3, "◇"],
    ["Исследователь связей", "Сравните двух персонажей", progress.comparisons >= 1, "↔"],
    ["Литературный детектив", "Завершите расследование", progress.detectiveFinished, "⌁"],
    ["Проверяю гипотезу", "Задайте вопрос FearMap AI", progress.aiMessages >= 1, "✦"],
  ];
  $("#badge-grid").innerHTML = badges.map(([title, desc, unlocked, icon]) => `<article class="badge-card ${unlocked ? "is-unlocked" : ""}"><span>${icon}</span><div><h3>${title}</h3><p>${desc}</p></div><b>${unlocked ? "Открыто" : "Закрыто"}</b></article>`).join("");
}

function setupProgressPage() {
  renderProgress();
  $("#reset-progress")?.addEventListener("click", () => { progress = makeDefaultProgress(); saveProgress(); showToast("Прогресс сброшен. Библиотека сохранена."); });
}

function setupReveal() {
  const items = $$(".reveal");
  if (!("IntersectionObserver" in window)) { items.forEach((item) => item.classList.add("is-revealed")); return; }
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) entry.target.classList.add("is-revealed"); }), { threshold: 0.1 });
  items.forEach((item) => observer.observe(item));
}

function refreshCurrentPage() {
  if (PAGE === "home") renderHome();
  if (PAGE === "library") renderLibraryPage();
  if (PAGE === "map") renderMapPage();
  if (PAGE === "compare") renderComparePage();
  if (PAGE === "progress") renderProgress();
}

function init() {
  renderChrome();
  setupReveal();
  if (["home", "library", "map"].includes(PAGE)) ensureHeroDialog();
  if (PAGE === "home") renderHome();
  if (PAGE === "library") {
    renderFearFilters(renderLibraryPage);
    renderLibraryPage();
    const addedId = new URLSearchParams(window.location.search).get("added");
    if (addedId && library.some((hero) => hero.id === addedId)) window.setTimeout(() => openHero(addedId), 80);
  }
  if (PAGE === "map") { renderFearFilters(renderMapPage); renderMapPage(); }
  if (PAGE === "compare") {
    renderComparePage();
    $("#compare-button")?.addEventListener("click", () => { renderComparison(); progress.comparisons += 1; addPoints(15, "Сравнение завершено"); });
    $("#compare-a")?.addEventListener("change", renderComparison);
    $("#compare-b")?.addEventListener("change", renderComparison);
  }
  if (PAGE === "add") setupAddPage();
  if (PAGE === "ai") setupAIPage();
  if (PAGE === "detective") setupDetectivePage();
  if (PAGE === "progress") setupProgressPage();
}

try {
  init();
} catch (error) {
  console.error("FearMap initialization error", error);
  showToast(`Ошибка интерфейса: ${error.message}`);
}
