const state = {
  screen: "menu",
  scoreMode: "sanma",
  playerNames: ["", "", "", ""],
  scores: ["", "", "", ""],
  chips: ["", "", "", ""],
  chipsEnabled: JSON.parse(localStorage.getItem("csss_chips_enabled") || "true"),
  members: JSON.parse(localStorage.getItem("csss_members") || "[]"),
  pokerMembers: JSON.parse(localStorage.getItem("hks_members") || "[]"),
  pokerPointRate: Number(localStorage.getItem("hks_point_rate") || "1") || 1,
  openPokerMemberSelectIndex: null,
  histories: JSON.parse(localStorage.getItem("csss_histories") || "[]"),
  session: JSON.parse(localStorage.getItem("csss_session") || "null"),
  chinitsuMain: "analysis",
  quizMode: "discard",
  analysisCounts: Array(10).fill(0),
  waitCheckCounts: Array(10).fill(0),
  discardQuizCounts: null,
  discardSelected: null,
  waitQuizCounts: null,
  waitSelected: new Set(),
  waitAnswered: false,
  openMemberSelectIndex: null,
  pokerPlayers: JSON.parse(localStorage.getItem("hks_players") || "null") || [
    { name: "", in: "", out: "" },
    { name: "", in: "", out: "" },
    { name: "", in: "", out: "" },
    { name: "", in: "", out: "" },
  ],
  pokerHistories: JSON.parse(localStorage.getItem("hks_histories") || "[]"),
};

const CHIP_VALUE = 5;
const SCORE_CONFIGS = {
  sanma: {
    title: "三人麻雀",
    playerCount: 3,
    totalScore: 150000,
    returnBase: 50000,
    rankPoints: [30, 0, -30],
    okaTopBonus: 0,
    defaultNames: ["東家", "南家", "西家"],
    description: "50000点持ち50000点返し / ウマ +30・0・-30 / チップ1枚5P",
  },
  yonma: {
    title: "四人麻雀",
    playerCount: 4,
    totalScore: 100000,
    returnBase: 30000,
    rankPoints: [30, 10, -10, -30],
    okaTopBonus: 20,
    defaultNames: ["東家", "南家", "西家", "北家"],
    description: "25000点持ち30000点返し / ウマ +30・+10・-10・-30 / オカ+20 / チップ1枚5P",
  },
};

function $(id) { return document.getElementById(id); }
function currentConfig() { return SCORE_CONFIGS[state.scoreMode]; }
function playerCount() { return currentConfig().playerCount; }
function activeIndexes() { return Array.from({ length: playerCount() }, (_, i) => i); }

function parseNumberText(value) {
  if (value === "" || value === "-" || value === "+") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function typedScoreCount() {
  return activeIndexes().filter(i => parseNumberText(state.scores[i]) !== null).length;
}

function typedChipCount() {
  return activeIndexes().filter(i => parseNumberText(state.chips[i]) !== null).length;
}
function saveLocal() {
  localStorage.setItem("csss_members", JSON.stringify(state.members));
  localStorage.setItem("csss_histories", JSON.stringify(state.histories));
  localStorage.setItem("csss_session", JSON.stringify(state.session));
  localStorage.setItem("csss_chips_enabled", JSON.stringify(state.chipsEnabled));
  localStorage.setItem("hks_members", JSON.stringify(state.pokerMembers));
  localStorage.setItem("hks_point_rate", String(state.pokerPointRate));
  localStorage.setItem("hks_players", JSON.stringify(state.pokerPlayers));
  localStorage.setItem("hks_histories", JSON.stringify(state.pokerHistories));
}
function signed(value) { return value > 0 ? `+${value}` : `${value}`; }
function formatPoint(value) { return `${value >= 0 ? "+" : ""}${value.toFixed(1)}P`; }

function openScreen(screen) {
  state.screen = screen;
  document.querySelectorAll(".screen").forEach(el => el.classList.remove("active"));
  $(`${screen}Screen`).classList.add("active");
  $("backButton").classList.toggle("hidden", screen === "menu");

  const titles = {
    menu: ["Score Tools", "Score utilities for mahjong and poker"],
    score: ["Critical Sonic Sanma Score", "Sanma / Yonma Score"],
    poker: ["Hadou Kaiwai Score", "Poker Score / Transfer"],
    chinitsu: ["Chinitsu Quiz", "清一色 何切る / 待ち確認"],
  };
  $("screenTitle").textContent = titles[screen][0];
  $("screenSubtitle").textContent = titles[screen][1];
  renderAll();
}

function resolvedNames() {
  const defaults = currentConfig().defaultNames;
  return activeIndexes().map(i => state.playerNames[i].trim() || defaults[i]);
}

function currentScores() {
  const values = activeIndexes().map(i => parseNumberText(state.scores[i]));
  const entered = values.filter(v => v !== null);
  if (entered.length === playerCount() - 1) {
    const empty = values.findIndex(v => v === null);
    if (empty >= 0) values[empty] = currentConfig().totalScore - entered.reduce((a, b) => a + b, 0);
  }
  return values;
}

function currentChips() {
  if (!state.chipsEnabled) return activeIndexes().map(() => 0);
  const values = activeIndexes().map(i => parseNumberText(state.chips[i]));
  const entered = values.filter(v => v !== null);

  // チップは、残り1人だけ空欄なら合計0になるよう自動補完する。
  // それ以外の空欄は未入力扱い。
  if (entered.length === playerCount() - 1) {
    const empty = values.findIndex(v => v === null);
    if (empty >= 0) values[empty] = -entered.reduce((a, b) => a + b, 0);
  }

  return values;
}

function calculateRankExtras(scores) {
  const config = currentConfig();
  const result = scores.map(() => ({ rankPoint: 0, okaPoint: 0, rank: 0 }));
  const sorted = scores.map((score, index) => ({ score, index }))
    .sort((a, b) => b.score === a.score ? a.index - b.index : b.score - a.score);

  let rankIndex = 0;
  while (rankIndex < sorted.length) {
    const score = sorted[rankIndex].score;
    const same = sorted.filter(item => item.score === score);
    const start = rankIndex;
    const end = rankIndex + same.length;
    const uma = config.rankPoints.slice(start, end).reduce((a, b) => a + b, 0) / same.length;
    const oka = start === 0 ? config.okaTopBonus / same.length : 0;
    same.forEach(item => result[item.index] = { rankPoint: uma, okaPoint: oka, rank: start + 1 });
    rankIndex = end;
  }
  return result;
}

function currentResults() {
  const scores = currentScores();
  const chips = currentChips();
  if (scores.filter(v => v !== null).length !== playerCount()) return [];
  if (chips.filter(v => v !== null).length !== playerCount()) return [];
  const names = resolvedNames();
  const extras = calculateRankExtras(scores);

  return scores.map((score, i) => {
    const basePoint = (score - currentConfig().returnBase) / 1000;
    const chipPoint = chips[i] * CHIP_VALUE;
    return {
      name: names[i],
      score,
      chips: chips[i],
      rank: extras[i].rank,
      basePoint,
      rankPoint: extras[i].rankPoint,
      okaPoint: extras[i].okaPoint,
      chipPoint,
      totalPoint: basePoint + extras[i].rankPoint + extras[i].okaPoint + chipPoint,
    };
  }).sort((a, b) => a.rank - b.rank);
}

function canSave() {
  const scores = currentScores();
  const chips = currentChips();
  return currentResults().length === playerCount()
    && scores.reduce((a, b) => a + (b || 0), 0) === currentConfig().totalScore
    && chips.reduce((a, b) => a + (b || 0), 0) === 0
    && new Set(resolvedNames()).size === playerCount();
}

function renderScoreModeSelector() {
  document.querySelectorAll("[data-score-mode]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.scoreMode === state.scoreMode);
  });
  $("scoreModeDescription").textContent = currentConfig().description;
  const chipsToggle = $("chipsEnabledToggle");
  if (chipsToggle) chipsToggle.checked = state.chipsEnabled;
  const chipsHelp = $("chipsEnabledHelp");
  if (chipsHelp) chipsHelp.textContent = state.chipsEnabled ? "対局ごとにチップ枚数も入力します。" : "この対局ではチップを0として保存します。チップを最後にまとめて集計する時に使ってください。";
}
function renderMembers() {
  const options = $("memberOptions");
  const list = $("memberList");
  options.innerHTML = state.members.map(name => `<option value="${escapeHTML(name)}"></option>`).join("");

  if (!state.members.length) {
    list.innerHTML = `<p class="muted">登録メンバーはまだありません。</p>`;
    return;
  }

  list.innerHTML = state.members.map(name => `
    <span class="member-chip">
      ${escapeHTML(name)}
      <button data-delete-member="${escapeHTML(name)}" class="member-delete">×</button>
    </span>
  `).join("");

  document.querySelectorAll("[data-delete-member]").forEach(btn => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.deleteMember;
      state.members = state.members.filter(member => member !== name);
      saveLocal();
      renderMembers();
      if (state.screen === "score") renderPlayers();
    });
  });
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHTML(value);
}

