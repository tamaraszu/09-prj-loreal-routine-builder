/* ---------- element refs ---------- */
const categoryFilter = document.getElementById("categoryFilter");
const searchInput = document.getElementById("searchInput");
const dirToggle = document.getElementById("dirToggle");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const generateRoutineBtn = document.getElementById("generateRoutine");
const clearSelectedBtn = document.getElementById("clearSelected");
const chatWindow = document.getElementById("chatWindow");
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");

/* ---------- Cloudflare Worker config ---------- */
/* Point this at your deployed worker (see worker.js for the worker code
   and deploy steps). The worker holds the real OpenAI key server-side,
   so nothing secret lives in this file. */
const WORKER_ENDPOINT = "https://lorealbot.tamiszuchet.workers.dev/";

/* ---------- system prompt: keeps the assistant on-topic ---------- */
const SYSTEM_PROMPT = `You are a friendly L'Oreal beauty advisor chatbot embedded in a routine-builder app.
Only answer questions about: the routine you just generated for the user, skincare, haircare, makeup, fragrance,
and general grooming/beauty topics. If a user asks about something unrelated to these topics, politely explain
that you can only help with beauty and routine-related questions, and steer the conversation back.
Keep answers concise and friendly.`;

/* ---------- state ---------- */
let allProducts = [];
let selectedProductIds = loadSelectedIds();
let conversationHistory = [{ role: "system", content: SYSTEM_PROMPT }];

/* ---------- data loading ---------- */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  allProducts = data.products;
}

/* ---------- persistence: selected products (localStorage) ---------- */
function loadSelectedIds() {
  try {
    const stored = localStorage.getItem("selectedProductIds");
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    return [];
  }
}

function saveSelectedIds() {
  localStorage.setItem("selectedProductIds", JSON.stringify(selectedProductIds));
}

/* ---------- rendering: product grid ---------- */
function getFilteredProducts() {
  const category = categoryFilter.value;
  const query = searchInput.value.trim().toLowerCase();

  return allProducts.filter((p) => {
    const matchesCategory = !category || p.category === category;
    const matchesQuery =
      !query ||
      p.name.toLowerCase().includes(query) ||
      p.brand.toLowerCase().includes(query) ||
      p.description.toLowerCase().includes(query);
    return matchesCategory && matchesQuery;
  });
}

function displayProducts(products) {
  if (products.length === 0) {
    productsContainer.innerHTML = `<div class="placeholder-message">No products match your search.</div>`;
    return;
  }

  productsContainer.innerHTML = products
    .map((product) => {
      const isSelected = selectedProductIds.includes(product.id);
      const descId = `desc-${product.id}`;
      return `
        <div class="product-card ${isSelected ? "selected" : ""}" data-id="${product.id}" tabindex="0" role="button" aria-pressed="${isSelected}">
          <img src="${product.image}" alt="${product.name}">
          <div class="product-info">
            <h3>${product.name}</h3>
            <p class="brand"><strong>${product.brand}</strong></p>
            <button class="desc-toggle" data-id="${product.id}" aria-expanded="false" aria-controls="${descId}">
              <i class="fa-solid fa-circle-info"></i> Description
            </button>
            <p class="product-description" id="${descId}" hidden>${product.description}</p>
          </div>
        </div>
      `;
    })
    .join("");
}

/* ---------- rendering: selected products list ---------- */
function renderSelectedList() {
  if (selectedProductIds.length === 0) {
    selectedProductsList.innerHTML = `<p class="placeholder-message">No products selected yet.</p>`;
    if (clearSelectedBtn) clearSelectedBtn.hidden = true;
    return;
  }

  if (clearSelectedBtn) clearSelectedBtn.hidden = false;

  selectedProductsList.innerHTML = selectedProductIds
    .map((id) => {
      const product = allProducts.find((p) => p.id === id);
      if (!product) return "";
      return `
        <div class="selected-item" data-id="${product.id}">
          <img src="${product.image}" alt="${product.name}">
          <span>${product.name}</span>
          <button class="remove-btn" data-id="${product.id}" aria-label="Remove ${product.name}">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      `;
    })
    .join("");
}

function renderAll() {
  displayProducts(getFilteredProducts());
  renderSelectedList();
}

/* ---------- selection logic ---------- */
function toggleProductSelection(id) {
  const index = selectedProductIds.indexOf(id);
  if (index === -1) {
    selectedProductIds.push(id);
  } else {
    selectedProductIds.splice(index, 1);
  }
  saveSelectedIds();
  renderAll();
}

/* ---------- RTL / text direction toggle ---------- */
function applyDirection(dir) {
  document.documentElement.dir = dir;
  dirToggle.setAttribute("aria-pressed", String(dir === "rtl"));
  dirToggle.innerHTML =
    dir === "rtl"
      ? `<i class="fa-solid fa-globe"></i> LTR`
      : `<i class="fa-solid fa-globe"></i> RTL`;
}

function loadDirection() {
  return localStorage.getItem("textDirection") || "ltr";
}

function toggleDirection() {
  const next = document.documentElement.dir === "rtl" ? "ltr" : "rtl";
  localStorage.setItem("textDirection", next);
  applyDirection(next);
}

function clearAllSelections() {
  selectedProductIds = [];
  saveSelectedIds();
  renderAll();
}

