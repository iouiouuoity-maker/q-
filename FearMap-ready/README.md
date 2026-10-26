# FearMap дайын жоба

Бұл пакет екі бөлек жобадан тұрады:

- `cloudflare-worker` — жаңа жобаға ғана арналған Cloudflare Worker және Workers AI binding.
- `github-pages` — GitHub Pages-та тікелей жұмыс істейтін статикалық сайт.

Сайт әдеби кейіпкерлердің қорқынышын **оқиға → қорқыныш → әрекет → салдар** әдісімен зерттейді. Бұл — сегіз жеке беттен тұратын толық көпбеттік қосымша. Бес дайын карточка тек мысал ретінде берілген: пайдаланушы кез келген шығарма мен кейіпкерді қолмен немесе AI көмегімен қосып, оны байланыстар картасында ашып, басқа кейіпкерлермен салыстыра алады. Жеке кітапхана мен оқу прогресі барлық бетке ортақ және браузерде сақталады.

## А. Cloudflare Worker-ді іске қосу

### 1. Жаңа Worker үшін CORS доменін белгілеу

`cloudflare-worker/worker.js` файлын ашып, мына жолды табыңыз:

```js
const ALLOWED_ORIGIN = "https://YOUR_GITHUB_USERNAME.github.io";
```

Оны өз GitHub Pages доменіңізге ауыстырыңыз. Мысалы, сайт мекенжайы `https://fariza.github.io/fearmap/` болса, origin тек:

```js
const ALLOWED_ORIGIN = "https://fariza.github.io";
```

Жолдың `/fearmap/` бөлігі CORS origin-ге кірмейді. Custom domain пайдаланылса, нақты custom origin жазыңыз.

### 2. Жеке жаңа Worker-ді жариялау

Терминалда:

```bash
cd cloudflare-worker
npm install
npx wrangler login
npm run deploy
```

`wrangler.jsonc` ішінде осы жобаға арналған жаңа атау берілген:

```json
"name": "fearmap-literary-ai-2026"
```

Егер Cloudflare аккаунтында бұл атау бұрыннан бар болса, оны жаңа бірегей атауға ауыстырыңыз. Бұрынғы Worker атауын, кодын немесе URL-ін қолданбаңыз.

Жариялау аяқталғанда Wrangler нақты URL көрсетеді, мысалы:

```text
https://fearmap-literary-ai-2026.<сіздің-subdomain>.workers.dev
```

Бұл тек мысал пішімі. Жоба кодында ойдан шығарылған Worker URL жоқ — міндетті түрде Wrangler қайтарған нақты мекенжайды қолданыңыз.

### Worker сипаттамасы

- Workers AI binding атауы: `AI`.
- Модель: `@cf/meta/llama-3.1-8b-instruct-fp8`.
- API key браузерге берілмейді және сайтта сұралмайды.
- AI жауабы SSE арқылы біртіндеп көрсетіледі.
- `/api/analyze` маршруты жаңа шығармаға арналған құрылымдалған карточка черновигін жасайды.
- Сұрақ ұзындығы: ең көбі 2400 таңба.
- Талдауға берілетін мәтін үзіндісі: ең көбі 5000 таңба.
- Диалог тарихы шектелген; қате JSON, үлкен сұрау, CORS және AI қателері өңделеді.
- AI нақты цитатаны ойдан шығармауға, факт пен интерпретацияны ажыратуға және мәтіннен дәлел іздетуге бағытталған.

Cloudflare Workers AI Free және Paid жоспарларында қолжетімді; ресми құжатта тәулігіне 10 000 neuron тегін лимит көрсетілген. Лимит пен баға өзгеруі мүмкін: [Cloudflare Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).

## Ә. Worker URL-ін GitHub сайтына бір рет енгізу

Worker жарияланғаннан кейін `github-pages/assets/js/ai.js` файлын ашыңыз. Тек осы жолды өзгертіңіз:

```js
const AI_API_URL = "PASTE_NEW_CLOUDFLARE_WORKER_URL_HERE";
```

Wrangler берген нақты URL-ді жазыңыз:

```js
const AI_API_URL = "https://fearmap-literary-ai-2026.<сіздің-subdomain>.workers.dev";
```

Соңында `/api/chat` қоспаңыз: сайт оны өзі қосады. Бұл URL интерфейсте көрсетілмейді. Пайдаланушыдан Cloudflare URL, API key немесе сервер таңдау сұралмайды.

## Б. GitHub Pages-ке жариялау

1. GitHub-та жаңа repository жасаңыз.
2. `github-pages` бумасының **ішіндегі барлық файлды** repository түбіріне салыңыз.
3. Өзгерістерді `main` branch-ке push етіңіз.
4. Repository ішінде `Settings → Pages` ашыңыз.
5. `Source` ретінде `Deploy from a branch` таңдаңыз.
6. Branch: `main`, folder: `/(root)`, содан кейін `Save` басыңыз.

GitHub Pages статикалық файлдарды branch-тен жариялауды ресми түрде қолдайды: [GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

Жарияланғаннан кейін сайтқа кірген адам AI‑ды бірден қолданады. Қосылу баптауы, API key өрісі, «AI қосу» батырмасы немесе сервер таңдау бөлімі жоқ.

## Тексеру

Worker жарияланған соң:

```bash
curl https://СІЗДІҢ-НАҚТЫ-WORKER-URL/api/health
```

Күтілетін жауап:

```json
{"status":"ok","model":"@cf/meta/llama-3.1-8b-instruct-fp8"}
```

Сайтта `ai.html` бетіне өтіп, қысқа сұрақ жіберіңіз. Одан кейін `add-work.html` бетінде кітап пен кейіпкер атауын енгізіп, `Создать AI-черновик` батырмасын тексеріңіз. Егер CORS қатесі шықса, `worker.js` ішіндегі `ALLOWED_ORIGIN` браузердің нақты origin-імен дәл сәйкес екенін тексеріп, Worker-ді қайта жариялаңыз.

## Сайтта не жұмыс істейді

- кез келген шығарма, автор және кейіпкерді қосу;
- дайын карточканы қолмен толтыру немесе AI-черновик жасау;
- басты бет, кітапхана, карта, салыстыру, қосу, AI, детектив және прогресс жеке беттерде ашылады;
- ортақ навигация барлық беттерді байланыстырады;
- карточкалар және байланыстар картасы жеке беттерде жұмыс істейді;
- қорқыныш түрі бойынша сүзу;
- барлық дайын және қосылған кейіпкерлерді салыстыру;
- әр кейіпкерге арналған «4 следа страха» талдауы;
- жеке карточкаларды браузерде сақтау және қажет кезде жою;
- әдеби детектив, жетістіктер және генеративті AI-чат.

Жеке кітапхана `localStorage` ішінде сақталады. Ол серверге жіберілмейді; тек AI-черновик сұралғанда формадағы кітап, кейіпкер және пайдаланушы енгізген үзінді Worker-ге жіберіледі.

## Файл құрылымы

```text
FearMap-ready/
├── cloudflare-worker/
│   ├── worker.js
│   ├── wrangler.jsonc
│   └── package.json
└── github-pages/
    ├── index.html
    ├── library.html
    ├── map.html
    ├── compare.html
    ├── add-work.html
    ├── ai.html
    ├── detective.html
    ├── progress.html
    ├── .nojekyll
    └── assets/
        ├── css/styles.css
        ├── icons/favicon.svg
        └── js/
            ├── ai.js
            ├── app.js
            └── data.js
```

## Ресми техникалық негіз

- [Cloudflare Workers AI binding](https://developers.cloudflare.com/workers-ai/configuration/bindings/)
- [Llama 3.1 8B FP8 model](https://developers.cloudflare.com/workers-ai/models/llama-3.1-8b-instruct-fp8/)
- [Workers AI with Wrangler](https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/)