function addMember() {
  const input = $("memberNameInput");
  const name = input.value.trim();
  if (!name) return;
  if (!state.members.includes(name)) {
    state.members.push(name);
    state.members.sort((a, b) => a.localeCompare(b, "ja"));
    saveLocal();
  }
  input.value = "";
  renderMembers();
  if (state.screen === "score") renderPlayers();
}


function showMemberSelect(index) {
  if (!state.members.length) return;
  state.openMemberSelectIndex = state.openMemberSelectIndex === index ? null : index;
  renderPlayers();
}

function selectMemberForPlayer(index, name) {
  state.playerNames[index] = name;
  state.openMemberSelectIndex = null;

  const nameInput = document.querySelector(`[data-name="${index}"]`);
  if (nameInput) nameInput.value = state.playerNames[index];

  renderPlayers();
  renderScore();
}

function renderPlayers() {
  const root = $("players");
  root.innerHTML = "";
  const scores = currentScores();
  const chips = currentChips();
  const defaults = currentConfig().defaultNames;

  for (let i = 0; i < playerCount(); i++) {
    const autoScore = state.scores[i] === "" && typedScoreCount() === playerCount() - 1;
    const autoChip = state.chips[i] === "" && typedChipCount() === playerCount() - 1;
    const row = document.createElement("div");
    row.className = "player-row";
    row.innerHTML = `
      <div class="player-name-line">
        <span class="muted">${i + 1}</span>
        <input data-name="${i}" list="memberOptions" placeholder="${defaults[i]}" value="${state.playerNames[i]}">
        <button class="secondary member-select-button" data-member-select="${i}" ${state.members.length ? "" : "disabled"}>選択</button>
        <div class="member-dropdown ${state.openMemberSelectIndex === i ? "" : "hidden"}" data-member-dropdown="${i}">
          ${state.members.length ? state.members.map(name => `<button class="member-option" data-member-option="${i}" data-member-name="${escapeAttr(name)}">${escapeHTML(name)}</button>`).join("") : `<span class="muted">登録メンバーなし</span>`}
        </div>
      </div>
      <div class="input-grid ${state.chipsEnabled ? "" : "score-only"}">
        <span>点数</span>
        <button class="secondary minus-button" data-score-minus="${i}">−</button>
        <input data-score="${i}" inputmode="numeric" pattern="[0-9]*" placeholder="${autoScore ? scores[i] : "例 25000"}" value="${state.scores[i]}">
        ${state.chipsEnabled ? `
          <button class="secondary chip-stepper" data-chip-minus="${i}">−</button>
          <input class="chip-input" data-chip="${i}" inputmode="numeric" placeholder="${autoChip ? signed(chips[i]) : "0"}" value="${state.chips[i]}">
          <button class="secondary chip-stepper" data-chip-plus="${i}">＋</button>
        ` : `<span class="muted chip-off-label">チップOFF</span>`}
      </div>`;
    root.appendChild(row);
  }

  document.querySelectorAll("[data-name]").forEach(input => {
    input.addEventListener("input", e => {
      state.playerNames[Number(e.target.dataset.name)] = e.target.value;
      state.openMemberSelectIndex = null;
      renderScore();
    });
  });

  document.querySelectorAll("[data-member-select]").forEach(btn => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.memberSelect);
      showMemberSelect(index);
    });
  });

  document.querySelectorAll("[data-member-option]").forEach(btn => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.memberOption);
      const name = btn.dataset.memberName;
      selectMemberForPlayer(index, name);
    });
  });
  document.querySelectorAll("[data-score]").forEach(input => {
    input.addEventListener("input", e => {
      const index = Number(e.target.dataset.score);
      const wasNegative = state.scores[index].startsWith("-");
      let value = e.target.value.replace(/\D/g, "");
      if (wasNegative && value !== "") value = `-${value}`;
      state.scores[index] = value;
      e.target.value = value;
      renderScore();
    });
  });

  document.querySelectorAll("[data-score-minus]").forEach(btn => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.scoreMinus);
      const current = state.scores[index] || "";
      if (current.startsWith("-")) {
        state.scores[index] = current.slice(1);
      } else {
        state.scores[index] = current === "" ? "-" : `-${current}`;
      }
      const input = document.querySelector(`[data-score="${index}"]`);
      if (input) {
        input.value = state.scores[index];
        input.focus();
      }
      renderScore();
    });
  });
  document.querySelectorAll("[data-chip]").forEach(input => {
    input.addEventListener("input", e => {
      let value = e.target.value.replace(/[^\d-]/g, "");
      value = value.replace(/(?!^)-/g, "");
      state.chips[Number(e.target.dataset.chip)] = value;
      e.target.value = value;
      renderScore();
    });
  });
  document.querySelectorAll("[data-chip-minus]").forEach(btn => btn.addEventListener("click", () => adjustChip(Number(btn.dataset.chipMinus), -1)));
  document.querySelectorAll("[data-chip-plus]").forEach(btn => btn.addEventListener("click", () => adjustChip(Number(btn.dataset.chipPlus), 1)));
}