/* ---------- description reveal logic ---------- */
function toggleDescription(id) {
  const descEl = document.getElementById(`desc-${id}`);
  const btn = productsContainer.querySelector(`.desc-toggle[data-id="${id}"]`);
  if (!descEl || !btn) return;

  const isHidden = descEl.hasAttribute("hidden");
  if (isHidden) {
    descEl.removeAttribute("hidden");
    btn.setAttribute("aria-expanded", "true");
    btn.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Hide`;
  } else {
    descEl.setAttribute("hidden", "");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = `<i class="fa-solid fa-circle-info"></i> Description`;
  }
}

/* ---------- chat window helpers ---------- */
function addChatMessage(role, text, id) {
  const placeholder = chatWindow.querySelector(".placeholder-message");
  if (placeholder) placeholder.remove();

  const div = document.createElement("div");
  div.className = `chat-message ${role}`;
  if (id) div.id = id;
  div.innerHTML = escapeHtml(text).replace(/\n/g, "<br>");
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return div;
}

function updateChatMessage(id, text) {
  const el = document.getElementById(id);
  if (!el) return addChatMessage("assistant", text);
  el.innerHTML = escapeHtml(text).replace(/\n/g, "<br>");
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ---------- worker call (proxies to OpenAI) ---------- */
async function fetchFromWorker(messages) {
  const response = await fetch(WORKER_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Worker error (${response.status})`);
  }

  return data.content;
}

/* ---------- generate routine ---------- */
async function handleGenerateRoutine() {
  if (selectedProductIds.length === 0) {
    addChatMessage("assistant", "Please select at least one product before generating a routine.");
    return;
  }

  const selectedProducts = allProducts.filter((p) => selectedProductIds.includes(p.id));
  const productData = selectedProducts.map(({ name, brand, category, description }) => ({
    name,
    brand,
    category,
    description,
  }));

  const userRequest = `Here are the products I've selected:\n${JSON.stringify(productData, null, 2)}\n\nPlease build my personalized routine, explaining the order to use each product and why.`;

  addChatMessage("user", `Generate a routine using: ${selectedProducts.map((p) => p.name).join(", ")}`);
  conversationHistory.push({ role: "user", content: userRequest });

  const loadingId = "routine-loading";
  addChatMessage("assistant", "Generating your personalized routine...", loadingId);

  setFormBusy(true);
  try {
    const routine = await fetchFromWorker(conversationHistory);
    conversationHistory.push({ role: "assistant", content: routine || "Sorry, I didn't get a response back." });
    updateChatMessage(loadingId, routine || "Sorry, I didn't get a response back.");
  } catch (err) {
    console.error(err);
    updateChatMessage(loadingId, "Sorry, I couldn't generate a routine right now. Please check your worker setup and try again.");
    conversationHistory.pop(); // remove the unanswered user turn so history stays clean
  } finally {
    setFormBusy(false);
  }
}

/* ---------- follow-up chat ---------- */
async function handleChatSubmit(e) {
  e.preventDefault();
  const question = userInput.value.trim();
  if (!question) return;

  addChatMessage("user", question);
  conversationHistory.push({ role: "user", content: question });
  userInput.value = "";

  const loadingId = `chat-loading-${Date.now()}`;
  addChatMessage("assistant", "Thinking...", loadingId);

  setFormBusy(true);
  try {
    const reply = await fetchFromWorker(conversationHistory);
    conversationHistory.push({ role: "assistant", content: reply || "Sorry, I didn't get a response back." });
    updateChatMessage(loadingId, reply || "Sorry, I didn't get a response back.");
  } catch (err) {
    console.error(err);
    updateChatMessage(loadingId, "Sorry, something went wrong reaching the assistant. Please try again.");
    conversationHistory.pop();
  } finally {
    setFormBusy(false);
    userInput.focus();
  }
}

function setFormBusy(isBusy) {
  generateRoutineBtn.disabled = isBusy;
  sendBtn.disabled = isBusy;
  userInput.disabled = isBusy;
}

/* ---------- event listeners ---------- */
categoryFilter.addEventListener("change", renderAll);
searchInput.addEventListener("input", renderAll);
dirToggle.addEventListener("click", toggleDirection);

productsContainer.addEventListener("click", (e) => {
  const descBtn = e.target.closest(".desc-toggle");
  if (descBtn) {
    e.stopPropagation();
    toggleDescription(Number(descBtn.dataset.id));
    return;
  }

  const card = e.target.closest(".product-card");
  if (!card) return;
  toggleProductSelection(Number(card.dataset.id));
});

productsContainer.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  if (e.target.closest(".desc-toggle")) return;
  const card = e.target.closest(".product-card");
  if (!card) return;
  e.preventDefault();
  toggleProductSelection(Number(card.dataset.id));
});

selectedProductsList.addEventListener("click", (e) => {
  const btn = e.target.closest(".remove-btn");
  if (!btn) return;
  toggleProductSelection(Number(btn.dataset.id));
});

if (clearSelectedBtn) {
  clearSelectedBtn.addEventListener("click", clearAllSelections);
}

generateRoutineBtn.addEventListener("click", handleGenerateRoutine);
chatForm.addEventListener("submit", handleChatSubmit);

/* ---------- init ---------- */
(async function init() {
  applyDirection(loadDirection());
  await loadProducts();
  renderAll();
})();