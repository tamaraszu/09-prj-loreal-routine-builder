/* ---------- element refs ---------- */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const generateRoutineBtn = document.getElementById("generateRoutine");
const chatWindow = document.getElementById("chatWindow");

/* ---------- OpenAI config ---------- */
/* Replace with your own key. Calling OpenAI directly from front-end JS
   exposes the key to anyone who views source -- fine for a local class
   project, but for a real deployed site route this through a small
   server/worker that holds the key instead. */
const OPENAI_API_KEY = "YOUR_OPENAI_API_KEY";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

/* ---------- state ---------- */
let allProducts = [];
let selectedProductIds = loadSelectedIds();

/* ---------- data loading ---------- */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  allProducts = data.products;
}

/* ---------- persistence (so selections survive a page refresh) ---------- */
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
  if (!category) return allProducts;
  return allProducts.filter((p) => p.category === category);
}

function displayProducts(products) {
  if (products.length === 0) {
    productsContainer.innerHTML = `<div class="placeholder-message">No products in this category.</div>`;
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
    return;
  }

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
  // clear the initial placeholder text, if present
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

/* ---------- OpenAI: generate routine ---------- */
async function fetchRoutineFromOpenAI(products) {
  const response = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a skincare and beauty routine expert working for L'Oreal. Using ONLY the products provided, build a clear, step-by-step personalized routine (morning and/or evening, as appropriate). Explain the order to apply each product and briefly why. Keep it friendly and concise, formatted with numbered steps.",
        },
        {
          role: "user",
          content: `Here are the products I've selected:\n${JSON.stringify(products, null, 2)}\n\nPlease build my routine.`,
        },
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

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

  addChatMessage("user", `Generate a routine using: ${selectedProducts.map((p) => p.name).join(", ")}`);
  const loadingId = "routine-loading";
  addChatMessage("assistant", "Generating your personalized routine...", loadingId);

  generateRoutineBtn.disabled = true;
  try {
    const routine = await fetchRoutineFromOpenAI(productData);
    updateChatMessage(loadingId, routine);
  } catch (err) {
    console.error(err);
    updateChatMessage(loadingId, "Sorry, I couldn't generate a routine right now. Please check your API key/connection and try again.");
  } finally {
    generateRoutineBtn.disabled = false;
  }
}

/* ---------- event listeners ---------- */
categoryFilter.addEventListener("change", renderAll);

// click a card to select/unselect, or click the description toggle to reveal it
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

// keyboard support (Enter / Space) for selecting a card via accessibility
productsContainer.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  if (e.target.closest(".desc-toggle")) return; // let the button handle its own activation
  const card = e.target.closest(".product-card");
  if (!card) return;
  e.preventDefault();
  toggleProductSelection(Number(card.dataset.id));
});

// remove an item directly from the "Selected Products" list
selectedProductsList.addEventListener("click", (e) => {
  const btn = e.target.closest(".remove-btn");
  if (!btn) return;
  toggleProductSelection(Number(btn.dataset.id));
});

generateRoutineBtn.addEventListener("click", handleGenerateRoutine);

/* ---------- init ---------- */
(async function init() {
  await loadProducts();
  renderAll();
})();