function updateAutoPlaceholders(scores, chips) {
  document.querySelectorAll("[data-score]").forEach(input => {
    const index = Number(input.dataset.score);
    const autoScore = state.scores[index] === "" && typedScoreCount() === playerCount() - 1;
    input.placeholder = autoScore && scores[index] !== null ? String(scores[index]) : "例 25000";
  });
  if (!state.chipsEnabled) return;
  document.querySelectorAll("[data-chip]").forEach(input => {
    const index = Number(input.dataset.chip);
    const autoChip = state.chips[index] === "" && typedChipCount() === playerCount() - 1;
    input.placeholder = autoChip && chips[index] !== null ? signed(chips[index]) : "0";
  });
}

function adjustChip(index, delta) {
  const current = Number(state.chips[index] || 0);
  const next = current + delta;
  state.chips[index] = next === 0 ? "" : String(next);
  const input = document.querySelector(`[data-chip="${index}"]`);
  if (input) input.value = state.chips[index];
  renderScore();
}

function renderScore() {
  const scores = currentScores();
  const chips = currentChips();
  const scoreSum = scores.reduce((a, b) => a + (b || 0), 0);
  const chipSum = chips.reduce((a, b) => a + (b || 0), 0);
  $("scoreTotalText").textContent = `点数合計：${scoreSum} / ${currentConfig().totalScore}`;
  $("scoreTotalText").className = scores.filter(v => v !== null).length === playerCount() && scoreSum !== currentConfig().totalScore ? "bad" : "";
  if (state.chipsEnabled) {
    $("chipTotalText").textContent = `チップ合計：${chipSum}枚`;
    $("chipTotalText").className = chips.filter(v => v !== null).length === playerCount() && chipSum !== 0 ? "bad" : "";
  } else {
    $("chipTotalText").textContent = "チップ：OFF（全員0枚として計算）";
    $("chipTotalText").className = "";
  }
  updateAutoPlaceholders(scores, chips);

  const results = currentResults();
  const root = $("scoreResults");
  if (!results.length) {
    root.className = "muted";
    root.textContent = state.chipsEnabled ? "点数とチップは、残り1人分を自動計算します。" : "点数は、残り1人分を自動計算します。チップは全員0枚として計算します。";
  } else {
    root.className = "";
    root.innerHTML = results.map(r => `
      <div class="result-row">
        <div class="result-top"><strong>${r.name}</strong><strong>${formatPoint(r.totalPoint)}</strong></div>
        <div class="muted">点数 ${r.score} / 素点 ${formatPoint(r.basePoint)} / ウマ ${formatPoint(r.rankPoint)}${r.okaPoint ? ` / オカ ${formatPoint(r.okaPoint)}` : ""}${state.chipsEnabled ? ` / チップ ${formatPoint(r.chipPoint)}` : ""}</div>
      </div>`).join("");
  }

  $("saveMatchButton").disabled = !canSave();
  renderSession();
  renderHistory();
}

function saveMatch() {
  if (!canSave()) return;
  const match = { id: crypto.randomUUID(), mode: state.scoreMode, date: new Date().toISOString(), players: currentResults() };
  state.histories.unshift(match);
  if (state.session) {
    const matchNames = new Set(match.players.map(p => p.name));
    const sessionNames = new Set(state.session.names);
    if ((!state.session.mode || state.session.mode === state.scoreMode) && [...matchNames].every(name => sessionNames.has(name))) {
      state.session.matchIds.push(match.id);
    }
  }
  state.scores = ["", "", "", ""];
  state.chips = ["", "", "", ""];
  $("saveMessage").textContent = "保存しました";
  saveLocal();
  renderPlayers();
  renderScore();
}

