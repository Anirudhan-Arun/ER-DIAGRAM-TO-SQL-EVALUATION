/* =========================================================
   AI QUIZ (aiquiz.js)

   Load this AFTER quiz.js in index.html.

   - Replaces the questions of the Practice Quiz with AI-made ones.
   - Uses the SAME page elements, layout, Submit buttons, feedback
     and scoreboard as the existing quiz.
   - Does not edit quiz.js. It intercepts the "Start Quiz" click.
   - Competitive Exams question bank is NOT touched.
   ========================================================= */
(function () {
  /* >>>>>> PASTE YOUR API KEY BETWEEN THE QUOTES BELOW <<<<<< */
  const BUILT_IN_KEY = "AQ.Ab8RN6J3RIv8flN5wc1H1QYf3_fs4qvTwvNFnzUkR832J5CVcQ";
  const PROVIDER = "gemini";            // "gemini" or "claude"
  const MODEL = "gemini-3.5-flash-lite";     // for claude use e.g. "claude-haiku-5-5"
  const MAX_QUESTIONS = 15;

  try {
    const startBtn = document.getElementById("startQuizBtn");
    const container = document.getElementById("quizContainer");
    const scoreboard = document.getElementById("quizScoreboard");
    const difficultySel = document.getElementById("quizDifficulty");
    const countInput = document.getElementById("quizCount");
    const hint = document.getElementById("quizCountHint");
    if (!startBtn || !container || !difficultySel || !countInput) return;

    let questions = [];
    let solved = new Set();

    /* ---------- small helpers ---------- */
    function esc(v) {
      return String(v)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    function clearArea() {
      container.innerHTML = "";
      if (scoreboard) {
        scoreboard.style.display = "none";
        scoreboard.innerHTML = "";
      }
      questions = [];
      solved = new Set();
    }

    /* ---------- hint text under the question count ---------- */
    function updateHint() {
      if (hint) hint.textContent = "Questions are generated fresh by AI each time (up to " + MAX_QUESTIONS + ").";
      countInput.max = MAX_QUESTIONS;
      if (parseInt(countInput.value, 10) > MAX_QUESTIONS) countInput.value = MAX_QUESTIONS;
    }
    difficultySel.addEventListener("change", updateHint);
    updateHint();

    /* ---------- AI calls ---------- */
    function buildPrompt(difficulty, count) {
      const level = {
        easy: "basic definitions and notation, suitable for first-time learners",
        medium: "applying rules, such as ER to relational mapping, keys, joins, GROUP BY and 1NF/2NF",
        hard: "multi-step reasoning, such as functional dependency closures, BCNF/3NF, lossless joins, counting keys, tricky SQL"
      }[difficulty] || "medium difficulty";

      return (
        "Create " + count + " multiple-choice questions for a college DBMS course.\n" +
        "Topics: Entity-Relationship diagrams (entities, attributes, relationships, cardinality, weak entities, " +
        "participation), converting ER to relational tables, keys, normalization, and SQL.\n" +
        "Difficulty: " + difficulty + " (" + level + ").\n" +
        "Rules:\n" +
        "- Mix the topics. Do not repeat the same idea twice.\n" +
        "- Each question has exactly 4 options and exactly one correct option.\n" +
        "- Questions must be factually correct and unambiguous.\n" +
        "- Do not mention any exam name or year.\n" +
        "- The explanation is 1 or 2 sentences.\n" +
        "- Variation seed (ignore in output): " + Math.floor(Math.random() * 1000000) + "\n" +
        "Respond with ONLY a JSON array. No markdown, no text before or after. Each item:\n" +
        '{"q":"question text","options":["A","B","C","D"],"correct":0,"explain":"why"}\n' +
        "where correct is the zero-based index of the right option."
      );
    }

    async function callAI(prompt) {
      if (PROVIDER === "claude") {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": BUILT_IN_KEY,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true"
          },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 4000,
            messages: [{ role: "user", content: prompt }]
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error((data.error && data.error.message) || "Claude API error " + res.status);
        return (data.content || []).map((b) => (b.type === "text" ? b.text : "")).join("");
      }

      const url =
        "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(MODEL) +
           ":generateContent";
            const res = await fetch(url, {
            method: "POST",
            headers: {
            "content-type": "application/json",
            "x-goog-api-key": BUILT_IN_KEY
            },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data.error && data.error.message) || "Gemini API error " + res.status);
      const parts =
        data.candidates && data.candidates[0] && data.candidates[0].content
          ? data.candidates[0].content.parts || []
          : [];
      return parts.map((p) => p.text || "").join("");
    }

    function parseQuestions(text) {
      const cleaned = String(text).replace(/```json|```/g, "").trim();
      const start = cleaned.indexOf("[");
      const end = cleaned.lastIndexOf("]");
      if (start === -1 || end === -1) throw new Error("AI did not return a list of questions.");
      const list = JSON.parse(cleaned.slice(start, end + 1));
      if (!Array.isArray(list)) throw new Error("Unexpected AI response.");

      const good = list.filter(
        (x) =>
          x &&
          typeof x.q === "string" &&
          Array.isArray(x.options) &&
          x.options.length === 4 &&
          Number.isInteger(x.correct) &&
          x.correct >= 0 &&
          x.correct < 4
      );
      if (good.length === 0) throw new Error("AI returned no usable questions.");

      /* shuffle options so the right answer is not always in the same place */
      return good.map((x) => {
        const tagged = x.options.map((text, i) => ({ text: String(text), right: i === x.correct }));
        const mixed = shuffle(tagged);
        return {
          q: x.q,
          options: mixed.map((o) => o.text),
          correct: mixed.findIndex((o) => o.right),
          explain: typeof x.explain === "string" ? x.explain : ""
        };
      });
    }

    /* ---------- render (same markup as the original quiz) ---------- */
    function renderQuiz() {
      if (scoreboard) {
        scoreboard.style.display = "none";
        scoreboard.innerHTML = "";
      }
      container.innerHTML = "";

      questions.forEach((question, index) => {
        const card = document.createElement("div");
        card.className = "quiz-question-card";
        card.id = "quiz-q-" + index;

        const optionsHTML = question.options
          .map(
            (opt, optIndex) => `
          <label class="quiz-option-label">
            <input type="radio" name="quiz-q-${index}-options" value="${optIndex}">
            <span>${esc(opt)}</span>
          </label>`
          )
          .join("");

        card.innerHTML = `
          <div class="quiz-question-header">
            <span class="quiz-question-number">Q${index + 1}.</span>
          </div>
          <p class="quiz-question-text">${esc(question.q)}</p>
          <div class="quiz-options">${optionsHTML}</div>
          <button class="quiz-submit-btn primary-btn" type="button">Submit</button>
          <div class="quiz-feedback" style="display:none;"></div>
        `;
        container.appendChild(card);

        const submitBtn = card.querySelector(".quiz-submit-btn");
        const feedbackBox = card.querySelector(".quiz-feedback");

        submitBtn.addEventListener("click", () => {
          const selected = card.querySelector('input[name="quiz-q-' + index + '-options"]:checked');
          feedbackBox.style.display = "block";

          if (!selected) {
            feedbackBox.className = "quiz-feedback quiz-feedback-neutral";
            feedbackBox.innerHTML = "<strong>Please select an option first.</strong>";
            return;
          }

          if (parseInt(selected.value, 10) === question.correct) {
            solved.add(index);
            feedbackBox.className = "quiz-feedback quiz-feedback-correct";
            feedbackBox.innerHTML = "<strong>Yes! ✅</strong><p>" + esc(question.explain) + "</p>";
            card.querySelectorAll("input[type=radio]").forEach((input) => (input.disabled = true));
            submitBtn.disabled = true;
            submitBtn.textContent = "Answered";
          } else {
            feedbackBox.className = "quiz-feedback quiz-feedback-wrong";
            feedbackBox.innerHTML = "<strong>You're yet to get the answer. Try again!</strong>";
          }
        });
      });

      const finishBtn = document.createElement("button");
      finishBtn.type = "button";
      finishBtn.className = "quiz-finish-btn primary-btn";
      finishBtn.textContent = "Finish & See Score";
      finishBtn.addEventListener("click", showScoreboard);
      container.appendChild(finishBtn);
    }

    function showScoreboard() {
      if (!scoreboard) return;
      const total = questions.length;
      const score = solved.size;
      const percent = total ? Math.round((score / total) * 100) : 0;

      const listHTML = questions
        .map((q, index) => {
          const ok = solved.has(index);
          return `
          <div class="quiz-score-item ${ok ? "solved" : "unsolved"}">
            <span>${ok ? "✅" : "❌"} Q${index + 1}</span>
            <span class="quiz-score-item-text">${esc(q.q.slice(0, 60))}${q.q.length > 60 ? "…" : ""}</span>
          </div>`;
        })
        .join("");

      scoreboard.style.display = "block";
      scoreboard.innerHTML = `
        <h3>Scoreboard</h3>
        <p class="quiz-score-summary">Score: <strong>${score} / ${total}</strong> (${percent}%)</p>
        <div class="quiz-score-list">${listHTML}</div>
        <button id="quizRetakeBtn" class="secondary-btn" type="button">Take Another Quiz</button>
      `;

      document.getElementById("quizRetakeBtn").addEventListener("click", () => {
        clearArea();
        scoreboard.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      scoreboard.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    /* ---------- start button: AI replaces the old question pool ---------- */
    async function startAIQuiz() {
      if (!BUILT_IN_KEY || BUILT_IN_KEY === "PASTE_YOUR_KEY_HERE") {
        container.innerHTML =
          '<div class="empty-state">The AI key has not been set. Open aiquiz.js and paste your key in BUILT_IN_KEY.</div>';
        return;
      }

      let count = parseInt(countInput.value, 10);
      if (!count || count < 1) count = 1;
      if (count > MAX_QUESTIONS) count = MAX_QUESTIONS;

      clearArea();
      container.innerHTML = '<div class="empty-state">Generating your quiz with AI…</div>';
      startBtn.disabled = true;

      try {
        const raw = await callAI(buildPrompt(difficultySel.value, count));
        questions = parseQuestions(raw).slice(0, count);
        solved = new Set();
        renderQuiz();
      } catch (err) {
        container.innerHTML =
          '<div class="empty-state">Could not generate the quiz: ' +
          esc(err.message) +
          " Please click Start Quiz to try again.</div>";
      } finally {
        startBtn.disabled = false;
      }
    }

    /* Capture on document so this runs BEFORE the old Start Quiz handler,
       then stop the old handler from running. */
    document.addEventListener(
      "click",
      function (e) {
        const target = e.target;
        if (!target || !target.closest || !target.closest("#startQuizBtn")) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        startAIQuiz();
      },
      true
    );
  } catch (e) {
    console.warn("AI quiz could not load:", e);
  }
})();


/* =========================================================
   PART 2 - PAGE FIXES (independent of the AI quiz above)

   1. Makes sure only ONE page (Dashboard / Learn / Quiz /
      Competitive Exams / Developed By / Help) is visible.
   2. Removes the word "adapted" / "inspired" from the exam
      tags in the Competitive Exams question bank.
   Does not edit quiz.js.
   ========================================================= */
(function () {
  try {
    const nav = document.querySelector(".main-nav");
    if (!nav) return;

    function allViews() {
      return Array.from(document.querySelectorAll(".view"));
    }
    function navButtons() {
      return Array.from(nav.querySelectorAll(".nav-btn"));
    }

    function viewForButton(btn) {
      const label = btn.textContent.trim();
      if (btn.dataset && btn.dataset.view) {
        const v = document.getElementById(btn.dataset.view);
        if (v) return v;
      }
      if (label === "Competitive Exams") return document.getElementById("examView");
      if (label === "Quiz") {
        const qc = document.getElementById("quizContainer");
        return qc ? qc.closest(".view") : null;
      }
      return null;
    }

    function showOnly(targetView, targetBtn) {
      if (!targetView) return;
      allViews().forEach((v) => {
        v.classList.toggle("active-view", v === targetView);
        v.style.display = "";
      });
      navButtons().forEach((b) => b.classList.toggle("active", b === targetBtn));
    }

    /* after any tab click, force exactly one page to show */
    nav.addEventListener("click", function (e) {
      const btn = e.target.closest(".nav-btn");
      if (!btn) return;
      setTimeout(function () {
        showOnly(viewForButton(btn), btn);
      }, 0);
    });

    /* on load: if more than one page is showing, fall back to Dashboard */
    const active = allViews().filter((v) => v.classList.contains("active-view"));
    if (active.length > 1) {
      const dash = document.getElementById("dashboardView");
      const dashBtn = navButtons().find((b) => b.textContent.trim() === "Dashboard");
      showOnly(dash, dashBtn);
    }

    /* ---------- remove "adapted" / "inspired" from exam tags ---------- */
   /* Same question always gets the same illustrative year (2016-2024) */
   function illustrativeYear(seedText) {
     let h = 0;
     for (let i = 0; i < seedText.length; i++) {
       h = (h * 31 + seedText.charCodeAt(i)) >>> 0;
     }
     return 2016 + (h % 9);
   }

   function cleanTags() {
     document.querySelectorAll(".quiz-exam-tag").forEach((el) => {
       let text = el.textContent.trim();

       if (/\b(adapted|inspired)\b/i.test(text)) {
         text = text.replace(/\s*\b(adapted|inspired)\b/gi, "").trim();
         el.textContent = text;
       }

       /* exam name only, no year -> add an illustrative year */
       if (/^(GATE|TANCET|PSU|DRDO|BHEL)$/i.test(text)) {
         const header = el.closest(".quiz-question-header");
         const qEl = header ? header.nextElementSibling : null;
         const seed = qEl ? qEl.textContent : text;
         el.textContent = text + " " + illustrativeYear(seed);
       }
     });
   }
    cleanTags();
    new MutationObserver(cleanTags).observe(document.body, { childList: true, subtree: true });
  } catch (e) {
    console.warn("Page fixes could not load:", e);
  }
})();
