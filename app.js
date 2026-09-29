(() => {
  "use strict";

  const CHAPTERS = [
    ["Observer", "Arrivée chez Mme Martin"],
    ["Choisir", "Le placard de Mme Martin"],
    ["Sécuriser", "Les mots utiles"],
    ["Régler", "Le cercle de Sinner"],
    ["Appliquer", "L’ordre des gestes"],
    ["Reconnaître", "Les pictogrammes"],
    ["Préserver", "Les écogestes"],
    ["Réinvestir", "Mission finale"]
  ];
  const MAX_POINTS = [10, 16, 10, 12, 14, 12, 14, 12];
  const PROFILE_KEY = "ediad.profiles.v1";
  const SESSION_PREFIX = "ediad.session.v1.";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const profileScreen = $("#profile-screen");
  const app = $("#app");
  const activity = $("#activity");
  const feedback = $("#feedback");
  let state = null;
  let tickHandle = null;
  let runtime = {};

  function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function cleanName(value) {
    return value.trim().replace(/\s+/g, " ").slice(0, 32);
  }

  function getProfiles() {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || []; }
    catch { return []; }
  }

  function saveProfiles(profiles) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profiles));
  }

  function makeState(profile) {
    return {
      version: 1,
      profileId: profile.id,
      name: profile.name,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      current: 0,
      resumeAt: 0,
      finished: false,
      completed: [],
      chapterScores: {},
      trace: []
    };
  }

  function saveState() {
    if (!state) return;
    state.updatedAt = Date.now();
    localStorage.setItem(SESSION_PREFIX + state.profileId, JSON.stringify(state));
    const profiles = getProfiles();
    const item = profiles.find(p => p.id === state.profileId);
    if (item) {
      item.updatedAt = state.updatedAt;
      item.progress = state.completed.length;
      item.score = scoreTotal();
      saveProfiles(profiles);
    }
  }

  function loadSession(profile) {
    try {
      state = JSON.parse(localStorage.getItem(SESSION_PREFIX + profile.id)) || makeState(profile);
    } catch {
      state = makeState(profile);
    }
    state.name = profile.name;
    if (state.resumeAt == null) state.resumeAt = Math.min(CHAPTERS.length - 1, Math.max(-1, ...(state.completed || [])) + 1);
    saveState();
    openGame();
  }

  function createProfile(name) {
    const profile = { id: uid(), name, createdAt: Date.now(), updatedAt: Date.now(), progress: 0, score: 0 };
    const profiles = getProfiles();
    profiles.push(profile);
    saveProfiles(profiles);
    state = makeState(profile);
    saveState();
    openGame();
  }

  function scoreTotal() {
    if (!state) return 0;
    return Object.values(state.chapterScores || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  }

  function renderSavedProfiles() {
    const profiles = getProfiles().sort((a, b) => b.updatedAt - a.updatedAt);
    const wrap = $("#saved-profiles-wrap");
    const list = $("#saved-profiles");
    list.innerHTML = "";
    wrap.hidden = profiles.length === 0;
    profiles.forEach(profile => {
      const button = document.createElement("button");
      button.className = "saved-profile";
      button.type = "button";
      button.innerHTML = `<b>${escapeHtml(profile.name)}</b><small>${profile.progress || 0}/8 étapes · ${profile.score || 0}/100</small>`;
      button.addEventListener("click", () => loadSession(profile));
      list.append(button);
    });
  }

  function openGame() {
    profileScreen.hidden = true;
    app.hidden = false;
    $("#profile-name").textContent = state.name;
    $("#profile-initial").textContent = state.name.charAt(0).toUpperCase();
    startTimer();
    renderChapterNav();
    goTo(state.resumeAt ?? state.current ?? 0);
  }

  function showProfiles() {
    state = null;
    clearInterval(tickHandle);
    app.hidden = true;
    profileScreen.hidden = false;
    renderSavedProfiles();
    $("#learner-name").focus();
  }

  function startTimer() {
    clearInterval(tickHandle);
    const update = () => {
      if (!state) return;
      const seconds = Math.floor((Date.now() - state.startedAt) / 1000);
      const min = Math.floor(seconds / 60).toString().padStart(2, "0");
      const sec = (seconds % 60).toString().padStart(2, "0");
      $("#elapsed-time").textContent = `${min}:${sec}`;
    };
    update();
    tickHandle = setInterval(update, 1000);
  }

  function renderChapterNav() {
    const nav = $("#chapter-nav");
    nav.innerHTML = "";
    const unlocked = Math.min(CHAPTERS.length - 1, Math.max(-1, ...state.completed) + 1);
    CHAPTERS.forEach((chapter, index) => {
      const button = document.createElement("button");
      const done = state.completed.includes(index);
      button.className = `chapter-button${index === state.current ? " active" : ""}${done ? " done" : ""}`;
      button.type = "button";
      button.disabled = index > unlocked;
      button.innerHTML = `<span>${done ? "✓" : index + 1}</span><small>${chapter[0]}</small>`;
      button.setAttribute("aria-label", `Étape ${index + 1} : ${chapter[1]}${done ? ", terminée" : ""}`);
      button.addEventListener("click", () => goTo(index));
      nav.append(button);
    });
  }

  function updateHeader() {
    const completed = state.completed.length;
    const percent = Math.round(completed / CHAPTERS.length * 100);
    $("#chapter-label").textContent = `Étape ${state.current + 1} sur ${CHAPTERS.length}`;
    $("#progress-percent").textContent = `${percent} %`;
    $("#progress-bar").style.width = `${percent}%`;
    $("#score").textContent = scoreTotal();
    $("#stage-eyebrow").textContent = `Étape ${state.current + 1} · ${CHAPTERS[state.current][0]}`;
    $("#stage-title").textContent = CHAPTERS[state.current][1];
  }

  function goTo(index) {
    const unlocked = Math.min(CHAPTERS.length - 1, Math.max(-1, ...state.completed) + 1);
    if (index > unlocked) return;
    state.current = index;
    runtime = {};
    feedback.hidden = true;
    feedback.className = "feedback";
    saveState();
    updateHeader();
    renderChapterNav();
    const renderers = [renderObservation, renderProducts, renderWords, renderSinner, renderOrder, renderMemory, renderEco, renderFinal];
    renderers[index]();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setDialogue(speaker, text, axelPose = 0, martinPose = 0) {
    $("#speaker").textContent = speaker;
    $("#dialogue-text").textContent = `« ${text} »`;
    const axel = $("#axel-sprite");
    const martin = $("#martin-sprite");
    axel.className = `sprite pose-${axelPose}`;
    martin.className = `sprite pose-${martinPose}`;
    const target = speaker === "Axel" ? $(".character-axel") : $(".character-martin");
    target.classList.remove("react");
    requestAnimationFrame(() => target.classList.add("react"));
  }

  function showFeedback(type, message) {
    feedback.hidden = false;
    feedback.className = `feedback ${type}`;
    feedback.innerHTML = message;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function replaceTrace(entries) {
    const ids = new Set(entries.map(entry => entry.id));
    state.trace = state.trace.filter(entry => !ids.has(entry.id)).concat(entries);
  }

  function completeStage(index, points, traceEntries) {
    if (state.chapterScores[index] == null) state.chapterScores[index] = Math.max(0, Math.min(MAX_POINTS[index], points));
    if (!state.completed.includes(index)) state.completed.push(index);
    state.resumeAt = Math.min(CHAPTERS.length - 1, index + 1);
    replaceTrace(traceEntries);
    saveState();
    updateHeader();
    renderChapterNav();
  }

  function nextButton(label = "Étape suivante") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "action-button";
    button.textContent = label;
    button.addEventListener("click", () => {
      if (state.current < CHAPTERS.length - 1) goTo(state.current + 1);
    });
    return button;
  }

  function renderObservation() {
    setDialogue("Axel", "Mme Martin, par quoi dois-je commencer avant de sortir un produit ?", 1, 0);
    const choices = [
      ["salissure", "La salissure", "Graisse, poussière, calcaire ou microbes", true],
      ["support", "Le support", "Carrelage, inox, bois, textile ou surface fragile", true],
      ["personnes", "Les personnes", "Allergies, asthme, enfants, animaux ou fragilité", true],
      ["environnement", "L’environnement", "Ventilation, dose, rinçage, déchets et habitudes", true],
      ["parfum", "Le parfum le plus fort", "Une odeur marquée ne prouve pas l’efficacité", false],
      ["rapidite", "Le produit qui agit le plus vite", "La vitesse ne remplace pas l’adaptation à la situation", false]
    ];
    activity.innerHTML = `
      <p class="activity-intro">Axel découvre le logement. Sélectionnez tout ce qu’il doit observer avant d’agir.</p>
      <p class="instruction"><span>◉</span><span>Plusieurs réponses sont attendues. Un choix professionnel protège le logement, les personnes et l’environnement.</span></p>
      <div class="choices-grid" id="observation-choices"></div>
      <div class="activity-actions"><button id="check-observation" class="action-button" type="button">Valider mes observations</button></div>`;
    const selected = new Set();
    const grid = $("#observation-choices");
    choices.forEach(([id, title, copy]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice-card";
      button.innerHTML = `<b>${title}</b><small>${copy}</small>`;
      button.addEventListener("click", () => {
        selected.has(id) ? selected.delete(id) : selected.add(id);
        button.classList.toggle("selected");
      });
      button.dataset.id = id;
      grid.append(button);
    });
    $("#check-observation").addEventListener("click", () => {
      if (!selected.size) return showFeedback("error", "Sélectionnez au moins un élément à observer.");
      const correctIds = choices.filter(item => item[3]).map(item => item[0]);
      const correctCount = correctIds.filter(id => selected.has(id)).length;
      const wrongCount = [...selected].filter(id => !correctIds.includes(id)).length;
      $$(".choice-card", grid).forEach(card => {
        const isCorrect = correctIds.includes(card.dataset.id);
        if (isCorrect) card.classList.add("correct");
        else if (selected.has(card.dataset.id)) card.classList.add("wrong");
        card.disabled = true;
      });
      const perfect = correctCount === 4 && wrongCount === 0;
      completeStage(0, perfect ? 10 : Math.max(3, correctCount * 2 - wrongCount), [{
        id: "observation",
        question: "Que faut-il observer avant d’agir ?",
        answer: [...selected].map(id => choices.find(item => item[0] === id)[1]).join(", "),
        correct: "La salissure, le support, les personnes et l’environnement",
        explanation: "Un bon produit s’adapte à la salissure sans altérer le support, ni mettre en danger les personnes ou l’environnement.",
        success: perfect
      }]);
      setDialogue("Mme Martin", perfect ? "Vous avez les bons réflexes, Axel. Observer d’abord évite d’abîmer, de gaspiller ou de mettre quelqu’un en danger." : "Vous avez repéré une partie des critères. Retenez toujours : salissure, support, personnes et environnement.", perfect ? 2 : 1, perfect ? 4 : 1);
      showFeedback(perfect ? "success" : "error", perfect ? "Très bien. Les quatre critères de choix sont réunis." : "À retenir : salissure, support, personnes et environnement. Votre bilan gardera cette correction.");
      const actions = $(".activity-actions");
      actions.innerHTML = "";
      actions.append(nextButton());
    });
  }

  function renderProducts() {
    setDialogue("Mme Martin", "Dans mon placard, chaque produit a une fonction. Saurez-vous les associer sans les confondre ?", 0, 1);
    const products = [
      { id: "detergent", name: "Détergent", sprite: 0 },
      { id: "abrasif", name: "Abrasif", sprite: 1 },
      { id: "detartrant", name: "Vinaigre / détartrant", sprite: 2 },
      { id: "desinfectant", name: "Désinfectant", sprite: 3 },
      { id: "solvant", name: "Solvant", sprite: 4 },
      { id: "savon", name: "Savon noir", sprite: 5 },
      { id: "bicarbonate", name: "Bicarbonate", sprite: 6 },
      { id: "microfibre", name: "Microfibre", sprite: 7 }
    ];
    const targets = [
      ["detergent", "Graisse", "Décolle les salissures grasses et les maintient en suspension"],
      ["abrasif", "Salissure adhérente", "Agit par frottement, avec risque de rayure sur un support fragile"],
      ["detartrant", "Calcaire", "Élimine le tartre, sans jamais être mélangé à la Javel"],
      ["desinfectant", "Microbes", "S’utilise sur une surface préalablement nettoyée"],
      ["solvant", "Peinture ou colle", "Dissout certaines substances dans un local bien ventilé"],
      ["savon", "Sols adaptés", "Nettoie et dégraisse avec une dose mesurée"],
      ["bicarbonate", "Odeurs et taches", "Nettoie, détache et désodorise avec précaution"],
      ["microfibre", "Poussière et entretien courant", "Matériel durable qui limite les lingettes jetables"]
    ];
    runtime.matches = {};
    runtime.activeProduct = null;
    activity.innerHTML = `
      <p class="activity-intro">Rangez chaque produit dans la fonction qui lui correspond. La photo du produit apparaîtra directement dans son emplacement.</p>
      <div class="sorting-steps" aria-label="Mode d’emploi"><span><b>1</b> Choisissez un produit</span><span><b>2</b> Touchez sa fonction</span><span><b>3</b> Vérifiez le rangement</span></div>
      <div class="product-bank-wrap"><div class="match-board-heading"><h3>Les produits à ranger</h3><small>Touchez un produit pour le sélectionner</small></div><div class="product-bank" id="product-bank"></div></div>
      <div class="match-board-heading"><h3>Les fonctions</h3><small id="placement-counter">0 produit sur 8 rangé</small></div>
      <div class="match-targets" id="match-targets"></div>
      <div class="activity-actions"><button id="check-products" class="action-button" type="button">Vérifier les associations</button></div>`;
    const bank = $("#product-bank");
    products.forEach(product => {
      const button = document.createElement("button");
      button.className = "product-card";
      button.type = "button";
      button.draggable = true;
      button.dataset.id = product.id;
      button.innerHTML = `<div class="product-thumb prod-${product.sprite}" role="img" aria-label="${product.name}"></div><b>${product.name}</b>`;
      button.addEventListener("click", () => selectProduct(product.id));
      button.addEventListener("dragstart", event => event.dataTransfer.setData("text/plain", product.id));
      bank.append(button);
    });
    const targetWrap = $("#match-targets");
    targets.forEach(([id, title, copy]) => {
      const target = document.createElement("button");
      target.type = "button";
      target.className = "match-target";
      target.dataset.expected = id;
      target.innerHTML = `<span class="function-product-slot"><span class="slot-placeholder"><b>+</b><small>Placer ici</small></span></span><span class="function-copy"><span class="function-title">${title}</span><span class="function-description">${copy}</span><span class="match-status"></span></span>`;
      target.addEventListener("click", () => {
        if (runtime.activeProduct) assignProduct(target, runtime.activeProduct);
        else if (runtime.matches[target.dataset.expected]) {
          const productId = runtime.matches[target.dataset.expected];
          delete runtime.matches[target.dataset.expected];
          selectProduct(productId);
          renderAssignments();
        }
      });
      target.addEventListener("dragover", event => event.preventDefault());
      target.addEventListener("drop", event => { event.preventDefault(); assignProduct(target, event.dataTransfer.getData("text/plain")); });
      targetWrap.append(target);
    });
    function selectProduct(id) {
      Object.keys(runtime.matches).forEach(key => { if (runtime.matches[key] === id) delete runtime.matches[key]; });
      runtime.activeProduct = id;
      renderAssignments();
    }
    function assignProduct(target, productId) {
      Object.keys(runtime.matches).forEach(key => { if (runtime.matches[key] === productId) delete runtime.matches[key]; });
      runtime.matches[target.dataset.expected] = productId;
      runtime.activeProduct = null;
      renderAssignments();
    }
    function renderAssignments(showCorrections = false) {
      const placedProducts = new Set(Object.values(runtime.matches));
      $$(".match-target", targetWrap).forEach(item => {
        const match = runtime.matches[item.dataset.expected];
        item.classList.toggle("filled", Boolean(match));
        const slot = item.querySelector(".function-product-slot");
        const status = item.querySelector(".match-status");
        if (match) {
          const product = products.find(p => p.id === match);
          slot.innerHTML = `<span class="placed-product"><span class="product-thumb prod-${product.sprite}" role="img" aria-label="${product.name}"></span><b>${product.name}</b><small>Touchez pour déplacer</small></span>`;
          item.setAttribute("aria-label", `${targets.find(t => t[0] === item.dataset.expected)[1]} : ${product.name}`);
        } else {
          slot.innerHTML = `<span class="slot-placeholder"><b>+</b><small>Placer ici</small></span>`;
          item.setAttribute("aria-label", `${targets.find(t => t[0] === item.dataset.expected)[1]} : emplacement vide`);
        }
        status.innerHTML = "";
        if (showCorrections) {
          const ok = match === item.dataset.expected;
          const correctProduct = products.find(p => p.id === item.dataset.expected);
          status.innerHTML = ok
            ? `<span class="status-ok">✓ Bien rangé</span>`
            : `<span class="status-fix"><span class="product-thumb prod-${correctProduct.sprite}" aria-hidden="true"></span><span>Correction : <b>${correctProduct.name}</b></span></span>`;
        }
      });
      $$(".product-card", bank).forEach(card => {
        const active = card.dataset.id === runtime.activeProduct;
        card.classList.toggle("active", active);
        card.classList.toggle("placed", placedProducts.has(card.dataset.id));
        card.setAttribute("aria-pressed", active ? "true" : "false");
      });
      const count = Object.keys(runtime.matches).length;
      $("#placement-counter").textContent = `${count} produit${count > 1 ? "s" : ""} sur 8 rangé${count > 1 ? "s" : ""}`;
    }
    renderAssignments();
    $("#check-products").addEventListener("click", () => {
      if (Object.keys(runtime.matches).length < products.length) return showFeedback("error", "Placez les huit éléments avant de vérifier.");
      let correct = 0;
      $$(".match-target", targetWrap).forEach(target => {
        const ok = runtime.matches[target.dataset.expected] === target.dataset.expected;
        target.classList.add(ok ? "correct" : "wrong");
        if (ok) correct++;
        target.disabled = true;
      });
      $$(".product-card", bank).forEach(card => card.disabled = true);
      renderAssignments(true);
      const entries = targets.map(([id, title, copy]) => ({
        id: `product-${id}`,
        question: `Quel élément convient pour : ${title} ?`,
        answer: products.find(p => p.id === runtime.matches[id])?.name || "Aucune réponse",
        correct: products.find(p => p.id === id).name,
        explanation: copy,
        success: runtime.matches[id] === id
      }));
      const points = Math.round(correct / products.length * 16);
      completeStage(1, points, entries);
      setDialogue(correct === 8 ? "Axel" : "Mme Martin", correct === 8 ? "Je comprends : la fonction du produit vient avant sa puissance supposée." : "Vous progressez. Relisez surtout les différences entre nettoyer, détartrer et désinfecter.", correct === 8 ? 4 : 1, correct === 8 ? 4 : 3);
      showFeedback(correct === 8 ? "success" : "error", `${correct} association${correct > 1 ? "s" : ""} correcte${correct > 1 ? "s" : ""} sur 8. Les corrections figureront dans votre bilan.`);
      const actions = $(".activity-actions"); actions.innerHTML = ""; actions.append(nextButton());
    });
  }

  function renderWords() {
    const words = [
      ["DOSAGE", "Quantité de produit recommandée par le fabricant.", "Respecter la dose évite le gaspillage, un rinçage difficile et la pollution des eaux."],
      ["RINCAGE", "Étape qui enlève les résidus de produit avec de l’eau claire.", "Le rinçage élimine les résidus. Il est obligatoire pour les surfaces en contact avec les aliments."],
      ["ETIQUETTE", "Partie de l’emballage à lire avant toute utilisation.", "Une étiquette lisible indique le rôle, la dose, le temps d’action, les risques et les conduites à tenir."],
      ["VENTILER", "Action qui renouvelle l’air d’une pièce pendant le nettoyage.", "Une bonne ventilation limite l’exposition aux vapeurs et aux composés organiques volatils."]
    ];
    runtime.wordIndex = 0;
    runtime.results = [];
    setDialogue("Axel", "Mme Martin, quels mots dois-je garder en tête pour utiliser les produits sans danger ?", 1, 1);
    function drawWord() {
      const [word] = words[runtime.wordIndex];
      runtime.guessed = new Set([word[0]]);
      runtime.misses = 0;
      activity.innerHTML = `<p class="activity-intro">Trouvez quatre mots de sécurité grâce à leur définition. La première lettre est déjà donnée et vous pouvez demander une lettre supplémentaire.</p><div id="hangman"></div>`;
      updateWord();
    }
    function updateWord() {
      const [word, clue, explanation] = words[runtime.wordIndex];
      const solved = [...word].every(letter => runtime.guessed.has(letter));
      const failed = runtime.misses >= 6;
      const display = [...word].map(letter => `<span class="letter-slot">${runtime.guessed.has(letter) || failed ? letter : ""}</span>`).join("");
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      $("#hangman").innerHTML = `
        <div class="hangman-board">
          <div class="word-help-card"><span>Mot ${runtime.wordIndex + 1} sur ${words.length}</span><strong>${word.length} lettres</strong><small>${6 - runtime.misses} essai${6 - runtime.misses > 1 ? "s" : ""} restant${6 - runtime.misses > 1 ? "s" : ""}</small></div>
          <div><p class="question-count">Quel mot correspond à cette définition ?</p><div class="word-clue"><b>Indice</b><span>${clue}</span></div><div class="word-display" aria-label="Mot de ${word.length} lettres">${display}</div>${!solved && !failed ? `<div class="word-help-actions"><button id="reveal-letter" class="hint-button" type="button">Révéler une lettre</button><button id="reveal-word" class="hint-button secondary-hint" type="button">Afficher le mot si je suis bloqué</button></div>` : ""}<div class="keyboard">${[...alphabet].map(letter => `<button class="key" type="button" data-letter="${letter}" ${runtime.guessed.has(letter) || solved || failed ? "disabled" : ""}>${letter}</button>`).join("")}</div>${solved || failed ? `<div class="unlock-note"><strong>${word}</strong><br>${explanation}</div>` : ""}</div>
        </div>
        <div class="activity-actions">${solved || failed ? `<button id="next-word" class="action-button" type="button">${runtime.wordIndex === words.length - 1 ? "Terminer l’étape" : "Mot suivant"}</button>` : ""}</div>`;
      const revealButton = $("#reveal-letter");
      if (revealButton) revealButton.addEventListener("click", () => {
        const hiddenLetters = [...new Set([...word].filter(letter => !runtime.guessed.has(letter)))];
        if (hiddenLetters.length) runtime.guessed.add(hiddenLetters[0]);
        updateWord();
      });
      const revealWordButton = $("#reveal-word");
      if (revealWordButton) revealWordButton.addEventListener("click", () => {
        [...word].forEach(letter => runtime.guessed.add(letter));
        updateWord();
      });
      $$(".key").forEach(key => key.addEventListener("click", () => {
        const letter = key.dataset.letter;
        runtime.guessed.add(letter);
        if (!word.includes(letter)) {
          runtime.misses++;
          setDialogue("Mme Martin", "Prenez le temps d’observer les lettres. En sécurité, la précipitation n’aide jamais.", 3, 3);
        }
        updateWord();
      }));
      if (solved || failed) {
        const success = solved;
        if (!runtime.results[runtime.wordIndex]) runtime.results[runtime.wordIndex] = { word, explanation, success, misses: runtime.misses };
        setDialogue(success ? "Axel" : "Mme Martin", success ? `J’ai trouvé ${word}. Je retiens surtout son utilité dans l’intervention.` : `Le mot était ${word}. Vous le retrouverez dans le bilan pour le mémoriser.`, success ? 2 : 1, success ? 4 : 1);
        $("#next-word").addEventListener("click", () => {
          if (runtime.wordIndex < words.length - 1) { runtime.wordIndex++; drawWord(); }
          else {
            const successes = runtime.results.filter(r => r.success).length;
            completeStage(2, Math.round(successes / words.length * 10), runtime.results.map((result, index) => ({
              id: `word-${index}`,
              question: `Mot de sécurité ${index + 1}`,
              answer: result.success ? result.word : "Mot non trouvé",
              correct: result.word,
              explanation: result.explanation,
              success: result.success
            })));
            activity.innerHTML += "";
            const actions = $(".activity-actions"); actions.innerHTML = ""; actions.append(nextButton());
            showFeedback(successes === 4 ? "success" : "error", `${successes} mot${successes > 1 ? "s" : ""} trouvé${successes > 1 ? "s" : ""} sur 4.`);
          }
        });
      }
    }
    drawWord();
  }

  function renderSinner() {
    setDialogue("Mme Martin", "Les quatre facteurs travaillent ensemble. Si l’un diminue, vous devez ajuster les autres sans créer de risque.", 0, 0);
    const factors = [
      ["Dosage", "La juste quantité indiquée sur l’étiquette."],
      ["Température", "La température adaptée au produit et au support."],
      ["Temps d’action", "La durée pendant laquelle le produit doit agir."],
      ["Action mécanique", "Le frottement produit par le geste ou le matériel."]
    ];
    runtime.reviewedFactors = new Set();
    runtime.scenario = null;
    activity.innerHTML = `
      <p class="activity-intro">Le résultat du nettoyage dépend de quatre facteurs. Touchez chaque carte pour lire son rôle, puis résolvez la situation d’Axel.</p>
      <div class="sinner-layout">
        <div class="sinner-diagram" aria-label="Les quatre facteurs du cercle de Sinner"><div class="sinner-result"><small>OBJECTIF</small><strong>Un nettoyage efficace</strong></div><div class="factor-grid">${factors.map(([factor, description], i) => `<button class="factor-card" type="button" data-factor="${factor}" data-description="${description}"><span>${i + 1}</span><strong>${factor}</strong><small>${description}</small><em>Toucher pour retenir</em></button>`).join("")}</div><p id="factor-message" class="factor-message">Commencez par consulter les quatre facteurs.</p></div>
        <div class="scenario-box"><span class="scenario-label">MISE EN SITUATION</span><h3>Quel facteur Axel a-t-il oublié ?</h3><p>Axel pulvérise le produit puis l’essuie immédiatement. La dose et la température sont correctes.</p><div class="scenario-callout"><b>Le mot important :</b> « immédiatement »</div><div class="scenario-options">${factors.map(([factor]) => `<button class="secondary-button sinner-answer" type="button" data-answer="${factor}">${factor}</button>`).join("")}</div><div id="scenario-feedback" class="scenario-feedback" aria-live="polite">Choisissez une réponse : une explication apparaîtra ici immédiatement.</div></div>
      </div>
      <div class="activity-actions"><button id="show-sinner-answer" class="text-button" type="button">Je suis bloqué : voir la correction</button><button id="check-sinner" class="action-button" type="button">Valider ma réponse</button></div>`;
    $$(".factor-card").forEach(button => button.addEventListener("click", () => {
      runtime.reviewedFactors.add(button.dataset.factor);
      button.classList.add("reviewed");
      button.querySelector("em").textContent = "✓ Facteur consulté";
      $("#factor-message").innerHTML = `<strong>${button.dataset.factor} :</strong> ${button.dataset.description}<br><small>${runtime.reviewedFactors.size} facteur${runtime.reviewedFactors.size > 1 ? "s" : ""} consulté${runtime.reviewedFactors.size > 1 ? "s" : ""} sur 4</small>`;
    }));
    $$(".sinner-answer").forEach(button => button.addEventListener("click", () => {
      runtime.scenario = button.dataset.answer;
      const isCorrect = runtime.scenario === "Temps d’action";
      $$(".sinner-answer").forEach(b => {
        b.classList.remove("selected", "answer-correct", "answer-wrong");
        b.removeAttribute("aria-current");
      });
      button.classList.add("selected", isCorrect ? "answer-correct" : "answer-wrong");
      button.setAttribute("aria-current", "true");
      const wrongHints = {
        "Dosage": "La situation précise que la dose est correcte.",
        "Température": "La situation précise que la température est correcte.",
        "Action mécanique": "Le problème survient avant le frottement : Axel essuie le produit trop tôt."
      };
      const message = $("#scenario-feedback");
      message.className = `scenario-feedback ${isCorrect ? "correct" : "incorrect"}`;
      message.innerHTML = isCorrect
        ? `<strong>✓ Bonne réponse : le temps d’action.</strong><span>Axel doit laisser agir le produit pendant la durée indiquée sur l’étiquette avant de l’essuyer.</span>`
        : `<strong>✕ Ce n’est pas la bonne réponse.</strong><span>${wrongHints[runtime.scenario]} Relisez le mot « immédiatement » puis essayez encore.</span>`;
      $("#check-sinner").textContent = isCorrect ? "Continuer" : "Valider ma réponse";
    }));
    function finishSinner(scenarioOk, usedCorrection = false) {
      completeStage(3, scenarioOk && !usedCorrection ? 12 : 8, [{
        id: "sinner-factors", question: "Quels sont les quatre facteurs du cercle de Sinner ?", answer: factors.map(([factor]) => factor).join(", "), correct: factors.map(([factor]) => factor).join(", "), explanation: "Les quatre facteurs sont interdépendants.", success: true
      }, {
        id: "sinner-scenario", question: "Le produit est essuyé immédiatement : quel facteur manque ?", answer: usedCorrection ? "Correction affichée" : runtime.scenario, correct: "Temps d’action", explanation: "Les réactions chimiques ne sont pas instantanées. Le temps indiqué sur l’étiquette doit être respecté.", success: scenarioOk
      }]);
      setDialogue(scenarioOk && !usedCorrection ? "Axel" : "Mme Martin", scenarioOk && !usedCorrection ? "Je dois laisser au produit son temps d’action, sans compenser par un surdosage." : "Le facteur manquant était le temps d’action. Augmenter la dose n’aurait pas corrigé cette erreur.", scenarioOk && !usedCorrection ? 4 : 3, scenarioOk && !usedCorrection ? 4 : 3);
      showFeedback(scenarioOk && !usedCorrection ? "success" : "error", scenarioOk && !usedCorrection ? "Bonne réponse : Axel doit respecter le temps d’action." : "Correction : il fallait choisir « Temps d’action ». Vous pouvez maintenant continuer.");
      const actions = $(".activity-actions"); actions.innerHTML = ""; actions.append(nextButton());
    }
    $("#show-sinner-answer").addEventListener("click", () => finishSinner(false, true));
    $("#check-sinner").addEventListener("click", () => {
      if (!runtime.scenario) return showFeedback("error", "Choisissez un facteur, ou utilisez « voir la correction » pour continuer.");
      const scenarioOk = runtime.scenario === "Temps d’action";
      finishSinner(scenarioOk);
    });
  }

  function renderOrder() {
    setDialogue("Axel", "Je dois organiser mes gestes pour ne pas salir ce que je viens de nettoyer et pour éviter tout mélange dangereux.", 1, 0);
    const sequences = {
      room: [
        ["high", "Commencer par les surfaces en hauteur"],
        ["clean", "Traiter les zones les plus propres"],
        ["dirty", "Poursuivre vers les zones les plus sales"],
        ["far", "Laver le sol au fond de la pièce"],
        ["door", "Terminer près de la sortie"]
      ],
      wc: [
        ["clean", "Nettoyer la cuvette"],
        ["descale", "Détartrer si nécessaire"],
        ["rinse", "Évacuer le produit et rincer"],
        ["disinfect", "Désinfecter la surface propre"],
        ["contact", "Respecter le temps de contact et le rinçage indiqué"]
      ]
    };
    runtime.orders = { room: [sequences.room[2], sequences.room[0], sequences.room[4], sequences.room[1], sequences.room[3]], wc: [sequences.wc[3], sequences.wc[0], sequences.wc[2], sequences.wc[4], sequences.wc[1]] };
    activity.innerHTML = `<p class="activity-intro">Remettez les cartes dans l’ordre. Utilisez les flèches ou glissez-les.</p><div class="sequence-wrap"><div class="sequence-panel"><h3>Entretien d’une pièce</h3><div class="sortable-list" data-list="room"></div></div><div class="sequence-panel"><h3>WC entartrés à désinfecter</h3><div class="sortable-list" data-list="wc"></div></div></div><div class="activity-actions"><button id="check-order" class="action-button" type="button">Vérifier l’ordre</button></div>`;
    function drawLists() {
      $$(".sortable-list").forEach(list => {
        const key = list.dataset.list;
        list.innerHTML = "";
        runtime.orders[key].forEach((item, index) => {
          const row = document.createElement("div");
          row.className = "sortable-item";
          row.draggable = true;
          row.dataset.index = index;
          row.innerHTML = `<span class="order-number">${index + 1}</span><span>${item[1]}</span><button type="button" aria-label="Monter cette étape">↑</button><button type="button" aria-label="Descendre cette étape">↓</button>`;
          const [up, down] = $$('button', row);
          up.addEventListener("click", () => move(key, index, -1));
          down.addEventListener("click", () => move(key, index, 1));
          row.addEventListener("dragstart", event => event.dataTransfer.setData("text/plain", `${key}:${index}`));
          row.addEventListener("dragover", event => event.preventDefault());
          row.addEventListener("drop", event => {
            event.preventDefault();
            const [fromKey, fromIndex] = event.dataTransfer.getData("text/plain").split(":");
            if (fromKey !== key) return;
            const [picked] = runtime.orders[key].splice(Number(fromIndex), 1);
            runtime.orders[key].splice(index, 0, picked);
            drawLists();
          });
          list.append(row);
        });
      });
    }
    function move(key, index, delta) {
      const target = index + delta;
      if (target < 0 || target >= runtime.orders[key].length) return;
      [runtime.orders[key][index], runtime.orders[key][target]] = [runtime.orders[key][target], runtime.orders[key][index]];
      drawLists();
    }
    drawLists();
    $("#check-order").addEventListener("click", () => {
      const roomOk = runtime.orders.room.every((item, i) => item[0] === sequences.room[i][0]);
      const wcOk = runtime.orders.wc.every((item, i) => item[0] === sequences.wc[i][0]);
      completeStage(4, (roomOk ? 7 : 2) + (wcOk ? 7 : 2), [{
        id: "order-room", question: "Quel ordre suivre dans une pièce ?", answer: runtime.orders.room.map(i => i[1]).join(" ; "), correct: sequences.room.map(i => i[1]).join(" ; "), explanation: "On travaille du haut vers le bas, du plus propre vers le plus sale et du plus loin vers le plus près.", success: roomOk
      }, {
        id: "order-wc", question: "Quel ordre suivre pour des WC entartrés à désinfecter ?", answer: runtime.orders.wc.map(i => i[1]).join(" ; "), correct: sequences.wc.map(i => i[1]).join(" ; "), explanation: "Le détartrant et le désinfectant ne s’utilisent jamais ensemble. Il faut évacuer et rincer entre les deux produits.", success: wcOk
      }]);
      setDialogue(roomOk && wcOk ? "Mme Martin" : "Axel", roomOk && wcOk ? "Votre méthode est sûre : vous évitez de resalir et vous séparez les produits." : "Je retiens surtout qu’entre le détartrant et le désinfectant, je dois évacuer et rincer.", roomOk && wcOk ? 2 : 1, roomOk && wcOk ? 4 : 3);
      showFeedback(roomOk && wcOk ? "success" : "error", `${roomOk ? "Ordre de la pièce correct" : "Ordre de la pièce à revoir"}. ${wcOk ? "Séquence WC correcte" : "Séquence WC à revoir"}.`);
      const actions = $(".activity-actions"); actions.innerHTML = ""; actions.append(nextButton());
    });
  }

  function renderMemory() {
    setDialogue("Mme Martin", "Ces losanges rouges alertent immédiatement. Associez chaque pictogramme au bon comportement.", 0, 1);
    const pairs = [
      ["toxic", "toxic.png", "Toxique même à faible dose", "Éviter toute inhalation, ingestion ou contact. Suivre strictement l’étiquette."],
      ["irritant", "irritant.png", "Irritant ou nocif", "Porter les protections indiquées et éviter le contact avec la peau et les yeux."],
      ["environment", "environment.png", "Dangereux pour l’environnement", "Respecter la dose et la filière d’élimination. Ne pas rejeter dans la nature."],
      ["flammable", "flammable.png", "Inflammable", "Tenir éloigné des flammes, étincelles et sources de chaleur."]
    ];
    const cards = pairs.flatMap(pair => [
      { pair: pair[0], type: "image", content: pair[1], label: pair[2] },
      { pair: pair[0], type: "text", content: pair[2], label: pair[2] }
    ]).sort(() => Math.random() - .5);
    runtime.flipped = [];
    runtime.matched = new Set();
    runtime.locked = false;
    runtime.attempts = 0;
    activity.innerHTML = `<p class="activity-intro">Retournez deux cartes. Une paire réunit un pictogramme normalisé et sa signification.</p><div class="memory-grid" id="memory-grid"></div>`;
    const grid = $("#memory-grid");
    cards.forEach((card, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "memory-card";
      button.dataset.index = index;
      button.setAttribute("aria-label", `Carte ${index + 1}, face cachée`);
      const back = card.type === "image" ? `<img src="${card.content}" alt="${card.label}">` : `<strong>${card.content}</strong>`;
      button.innerHTML = `<span class="memory-card-inner"><span class="memory-face memory-front">?</span><span class="memory-face memory-back">${back}</span></span>`;
      button.addEventListener("click", () => flip(index, button));
      grid.append(button);
    });
    function flip(index, button) {
      if (runtime.locked || button.classList.contains("flipped") || button.classList.contains("matched")) return;
      button.classList.add("flipped");
      button.setAttribute("aria-label", cards[index].label);
      runtime.flipped.push(index);
      if (runtime.flipped.length < 2) return;
      runtime.locked = true;
      runtime.attempts++;
      const [a, b] = runtime.flipped;
      if (cards[a].pair === cards[b].pair) {
        setTimeout(() => {
          [a,b].forEach(i => grid.children[i].classList.add("matched"));
          runtime.matched.add(cards[a].pair);
          runtime.flipped = [];
          runtime.locked = false;
          setDialogue("Axel", `Je reconnais maintenant le pictogramme : ${pairs.find(p => p[0] === cards[a].pair)[2].toLowerCase()}.`, 2, 4);
          if (runtime.matched.size === pairs.length) finishMemory();
        }, 450);
      } else {
        setTimeout(() => {
          [a,b].forEach(i => grid.children[i].classList.remove("flipped"));
          runtime.flipped = [];
          runtime.locked = false;
          setDialogue("Mme Martin", "Ces deux cartes ne vont pas ensemble. Regardez la forme noire au centre du losange.", 1, 1);
        }, 800);
      }
    }
    function finishMemory() {
      const points = runtime.attempts <= 6 ? 12 : runtime.attempts <= 9 ? 10 : 8;
      completeStage(5, points, pairs.map((pair, index) => ({
        id: `picto-${index}`, question: `Signification du pictogramme ${pair[2]}`, answer: pair[2], correct: pair[2], explanation: pair[3], success: true
      })));
      showFeedback("success", `Les quatre pictogrammes sont associés en ${runtime.attempts} essais.`);
      const actions = document.createElement("div"); actions.className = "activity-actions"; actions.append(nextButton()); activity.append(actions);
    }
  }

  function renderEco() {
    setDialogue("Axel", "Je veux être efficace sans gaspiller l’eau, l’énergie ni le matériel de Mme Martin.", 0, 0);
    const zones = [
      { id: "cuisine", icon: "🍳", title: "Cuisine", choices: [
        ["cover", "Couvrir les casseroles et adapter leur taille au foyer", true],
        ["water", "Laisser couler l’eau pendant toute la vaisselle", false],
        ["cool", "Laisser refroidir un plat avant de le placer au réfrigérateur", true],
        ["mix", "Mélanger les restes de produits pour finir les flacons", false]
      ]},
      { id: "buanderie", icon: "🧺", title: "Buanderie", choices: [
        ["full", "Lancer le lave-linge lorsqu’il est bien rempli", true],
        ["eco", "Privilégier un programme éco à basse température quand le linge le permet", true],
        ["hot", "Choisir 90 °C pour chaque cycle", false],
        ["wipe", "Utiliser des lingettes jetables pour tout l’entretien", false]
      ]},
      { id: "salle", icon: "🚿", title: "Salle de bain", choices: [
        ["air", "Aérer au moins 10 minutes sans obstruer les grilles", true],
        ["dose", "Respecter la juste dose et employer une microfibre", true],
        ["bleach", "Mélanger Javel et vinaigre pour gagner du temps", false],
        ["disinfect", "Désinfecter systématiquement chaque surface", false]
      ]}
    ];
    runtime.zoneIndex = 0;
    runtime.zoneAnswers = {};
    activity.innerHTML = `<p class="activity-intro">Parcourez les trois zones du logement et sélectionnez les deux écogestes adaptés dans chacune.</p><div id="eco-game"></div>`;
    function drawZone() {
      const zone = zones[runtime.zoneIndex];
      const selected = runtime.zoneAnswers[zone.id] || new Set();
      $("#eco-game").innerHTML = `<div class="zone-tabs">${zones.map((z, i) => `<button class="zone-tab ${i === runtime.zoneIndex ? "active" : ""}" type="button" disabled>${i + 1}. ${z.title}</button>`).join("")}</div><div class="home-zone"><div class="zone-scene"><div class="zone-icon" aria-hidden="true">${zone.icon}</div><div><p class="question-count">Zone ${runtime.zoneIndex + 1} sur ${zones.length}</p><h3>${zone.title}</h3><div class="eco-options">${zone.choices.map(choice => `<button class="eco-option ${selected.has(choice[0]) ? "selected" : ""}" type="button" data-id="${choice[0]}">${choice[1]}</button>`).join("")}</div></div></div></div><div class="activity-actions"><button id="validate-zone" class="action-button" type="button">${runtime.zoneIndex === zones.length - 1 ? "Terminer le défi" : "Valider cette zone"}</button></div>`;
      $$(".eco-option").forEach(button => button.addEventListener("click", () => {
        if (selected.has(button.dataset.id)) selected.delete(button.dataset.id); else if (selected.size < 2) selected.add(button.dataset.id);
        runtime.zoneAnswers[zone.id] = selected;
        button.classList.toggle("selected", selected.has(button.dataset.id));
      }));
      $("#validate-zone").addEventListener("click", () => {
        if (selected.size !== 2) return showFeedback("error", "Choisissez exactement deux gestes dans cette zone.");
        feedback.hidden = true;
        if (runtime.zoneIndex < zones.length - 1) { runtime.zoneIndex++; drawZone(); }
        else finishEco();
      });
    }
    function finishEco() {
      let correct = 0;
      const entries = [];
      zones.forEach(zone => {
        const selected = runtime.zoneAnswers[zone.id] || new Set();
        const expected = zone.choices.filter(c => c[2]).map(c => c[0]);
        const ok = expected.every(id => selected.has(id)) && selected.size === expected.length;
        if (ok) correct++;
        entries.push({
          id: `eco-${zone.id}`, question: `Quels écogestes choisir dans la zone ${zone.title} ?`,
          answer: zone.choices.filter(c => selected.has(c[0])).map(c => c[1]).join(" ; "),
          correct: zone.choices.filter(c => c[2]).map(c => c[1]).join(" ; "),
          explanation: "Un écogeste réduit l’impact sur la santé et les ressources sans diminuer la qualité du service.", success: ok
        });
      });
      completeStage(6, Math.round(correct / zones.length * 14), entries);
      setDialogue(correct === 3 ? "Mme Martin" : "Axel", correct === 3 ? "Vous avez choisi des gestes efficaces et raisonnables. C’est exactement l’esprit professionnel attendu." : "Je vais revoir les choix : juste dose, aération, matériel durable et économies de ressources.", correct === 3 ? 4 : 1, correct === 3 ? 4 : 1);
      showFeedback(correct === 3 ? "success" : "error", `${correct} zone${correct > 1 ? "s" : ""} parfaitement maîtrisée${correct > 1 ? "s" : ""} sur 3.`);
      $("#eco-game .activity-actions").innerHTML = "";
      $("#eco-game .activity-actions").append(nextButton("Mission finale"));
    }
    drawZone();
  }

  function renderFinal() {
    if (state.finished) {
      const finalCorrect = state.trace.filter(entry => entry.id.startsWith("final-") && entry.success).length;
      renderResults(finalCorrect);
      return;
    }
    const questions = [
      { key: "salissure", q: "Le plan de travail est gras. Quelle fonction de produit recherchez-vous d’abord ?", options: ["Un détergent adapté", "Un désinfectant seul", "Un abrasif dur"], answer: 0, exp: "Le détergent décolle les salissures grasses. Un rinçage est nécessaire si la surface entre en contact avec des aliments." },
      { key: "support", q: "Une robinetterie fragile porte du calcaire. Quel réflexe protège le support ?", options: ["Choisir le produit le plus acide", "Vérifier la compatibilité du détartrant et tester discrètement", "Frotter avec un abrasif dur"], answer: 1, exp: "Le bon produit ne doit pas altérer le support. Il faut vérifier les consignes et éviter les abrasifs inadaptés." },
      { key: "risque", q: "L’étiquette d’un flacon est illisible. Que faites-vous ?", options: ["Vous sentez le produit pour l’identifier", "Vous l’utilisez en petite quantité", "Vous ne l’utilisez pas et vous signalez la situation"], answer: 2, exp: "Sans étiquette lisible, les risques, la dose et les conduites à tenir sont inconnus." },
      { key: "methode", q: "Le sol vient d’être lavé. Où devez-vous terminer ?", options: ["Au fond de la pièce", "Près de la sortie", "Au centre de la pièce"], answer: 1, exp: "On travaille du plus loin vers le plus près pour ne pas marcher sur le sol propre." },
      { key: "impact", q: "Le sol est peu sale et aucun risque particulier n’est signalé. Quel choix est le plus juste ?", options: ["Désinfecter avec une dose renforcée", "Nettoyer avec la juste dose sans surdésinfecter", "Mélanger deux produits pour réduire le temps"], answer: 1, exp: "Un nettoyage rationalisé limite le gaspillage, la pollution et l’exposition inutile aux produits." }
    ];
    runtime.questionIndex = 0;
    runtime.finalAnswers = [];
    setDialogue("Axel", "Mme Martin, je vais reprendre mes cinq questions : salissure, support, risque, méthode et impact.", 4, 4);
    function drawQuestion() {
      const item = questions[runtime.questionIndex];
      activity.innerHTML = `<div class="final-card"><p class="question-count">Question ${runtime.questionIndex + 1} sur ${questions.length} · ${item.key}</p><h3>${item.q}</h3><div class="final-options">${item.options.map((option, i) => `<button class="final-option" type="button" data-index="${i}">${option}</button>`).join("")}</div><div class="activity-actions"><button id="validate-final" class="action-button" type="button" disabled>${runtime.questionIndex === questions.length - 1 ? "Voir mon bilan" : "Question suivante"}</button></div></div>`;
      let selected = null;
      $$(".final-option").forEach(button => button.addEventListener("click", () => {
        selected = Number(button.dataset.index);
        $$(".final-option").forEach(b => b.classList.toggle("selected", b === button));
        $("#validate-final").disabled = false;
      }));
      $("#validate-final").addEventListener("click", () => {
        runtime.finalAnswers.push(selected);
        if (runtime.questionIndex < questions.length - 1) { runtime.questionIndex++; drawQuestion(); }
        else finishFinal();
      });
    }
    function finishFinal() {
      const correct = runtime.finalAnswers.filter((answer, i) => answer === questions[i].answer).length;
      const entries = questions.map((item, index) => ({
        id: `final-${item.key}`, question: item.q, answer: item.options[runtime.finalAnswers[index]], correct: item.options[item.answer], explanation: item.exp, success: runtime.finalAnswers[index] === item.answer
      }));
      state.finished = true;
      completeStage(7, Math.round(correct / questions.length * 12), entries);
      renderResults(correct);
    }
    drawQuestion();
  }

  function renderResults(finalCorrect) {
    const score = scoreTotal();
    const strengths = [
      ["Observer avant d’agir", state.chapterScores[0] >= 8],
      ["Choisir le bon produit", state.chapterScores[1] >= 12],
      ["Sécuriser l’utilisation", (state.chapterScores[2] || 0) + (state.chapterScores[5] || 0) >= 17],
      ["Appliquer la bonne méthode", (state.chapterScores[3] || 0) + (state.chapterScores[4] || 0) >= 19],
      ["Intégrer les écogestes", state.chapterScores[6] >= 10]
    ];
    setDialogue("Mme Martin", score >= 75 ? "Vous pouvez être fier de votre méthode, Axel. Vous choisissez, vous sécurisez et vous justifiez vos gestes." : "Vous avez posé de bonnes bases, Axel. Votre bilan vous indique précisément les points à reprendre.", score >= 75 ? 4 : 1, score >= 75 ? 4 : 1);
    activity.innerHTML = `
      <div class="result-hero"><div class="score-ring" style="--score-angle:${score}%"><strong>${score}/100</strong></div><div><p class="eyebrow">Mission terminée</p><h2>Bravo, ${escapeHtml(state.name)} !</h2><p>Vous avez répondu correctement à ${finalCorrect} des 5 situations finales. Votre bilan reprend vos réponses et les corrections utiles.</p></div></div>
      <div class="skills-list">${strengths.map(([label, ok]) => `<div class="skill-line"><span>${ok ? "✓" : "↻"}</span><div><b>${label}</b><small>${ok ? "Compétence réussie" : "Point à consolider"}</small></div></div>`).join("")}</div>
      <p class="instruction"><span>ⓘ</span><span>Le fichier PDF est créé directement dans votre navigateur. Il contient votre identifiant, la date, chaque question, votre réponse, la correction et l’explication.</span></p>
      <div class="activity-actions"><button id="replay" class="secondary-button" type="button">Revoir le parcours</button><button id="download-report" class="action-button" type="button">Télécharger mon bilan PDF</button></div>
      <p class="privacy-note">Sources pédagogiques : supports EDIAD « Produits de nettoyage et de désinfection » et « Les écogestes ».</p>`;
    $("#download-report").addEventListener("click", downloadReport);
    $("#replay").addEventListener("click", () => goTo(0));
  }

  function wrapText(text, limit = 92) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = "";
    words.forEach(word => {
      if ((line + " " + word).trim().length > limit) { if (line) lines.push(line); line = word; }
      else line = (line + " " + word).trim();
    });
    if (line) lines.push(line);
    return lines;
  }

  function latin1(text) {
    return String(text)
      .replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...")
      .replace(/[–—]/g, "-").replace(/œ/g, "oe").replace(/Œ/g, "OE")
      .replace(/[^\x00-\xFF]/g, "?");
  }

  function pdfEscape(text) {
    return latin1(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }

  function buildPdf(lines) {
    const pages = [];
    for (let i = 0; i < lines.length; i += 46) pages.push(lines.slice(i, i + 46));
    const pageCount = pages.length;
    const fontId = 3 + pageCount * 2;
    const objects = {};
    objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
    const pageIds = [];
    pages.forEach((pageLines, index) => {
      const pageId = 3 + index * 2;
      const contentId = pageId + 1;
      pageIds.push(`${pageId} 0 R`);
      const commands = ["BT", "/F1 10 Tf", "14 TL", "52 790 Td"];
      pageLines.forEach((line, i) => {
        if (i > 0) commands.push("T*");
        commands.push(`(${pdfEscape(line)}) Tj`);
      });
      commands.push("ET");
      const stream = commands.join("\n");
      objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
      objects[contentId] = `<< /Length ${latin1(stream).length} >>\nstream\n${stream}\nendstream`;
    });
    objects[2] = `<< /Type /Pages /Kids [${pageIds.join(" ")}] /Count ${pageCount} >>`;
    objects[fontId] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    for (let id = 1; id <= fontId; id++) {
      offsets[id] = latin1(pdf).length;
      pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }
    const xref = latin1(pdf).length;
    pdf += `xref\n0 ${fontId + 1}\n0000000000 65535 f \n`;
    for (let id = 1; id <= fontId; id++) pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
    pdf += `trailer\n<< /Size ${fontId + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Uint8Array([...latin1(pdf)].map(char => char.charCodeAt(0) & 255));
  }

  function downloadReport() {
    const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(new Date());
    const lines = [
      "BILAN INDIVIDUEL - MISSION ENTRETIEN CHEZ MME MARTIN",
      "",
      `Apprenant : ${state.name}`,
      `Date : ${date}`,
      `Score final : ${scoreTotal()} / 100`,
      "",
      "DETAIL DES REPONSES",
      ""
    ];
    state.trace.forEach((entry, index) => {
      lines.push(`${index + 1}. ${entry.question}`);
      wrapText(`Votre réponse : ${entry.answer}`).forEach(line => lines.push(line));
      wrapText(`Bonne réponse : ${entry.correct}`).forEach(line => lines.push(line));
      wrapText(`Explication : ${entry.explanation}`).forEach(line => lines.push(line));
      lines.push(`Résultat : ${entry.success ? "Réussi" : "À revoir"}`, "");
    });
    lines.push("Repère professionnel : avant d'agir, vérifier la salissure, le support, les risques, la méthode et l'impact.");
    lines.push("Sources pédagogiques : supports EDIAD Produits de nettoyage et de désinfection et Les écogestes.");
    const bytes = buildPdf(lines);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bilan-ecogestes-${state.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "apprenant"}.pdf`;
    document.body.append(link);
    link.click();
    link.remove();
    showFeedback("success", "Votre bilan PDF est prêt. Le téléchargement a été lancé par votre navigateur.");
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function registerWebMcp() {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const safeRegister = tool => {
      try { Promise.resolve(context.registerTool(tool)).catch(() => {}); } catch { /* Unsupported preview */ }
    };
    safeRegister({
      name: "get_training_progress",
      title: "Lire la progression",
      description: "Retourne la progression locale et le score du profil actif dans le jeu pédagogique.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute() { return state ? { learner: state.name, chapter: state.current + 1, completed: state.completed.length, score: scoreTotal() } : { active: false }; }
    });
    safeRegister({
      name: "start_or_resume_training",
      title: "Démarrer ou reprendre le parcours",
      description: "Ouvre le profil local portant ce nom ou en crée un nouveau, puis affiche son étape courante.",
      inputSchema: { type: "object", properties: { learnerName: { type: "string", minLength: 2, maxLength: 32 } }, required: ["learnerName"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        const name = cleanName(input?.learnerName || "");
        if (name.length < 2) throw new Error("Le nom doit contenir au moins 2 caractères.");
        const profile = getProfiles().find(p => p.name.toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr"));
        if (profile) loadSession(profile); else createProfile(name);
        return { learner: state.name, chapter: state.current + 1, completed: state.completed.length, score: scoreTotal() };
      }
    });
  }

  $("#new-profile-form").addEventListener("submit", event => {
    event.preventDefault();
    const name = cleanName($("#learner-name").value);
    if (name.length < 2) return;
    createProfile(name);
    event.currentTarget.reset();
  });
  $("#brand-home").addEventListener("click", showProfiles);
  $("#profile-menu-button").addEventListener("click", () => {
    $("#dialog-profile-title").textContent = state.name;
    $("#dialog-profile-copy").textContent = `${state.completed.length} étape${state.completed.length > 1 ? "s" : ""} terminée${state.completed.length > 1 ? "s" : ""} · ${scoreTotal()} points. Cette progression est enregistrée uniquement dans ce navigateur.`;
    $("#profile-dialog").showModal();
  });
  $("#switch-profile").addEventListener("click", () => { $("#profile-dialog").close(); showProfiles(); });
  $("#reset-profile").addEventListener("click", () => {
    if (!state || !confirm(`Recommencer la partie de ${state.name} ?`)) return;
    const profile = getProfiles().find(p => p.id === state.profileId);
    state = makeState(profile);
    saveState();
    $("#profile-dialog").close();
    goTo(0);
  });

  document.addEventListener("pointerdown", event => {
    const button = event.target.closest("button");
    if (!button || button.disabled || getComputedStyle(button).position === "static") return;
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * .65;
    const ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
    button.append(ripple);
    setTimeout(() => ripple.remove(), 600);
  });

  renderSavedProfiles();
  registerWebMcp();
})();