function renderSession() {
  const root = $("sessionArea");

  if (state.session && (state.session.mode || "sanma") !== state.scoreMode) {
    root.innerHTML = `
      <p class="muted">${currentConfig().title}の集計は開始されていません。</p>
      <button id="startSessionButton" ${new Set(resolvedNames()).size !== playerCount() ? "disabled" : ""}>この${playerCount()}人で集計開始</button>
    `;
    $("startSessionButton").addEventListener("click", () => {
      state.session = { mode: state.scoreMode, names: resolvedNames(), matchIds: [], startedAt: new Date().toISOString() };
      saveLocal();
      renderScore();
    });
    return;
  }

  if (!state.session) {
    root.innerHTML = `
      <p class="muted">${playerCount()}人の名前を選んでから集計を開始すると、以降に保存した対局を自動で合計します。</p>
      <button id="startSessionButton" ${new Set(resolvedNames()).size !== playerCount() ? "disabled" : ""}>この${playerCount()}人で集計開始</button>`;
    $("startSessionButton").addEventListener("click", () => {
      state.session = { mode: state.scoreMode, names: resolvedNames(), matchIds: [], startedAt: new Date().toISOString() };
      saveLocal();
      renderScore();
    });
    return;
  }

  const matches = state.histories.filter(h => state.session.matchIds.includes(h.id));
  const totals = state.session.names.map(name => ({
    name,
    total: matches.reduce((sum, match) => {
      const player = match.players.find(p => p.name === name);
      return sum + (player ? player.totalPoint : 0);
    }, 0)
  }));

  root.innerHTML = `
    <p><strong>現在集計中</strong> <span class="muted">${SCORE_CONFIGS[state.session.mode || "sanma"].title}</span></p>
    <p>${state.session.names.join(" / ")}</p>
    <p class="muted">集計開始後：${matches.length}局保存済み</p>
    ${totals.map(t => `<div class="result-top"><span>${t.name}</span><strong>${formatPoint(t.total)}</strong></div>`).join("")}
    <div class="button-row" style="margin-top:10px">
      <button id="restartSession" class="secondary">集計を開始し直す</button>
      <button id="endSession" class="secondary">集計を終了</button>
    </div>`;
  $("restartSession").addEventListener("click", () => {
    state.session = { mode: state.scoreMode, names: resolvedNames(), matchIds: [], startedAt: new Date().toISOString() };
    saveLocal();
    renderScore();
  });
  $("endSession").addEventListener("click", () => {
    state.session = null;
    saveLocal();
    renderScore();
  });
}

function displayedHistories() {
  return state.histories.filter(history => (history.mode || "sanma") === state.scoreMode);
}

function renderHistory() {
  const root = $("historyList");
  const histories = displayedHistories();

  if (!histories.length) {
    root.innerHTML = `<p class="muted">保存された${currentConfig().title}の対局履歴はまだありません。</p>`;
    return;
  }

  root.innerHTML = histories.map(h => `
    <div class="history-item">
      <div class="muted">${new Date(h.date).toLocaleString("ja-JP")} / ${SCORE_CONFIGS[h.mode || "sanma"].title}</div>
      ${h.players.map(p => `<div class="result-top"><span>${p.name}</span><span>${formatPoint(p.totalPoint)}</span></div>`).join("")}
      <button class="secondary" data-delete-history="${h.id}">削除</button>
    </div>`).join("");

  document.querySelectorAll("[data-delete-history]").forEach(btn => {
    btn.addEventListener("click", () => {
      const deleteId = btn.dataset.deleteHistory;
      state.histories = state.histories.filter(h => h.id !== deleteId);
      if (state.session) state.session.matchIds = state.session.matchIds.filter(id => id !== deleteId);
      saveLocal();
      renderScore();
    });
  });
}

/* Chinitsu */
function tileHTML(tile, className = "") { return `<div class="tile ${className}"><div class="number">${tile}</div><div class="suit">萬</div></div>`; }
function renderHand(el, counts, className = "hand-normal") {
  const tiles = [];
  for (let t = 1; t <= 9; t++) for (let i = 0; i < counts[t]; i++) tiles.push(t);
  el.innerHTML = tiles.length ? tiles.map(t => tileHTML(t, className)).join("") : `<span class="muted">未入力</span>`;
}
function makeTileButtons(root, onClick, disabled = () => false, selected = () => false) {
  root.innerHTML = "";
  for (let t = 1; t <= 9; t++) {
    const btn = document.createElement("button");
    btn.className = `tile-button ${selected(t) ? "selected" : ""}`;
    btn.disabled = disabled(t);
    btn.innerHTML = tileHTML(t);
    btn.addEventListener("click", () => onClick(t));
    root.appendChild(btn);
  }
}
function totalTiles(counts) { return counts.reduce((a, b) => a + b, 0); }
function renderChinitsu() {
  document.querySelectorAll("[data-chinitsu-main]").forEach(btn => btn.classList.toggle("active", btn.dataset.chinitsuMain === state.chinitsuMain));
  $("analysisPanel").classList.toggle("hidden", state.chinitsuMain !== "analysis");
  $("waitCheckPanel").classList.toggle("hidden", state.chinitsuMain !== "waitCheck");
  $("quizPanel").classList.toggle("hidden", state.chinitsuMain !== "quiz");
  renderAnalysis(); renderWaitCheck(); renderQuiz();
}
function renderAnalysis() {
  renderHand($("analysisHand"), state.analysisCounts, "hand-normal");
  $("analysisCount").textContent = `枚数：${totalTiles(state.analysisCounts)} / 14`;
  makeTileButtons($("analysisTileButtons"), t => { if (totalTiles(state.analysisCounts) < 14 && state.analysisCounts[t] < 4) { state.analysisCounts[t]++; renderAnalysis(); } }, t => totalTiles(state.analysisCounts) >= 14 || state.analysisCounts[t] >= 4);
  const removeRoot = $("analysisRemoveButtons"); removeRoot.innerHTML = "";
  for (let t = 1; t <= 9; t++) {
    const btn = document.createElement("button");
    btn.className = "secondary"; btn.textContent = `-${t}`; btn.disabled = state.analysisCounts[t] <= 0;
    btn.addEventListener("click", () => { state.analysisCounts[t]--; renderAnalysis(); });
    removeRoot.appendChild(btn);
  }
  const resultRoot = $("analysisResults");
  if (totalTiles(state.analysisCounts) !== 14) { resultRoot.className = "muted"; resultRoot.textContent = "14枚入力すると、打牌候補と受け入れ枚数を表示します。"; }
  else { resultRoot.className = ""; resultRoot.innerHTML = suggestions(state.analysisCounts).map(suggestionRowHTML).join(""); }
}
function renderWaitCheck() {
  renderHand($("waitCheckHand"), state.waitCheckCounts, "hand-normal");
  $("waitCheckCount").textContent = `枚数：${totalTiles(state.waitCheckCounts)} / 13`;
  makeTileButtons(
    $("waitCheckTileButtons"),
    t => {
      if (totalTiles(state.waitCheckCounts) < 13 && state.waitCheckCounts[t] < 4) {
        state.waitCheckCounts[t]++;
        renderWaitCheck();
      }
    },
    t => totalTiles(state.waitCheckCounts) >= 13 || state.waitCheckCounts[t] >= 4
  );

  const removeRoot = $("waitCheckRemoveButtons");
  removeRoot.innerHTML = "";
  for (let t = 1; t <= 9; t++) {
    const btn = document.createElement("button");
    btn.className = "secondary";
    btn.textContent = `-${t}`;
    btn.disabled = state.waitCheckCounts[t] <= 0;
    btn.addEventListener("click", () => {
      state.waitCheckCounts[t]--;
      renderWaitCheck();
    });
    removeRoot.appendChild(btn);
  }

  const resultRoot = $("waitCheckResults");
  if (totalTiles(state.waitCheckCounts) !== 13) {
    resultRoot.className = "muted";
    resultRoot.textContent = "13枚入力すると、待ち牌を表示します。";
    return;
  }

  const waits = waitTiles(state.waitCheckCounts);
  resultRoot.className = "";
  if (waits.length) {
    resultRoot.innerHTML = `<p><strong>待ち牌：${waits.join(", ")}</strong></p><div class="tile-buttons">${waits.map(t => tileHTML(t)).join("")}</div>`;
  } else {
    resultRoot.innerHTML = `<p class="danger"><strong>待ち牌なし</strong></p><p class="muted">この13枚はテンパイ形ではありません。</p>`;
  }
}

function renderQuiz() {
  if (!state.discardQuizCounts) state.discardQuizCounts = randomFourteenTileHand();
  if (!state.waitQuizCounts) state.waitQuizCounts = randomThirteenTileTenpaiHand();
  document.querySelectorAll("[data-quiz-mode]").forEach(btn => btn.classList.toggle("active", btn.dataset.quizMode === state.quizMode));
  $("discardQuizPanel").classList.toggle("hidden", state.quizMode !== "discard");
  $("waitQuizPanel").classList.toggle("hidden", state.quizMode !== "wait");
  renderDiscardQuiz(); renderWaitQuiz();
}
function renderDiscardQuiz() {
  renderHand($("discardQuizHand"), state.discardQuizCounts, "hand-quiz");
  makeTileButtons($("discardQuizButtons"), t => { if (state.discardQuizCounts[t] <= 0) return; state.discardSelected = t; renderDiscardQuiz(); }, t => state.discardQuizCounts[t] <= 0);
  const root = $("discardQuizAnswer");
  if (!state.discardSelected) { root.className = "muted"; root.textContent = "手牌から切る牌を選んでください。"; return; }
  const list = suggestions(state.discardQuizCounts);

  // 正解判定は「シャンテン数を最優先」。
  // 例：テンパイ待ち4枚 vs 1向聴受け入れ22枚なら、テンパイを正解にする。
  const bestShanten = Math.min(...list.map(s => s.shanten));
  const bestShantenCandidates = list.filter(s => s.shanten === bestShanten);
  const maxAcceptance = Math.max(...bestShantenCandidates.map(s => s.acceptanceCount));
  const best = bestShantenCandidates
    .filter(s => s.acceptanceCount === maxAcceptance)
    .map(s => s.discardTile);

  const selected = list.find(s => s.discardTile === state.discardSelected);
  const isCorrect = best.includes(state.discardSelected);
  root.className = "";
  root.innerHTML = `<p class="${isCorrect ? "ok" : "danger"}"><strong>${isCorrect ? `正解：打${state.discardSelected}` : `選択：打${state.discardSelected}`}</strong></p>${isCorrect ? "" : `<p class="danger"><strong>おすすめ：${best.map(t => `打${t}`).join(" / ")}</strong></p>`}${selected ? `<p class="muted">あなたの選択：${summaryText(selected)}</p>` : ""}${list.map(suggestionRowHTML).join("")}`;
}
function renderWaitQuiz() {
  renderHand($("waitQuizHand"), state.waitQuizCounts, "hand-quiz");
  makeTileButtons($("waitQuizButtons"), t => { if (state.waitSelected.has(t)) state.waitSelected.delete(t); else state.waitSelected.add(t); renderWaitQuiz(); }, () => false, t => state.waitSelected.has(t));
  $("submitWaitQuiz").disabled = state.waitSelected.size === 0;
  const correct = waitTiles(state.waitQuizCounts);
  const selected = [...state.waitSelected].sort((a, b) => a - b);
  const root = $("waitQuizAnswer");
  if (!state.waitAnswered) { root.className = "muted"; root.textContent = "待ち牌を選んで回答してください。複数選択できます。"; return; }
  const ok = JSON.stringify(selected) === JSON.stringify(correct);
  root.className = "";
  root.innerHTML = `<p class="${ok ? "ok" : "danger"}"><strong>${ok ? "正解" : "不正解"}</strong></p><p class="muted">あなたの回答：${selected.length ? selected.join(", ") : "なし"}</p><p><strong>正解の待ち牌：${correct.join(", ")}</strong></p>`;
}
function suggestionRowHTML(s) { return `<div class="suggestion-row"><div class="suggestion-top"><span>打 ${tileHTML(s.discardTile, "small")}</span><strong>受け入れ ${s.acceptanceCount}枚</strong></div><div class="muted">${summaryText(s)}</div></div>`; }
function summaryText(s) {
  let status, label;
  if (s.shanten <= -1) { status = "和了"; label = "待ち牌"; }
  else if (s.shanten === 0) { status = "テンパイ"; label = "待ち牌"; }
  else { status = `${s.shanten}向聴`; label = "有効牌"; }
  return `${status} / ${label}：${s.acceptanceTiles.length ? s.acceptanceTiles.join(", ") : "なし"}`;
}
function suggestions(fourteenCounts) {
  const list = [];
  for (let discard = 1; discard <= 9; discard++) {
    if (fourteenCounts[discard] <= 0) continue;
    const afterDiscard = [...fourteenCounts]; afterDiscard[discard]--;
    const base = shanten(afterDiscard);
    const acceptanceTiles = []; let acceptanceCount = 0;
    for (let draw = 1; draw <= 9; draw++) {
      if (afterDiscard[draw] >= 4) continue;
      const afterDraw = [...afterDiscard]; afterDraw[draw]++;
      if (shanten(afterDraw) < base) { acceptanceTiles.push(draw); acceptanceCount += 4 - afterDiscard[draw]; }
    }
    list.push({ discardTile: discard, shanten: base, acceptanceTiles, acceptanceCount });
  }
  return list.sort((a, b) => a.shanten !== b.shanten ? a.shanten - b.shanten : a.acceptanceCount !== b.acceptanceCount ? b.acceptanceCount - a.acceptanceCount : a.discardTile - b.discardTile);
}
function waitTiles(thirteenCounts) {
  const waits = [];
  for (let draw = 1; draw <= 9; draw++) {
    if (thirteenCounts[draw] >= 4) continue;
    const afterDraw = [...thirteenCounts]; afterDraw[draw]++;
    if (shanten(afterDraw) <= -1) waits.push(draw);
  }
  return waits;
}
function shanten(counts) { return Math.min(standardShanten(counts), chiitoiShanten(counts)); }
function standardShanten(counts) {
  const working = [...counts]; let best = 8;
  function search(tile, melds, taatsu, hasPair) {
    if (tile > 9) { best = Math.min(best, 8 - melds * 2 - Math.min(taatsu, 4 - melds) - (hasPair ? 1 : 0)); return; }
    if (working[tile] === 0) { search(tile + 1, melds, taatsu, hasPair); return; }
    if (working[tile] >= 3) { working[tile] -= 3; search(tile, melds + 1, taatsu, hasPair); working[tile] += 3; }
    if (tile <= 7 && working[tile] > 0 && working[tile + 1] > 0 && working[tile + 2] > 0) { working[tile]--; working[tile+1]--; working[tile+2]--; search(tile, melds + 1, taatsu, hasPair); working[tile]++; working[tile+1]++; working[tile+2]++; }
    if (!hasPair && working[tile] >= 2) { working[tile] -= 2; search(tile, melds, taatsu, true); working[tile] += 2; }
    if (working[tile] >= 2) { working[tile] -= 2; search(tile, melds, taatsu + 1, hasPair); working[tile] += 2; }
    if (tile <= 8 && working[tile] > 0 && working[tile + 1] > 0) { working[tile]--; working[tile+1]--; search(tile, melds, taatsu + 1, hasPair); working[tile]++; working[tile+1]++; }
    if (tile <= 7 && working[tile] > 0 && working[tile + 2] > 0) { working[tile]--; working[tile+2]--; search(tile, melds, taatsu + 1, hasPair); working[tile]++; working[tile+2]++; }
    working[tile]--; search(tile, melds, taatsu, hasPair); working[tile]++;
  }
  search(1, 0, 0, false); return best;
}
function chiitoiShanten(counts) {
  let pairs = 0, unique = 0;
  for (let t = 1; t <= 9; t++) { if (counts[t] >= 2) pairs++; if (counts[t] > 0) unique++; }
  return 6 - pairs + Math.max(0, 7 - unique);
}
function makeRandomHand(tileCount) { const tiles = []; for (let t=1;t<=9;t++) for (let i=0;i<4;i++) tiles.push(t); tiles.sort(() => Math.random() - 0.5); const counts = Array(10).fill(0); tiles.slice(0, tileCount).forEach(t => counts[t]++); return counts; }
function randomFourteenTileHand() { for (let i=0;i<1000;i++) { const c = makeRandomHand(14); if (shanten(c) >= 0) return c; } return makeRandomHand(14); }
function randomThirteenTileTenpaiHand() { for (let i=0;i<5000;i++) { const c = makeRandomHand(13); if (shanten(c) === 0 && waitTiles(c).length) return c; } return makeRandomHand(13); }


function parsePokerValue(value) {
  if (value === "" || value === "-" || value === "+") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pokerRawIn(player) { return parsePokerValue(player.in) || 0; }
function pokerRawOut(player) { return parsePokerValue(player.out) || 0; }
function pokerToPt(value) { return value * state.pokerPointRate; }
function pokerNet(player) {
  return pokerToPt(pokerRawOut(player) - pokerRawIn(player));
}

function formatPt(value, forceSign = true) {
  const sign = value > 0 && forceSign ? "+" : "";
  return `${sign}${value.toLocaleString()} pt`;
}

function formatRaw(value) {
  return Number(value).toLocaleString();
}

function selectPokerMemberForPlayer(index, name) {
  state.pokerPlayers[index].name = name;
  state.openPokerMemberSelectIndex = null;
  saveLocal();
  renderPokerPlayers();
  renderPokerResult();
}

function showPokerMemberSelect(index) {
  state.openPokerMemberSelectIndex = state.openPokerMemberSelectIndex === index ? null : index;
  renderPokerPlayers();
}

function renderPokerPlayers() {
  const area = $("pokerPlayers");
  area.innerHTML = "";
  $("pokerMemberOptions").innerHTML = state.pokerMembers.map(name => `<option value="${escapeHTML(name)}"></option>`).join("");

  state.pokerPlayers.forEach((player, index) => {
    const row = document.createElement("div");
    row.className = "poker-row";
    row.innerHTML = `
      <div class="poker-name-line">
        <strong>${index + 1}</strong>
        <input value="${escapeHTML(player.name)}" list="pokerMemberOptions" placeholder="Player name" data-poker-name="${index}">
        <button class="secondary member-select-button" data-poker-member-select="${index}" ${state.pokerMembers.length ? "" : "disabled"}>選択</button>
        <button class="secondary" data-remove-poker-player="${index}" ${state.pokerPlayers.length <= 2 ? "disabled" : ""}>削除</button>
        <div class="member-dropdown ${state.openPokerMemberSelectIndex === index ? "" : "hidden"}" data-poker-member-dropdown="${index}">
          ${state.pokerMembers.length ? state.pokerMembers.map(name => `<button class="member-option" data-poker-member-option="${index}" data-poker-member-name="${escapeAttr(name)}">${escapeHTML(name)}</button>`).join("") : `<span class="muted">登録メンバーなし</span>`}
        </div>
      </div>
      <div class="poker-input-grid">
        <input inputmode="numeric" value="${escapeHTML(player.in)}" placeholder="In" data-poker-in="${index}">
        <input inputmode="numeric" value="${escapeHTML(player.out)}" placeholder="Out" data-poker-out="${index}">
        <div data-poker-net="${index}" class="net-pill ${pokerNet(player) >= 0 ? "ok" : "danger"}">${formatPt(pokerNet(player))}</div>
      </div>
    `;
    area.appendChild(row);
  });

  area.querySelectorAll("[data-poker-name]").forEach(input => input.addEventListener("input", event => {
    state.pokerPlayers[Number(input.dataset.pokerName)].name = event.target.value;
    saveLocal();
    renderPokerResult();
  }));
  area.querySelectorAll("[data-poker-member-select]").forEach(button => button.addEventListener("click", () => {
    showPokerMemberSelect(Number(button.dataset.pokerMemberSelect));
  }));
  area.querySelectorAll("[data-poker-member-option]").forEach(button => button.addEventListener("click", () => {
    selectPokerMemberForPlayer(Number(button.dataset.pokerMemberOption), button.dataset.pokerMemberName);
  }));
  area.querySelectorAll("[data-poker-in]").forEach(input => input.addEventListener("input", event => {
    const index = Number(input.dataset.pokerIn);
    const value = event.target.value.replace(/[^\d+-]/g, "");
    state.pokerPlayers[index].in = value;
    event.target.value = value;
    updatePokerNetPill(index);
    saveLocal();
    renderPokerResult();
  }));
  area.querySelectorAll("[data-poker-out]").forEach(input => input.addEventListener("input", event => {
    const index = Number(input.dataset.pokerOut);
    const value = event.target.value.replace(/[^\d+-]/g, "");
    state.pokerPlayers[index].out = value;
    event.target.value = value;
    updatePokerNetPill(index);
    saveLocal();
    renderPokerResult();
  }));
  area.querySelectorAll("[data-remove-poker-player]").forEach(button => button.addEventListener("click", () => {
    if (state.pokerPlayers.length <= 2) return;
    state.pokerPlayers.splice(Number(button.dataset.removePokerPlayer), 1);
    saveLocal();
    renderPoker();
  }));
}

function updatePokerNetPill(index) {
  const pill = document.querySelector(`[data-poker-net="${index}"]`);
  if (!pill) return;
  const net = pokerNet(state.pokerPlayers[index]);
  pill.className = `net-pill ${net >= 0 ? "ok" : "danger"}`;
  pill.textContent = formatPt(net);
}

function renderPokerMembers() {
  const inputOptions = $("pokerMemberOptions");
  const list = $("pokerMemberList");
  if (!inputOptions || !list) return;
  inputOptions.innerHTML = state.pokerMembers.map(name => `<option value="${escapeHTML(name)}"></option>`).join("");

  if (!state.pokerMembers.length) {
    list.innerHTML = `<p class="muted">登録メンバーはまだありません。</p>`;
    return;
  }

  list.innerHTML = state.pokerMembers.map(name => `
    <span class="member-chip">
      ${escapeHTML(name)}
      <button data-delete-poker-member="${escapeAttr(name)}" class="member-delete">×</button>
    </span>
  `).join("");

  list.querySelectorAll("[data-delete-poker-member]").forEach(button => {
    button.addEventListener("click", () => {
      const name = button.dataset.deletePokerMember;
      state.pokerMembers = state.pokerMembers.filter(member => member !== name);
      saveLocal();
      renderPokerMembers();
      renderPokerPlayers();
    });
  });
}

function addPokerMember() {
  const input = $("pokerMemberNameInput");
  const name = input.value.trim();
  if (!name) return;
  if (!state.pokerMembers.includes(name)) {
    state.pokerMembers.push(name);
    state.pokerMembers.sort((a, b) => a.localeCompare(b, "ja"));
    saveLocal();
  }
  input.value = "";
  renderPokerMembers();
  renderPokerPlayers();
}

function pokerTransfers(players) {
  const debtors = players.filter(p => p.net < 0).map(p => ({ ...p, amount: -p.net }));
  const creditors = players.filter(p => p.net > 0).map(p => ({ ...p, amount: p.net }));
  const transfers = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    if (amount > 0) transfers.push({ from: debtors[i].name, to: creditors[j].name, amount });
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    if (debtors[i].amount === 0) i++;
    if (creditors[j].amount === 0) j++;
  }
  return transfers;
}

function pokerSnapshot() {
  return state.pokerPlayers.map((player, index) => ({
    name: player.name.trim() || `Player ${index + 1}`,
    inRaw: pokerRawIn(player),
    outRaw: pokerRawOut(player),
    inValue: pokerToPt(pokerRawIn(player)),
    outValue: pokerToPt(pokerRawOut(player)),
    net: pokerNet(player),
  }));
}

function renderPokerResult() {
  const players = pokerSnapshot();
  const totalIn = players.reduce((sum, p) => sum + p.inValue, 0);
  const totalOut = players.reduce((sum, p) => sum + p.outValue, 0);
  const totalNet = players.reduce((sum, p) => sum + p.net, 0);
  const transfers = pokerTransfers(players);

  $("pokerResult").innerHTML = `
    <div class="summary-grid">
      <div class="summary-box"><small>Total In</small><strong>${formatPt(totalIn, false)}</strong></div>
      <div class="summary-box"><small>Total Out</small><strong>${formatPt(totalOut, false)}</strong></div>
      <div class="summary-box"><small>Net Check</small><strong class="${totalNet === 0 ? "ok" : "danger"}">${formatPt(totalNet)}</strong></div>
    </div>
    ${players.map(p => `
      <div class="result-row">
        <div class="result-top">
          <strong>${escapeHTML(p.name)}</strong>
          <span class="${p.net >= 0 ? "ok" : "danger"}">${formatPt(p.net)}</span>
        </div>
        <div class="muted">In ${formatRaw(p.inRaw)} → ${formatPt(p.inValue, false)} / Out ${formatRaw(p.outRaw)} → ${formatPt(p.outValue, false)}</div>
      </div>
    `).join("")}
    <h2 style="margin-top:14px;">Transfer</h2>
    ${totalNet !== 0 ? `<p class="danger">Net Check が 0 pt ではありません。In / Out の合計を確認してください。</p>` : ""}
    ${transfers.length ? transfers.map(t => `
      <div class="transfer-row"><strong>${escapeHTML(t.from)} → ${escapeHTML(t.to)}</strong><span>${formatPt(t.amount, false)}</span></div>
    `).join("") : `<p class="muted">Transfer はありません。</p>`}
  `;
}

function renderPokerHistory() {
  const list = $("pokerHistoryList");
  if (!state.pokerHistories.length) {
    list.innerHTML = `<p class="muted">保存された履歴はありません。</p>`;
    return;
  }
  list.innerHTML = state.pokerHistories.map((history, index) => `
    <div class="history-item">
      <div class="result-top">
        <strong>${escapeHTML(history.date)}</strong>
        <button class="secondary" data-delete-poker-history="${index}">削除</button>
      </div>
      ${history.players.map(p => `<div class="muted">${escapeHTML(p.name)}：${formatPt(p.net)}</div>`).join("")}
    </div>
  `).join("");
  list.querySelectorAll("[data-delete-poker-history]").forEach(button => button.addEventListener("click", () => {
    state.pokerHistories.splice(Number(button.dataset.deletePokerHistory), 1);
    saveLocal();
    renderPokerHistory();
  }));
}

function savePokerSession() {
  const players = pokerSnapshot();
  const totalNet = players.reduce((sum, p) => sum + p.net, 0);
  state.pokerHistories.unshift({
    date: new Date().toLocaleString("ja-JP"),
    totalNet,
    players,
    transfers: pokerTransfers(players),
  });
  saveLocal();
  $("pokerSaveMessage").textContent = totalNet === 0 ? "セッションを保存しました。" : "Net Check が 0 pt ではありませんが、セッションを保存しました。";
  renderPokerHistory();
}

function resetPoker() {
  state.openPokerMemberSelectIndex = null;
  state.pokerPlayers = [
    { name: "", in: "", out: "" },
    { name: "", in: "", out: "" },
    { name: "", in: "", out: "" },
    { name: "", in: "", out: "" },
  ];
  $("pokerSaveMessage").textContent = "";
  saveLocal();
  renderPoker();
}

function updatePokerRate(value) {
  const parsed = Number(String(value).replace(/[^\d.]/g, ""));
  state.pokerPointRate = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  const input = $("pokerPointRateInput");
  if (input) input.value = String(state.pokerPointRate);
  saveLocal();
  state.pokerPlayers.forEach((_, index) => updatePokerNetPill(index));
  renderPokerResult();
}

function renderPokerRate() {
  const input = $("pokerPointRateInput");
  if (input) input.value = String(state.pokerPointRate);
}

function renderPoker() {
  renderPokerRate();
  renderPokerMembers();
  renderPokerPlayers();
  renderPokerResult();
  renderPokerHistory();
}

function renderAll() {
  if (state.screen === "score") { renderScoreModeSelector(); renderMembers(); if (!$("players").children.length) renderPlayers(); renderScore(); }
  if (state.screen === "poker") renderPoker();
  if (state.screen === "chinitsu") renderChinitsu();
}


function installDoubleTapZoomGuard() {
  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    event => {
      const target = event.target;
      const isTextEntry = target && target.closest && target.closest("input, textarea, select");
      if (isTextEntry) return;
      const now = Date.now();
      if (now - lastTouchEnd <= 350) {
        event.preventDefault();
      }
      lastTouchEnd = now;
    },
    { passive: false }
  );
}

$("addMemberButton").addEventListener("click", addMember);
$("memberNameInput").addEventListener("keydown", event => {
  if (event.key === "Enter") addMember();
});
$("addPokerMemberButton").addEventListener("click", addPokerMember);
$("pokerMemberNameInput").addEventListener("keydown", event => {
  if (event.key === "Enter") addPokerMember();
});
$("pokerPointRateInput").addEventListener("input", event => {
  const value = event.target.value.replace(/[^\d.]/g, "");
  event.target.value = value;
  updatePokerRate(value);
});
$("pokerRateOneButton").addEventListener("click", () => updatePokerRate(1));
$("pokerRateHundredButton").addEventListener("click", () => updatePokerRate(100));

document.querySelectorAll("[data-score-mode]").forEach(btn => {
  btn.addEventListener("click", () => {
    if (state.scoreMode === btn.dataset.scoreMode) return;
    state.scoreMode = btn.dataset.scoreMode;
    state.scores = ["", "", "", ""];
    state.chips = ["", "", "", ""];
    $("saveMessage").textContent = "";
    renderScoreModeSelector(); renderPlayers(); renderScore();
  });
});
const chipsToggle = $("chipsEnabledToggle");
if (chipsToggle) {
  chipsToggle.addEventListener("change", event => {
    state.chipsEnabled = event.target.checked;
    if (!state.chipsEnabled) state.chips = ["", "", "", ""];
    saveLocal();
    renderScoreModeSelector();
    renderPlayers();
    renderScore();
  });
}
document.querySelectorAll("[data-open]").forEach(btn => btn.addEventListener("click", () => openScreen(btn.dataset.open)));
$("backButton").addEventListener("click", () => openScreen("menu"));
$("saveMatchButton").addEventListener("click", saveMatch);
$("resetScoreButton").addEventListener("click", () => { state.scores = ["", "", "", ""]; state.chips = ["", "", "", ""]; $("saveMessage").textContent = ""; renderPlayers(); renderScore(); });
document.querySelectorAll("[data-chinitsu-main]").forEach(btn => btn.addEventListener("click", () => { state.chinitsuMain = btn.dataset.chinitsuMain; renderChinitsu(); }));
document.querySelectorAll("[data-quiz-mode]").forEach(btn => btn.addEventListener("click", () => { state.quizMode = btn.dataset.quizMode; renderQuiz(); }));
$("analysisReset").addEventListener("click", () => { state.analysisCounts = Array(10).fill(0); renderAnalysis(); });
$("waitCheckReset").addEventListener("click", () => { state.waitCheckCounts = Array(10).fill(0); renderWaitCheck(); });
$("nextDiscardQuiz").addEventListener("click", () => { state.discardQuizCounts = randomFourteenTileHand(); state.discardSelected = null; renderDiscardQuiz(); });
$("submitWaitQuiz").addEventListener("click", () => { state.waitAnswered = true; renderWaitQuiz(); });
$("nextWaitQuiz").addEventListener("click", () => { state.waitQuizCounts = randomThirteenTileTenpaiHand(); state.waitSelected = new Set(); state.waitAnswered = false; renderWaitQuiz(); });

$("addPokerPlayerButton").addEventListener("click", () => {
  state.pokerPlayers.push({ name: "", in: "", out: "" });
  saveLocal();
  renderPoker();
});
$("resetPokerButton").addEventListener("click", resetPoker);
$("savePokerSessionButton").addEventListener("click", savePokerSession);
$("clearPokerHistoryButton").addEventListener("click", () => {
  state.pokerHistories = [];
  saveLocal();
  renderPokerHistory();
});

installDoubleTapZoomGuard();
openScreen("menu");
