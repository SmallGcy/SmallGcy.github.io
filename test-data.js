const MANIFEST_URL = "./data/test-manifest.json";
const ITEMS_PER_PAGE = 4;

const MODE_CONFIG = {
  style: {
    key: "style_class",
    collectionKey: "styles",
    categoryLabel: "Style Classes",
    hint: "Select a style class to inspect the style-pairing subset and its matching outputs.",
    description:
      "The reference panel shows the active style category while the gallery lists only style-pairing generations.",
    filter: (item) => Boolean(item.style_class),
  },
  shape: {
    key: "shape_class",
    collectionKey: "shapes",
    categoryLabel: "Shape Classes",
    hint: "Select a shape class to compare every result generated from that mask shape, across both task families.",
    description:
      "Shape mode merges style-pairing and font-pairing outputs under the same mask reference image.",
    filter: () => true,
  },
  font: {
    key: "font_class",
    collectionKey: "fonts",
    categoryLabel: "Font Classes",
    hint: "Select a font class to inspect the raw-font pairing subset and its matching outputs.",
    description:
      "The reference panel shows the active font exemplar while the gallery lists only raw-font generations.",
    filter: (item) => Boolean(item.font_class),
  },
};

const state = {
  manifest: null,
  mode: "style",
  categoryName: null,
  page: 1,
};

const elements = {
  statItems: document.querySelector("#testStatItems"),
  statStyles: document.querySelector("#testStatStyles"),
  statShapes: document.querySelector("#testStatShapes"),
  statFonts: document.querySelector("#testStatFonts"),
  modeHint: document.querySelector("#testModeHint"),
  categoryLabel: document.querySelector("#testCategoryLabel"),
  categoryCount: document.querySelector("#testCategoryCount"),
  categoryList: document.querySelector("#testCategoryList"),
  referenceVisual: document.querySelector("#testReferenceVisual"),
  referenceImage: document.querySelector("#testReferenceImage"),
  referencePlaceholder: document.querySelector("#testReferencePlaceholder"),
  referenceTitle: document.querySelector("#testReferenceTitle"),
  referenceDescription: document.querySelector("#testReferenceDescription"),
  referenceMode: document.querySelector("#testReferenceMode"),
  referenceItemCount: document.querySelector("#testReferenceItemCount"),
  referenceStatus: document.querySelector("#testReferenceStatus"),
  referenceLink: document.querySelector("#testReferenceLink"),
  galleryTitle: document.querySelector("#testGalleryTitle"),
  gallerySubtitle: document.querySelector("#testGallerySubtitle"),
  galleryGrid: document.querySelector("#testGalleryGrid"),
  emptyState: document.querySelector("#testEmptyState"),
  pageInfo: document.querySelector("#testPageInfo"),
  prevPage: document.querySelector("#testPrevPage"),
  nextPage: document.querySelector("#testNextPage"),
  modeButtons: Array.from(document.querySelectorAll("#testModeToggle .mode-button")),
  imageCardTemplate: document.querySelector("#testImageCardTemplate"),
};

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getModeConfig() {
  return MODE_CONFIG[state.mode];
}

function getCollections() {
  if (!state.manifest) {
    return { categories: [], groups: new Map() };
  }

  const config = getModeConfig();
  const categories = (state.manifest[config.collectionKey] || []).filter((item) => item.item_count > 0);
  const groups = new Map();

  for (const item of state.manifest.items) {
    if (!config.filter(item)) {
      continue;
    }
    const categoryName = item[config.key];
    if (!categoryName) {
      continue;
    }
    if (!groups.has(categoryName)) {
      groups.set(categoryName, []);
    }
    groups.get(categoryName).push(item);
  }

  for (const items of groups.values()) {
    items.sort((left, right) => left.numeric_id - right.numeric_id);
  }

  return { categories, groups };
}

function getReferenceByName(name) {
  const config = getModeConfig();
  const collection = state.manifest?.[config.collectionKey] || [];
  return collection.find((item) => item.name === name) || null;
}

function syncUrl() {
  const params = new URLSearchParams(window.location.search);
  params.set("mode", state.mode);
  if (state.categoryName) {
    params.set("class", state.categoryName);
  }
  params.set("page", String(state.page));
  const nextUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, "", nextUrl);
}

function loadInitialState() {
  const params = new URLSearchParams(window.location.search);
  const requestedMode = params.get("mode");
  if (requestedMode in MODE_CONFIG) {
    state.mode = requestedMode;
  }

  const page = Number.parseInt(params.get("page") || "1", 10);
  state.page = Number.isFinite(page) && page > 0 ? page : 1;

  const requestedCategory = params.get("class");
  const { categories } = getCollections();
  const names = new Set(categories.map((item) => item.name));
  if (requestedCategory && names.has(requestedCategory)) {
    state.categoryName = requestedCategory;
  } else {
    state.categoryName = categories[0]?.name || null;
  }
}

function renderStats() {
  elements.statItems.textContent = formatNumber(state.manifest.counts.items);
  elements.statStyles.textContent = formatNumber(state.manifest.counts.styles);
  elements.statShapes.textContent = formatNumber(state.manifest.counts.shapes);
  elements.statFonts.textContent = formatNumber(state.manifest.counts.fonts);
}

function renderModeButtons() {
  const config = getModeConfig();
  for (const button of elements.modeButtons) {
    button.classList.toggle("active", button.dataset.mode === state.mode);
  }
  elements.modeHint.textContent = config.hint;
}

function renderCategoryList() {
  const { categories } = getCollections();
  const config = getModeConfig();
  elements.categoryLabel.textContent = config.categoryLabel;
  elements.categoryCount.textContent = `${formatNumber(categories.length)} categories`;
  elements.categoryList.replaceChildren();

  for (const category of categories) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-button";
    button.classList.toggle("active", category.name === state.categoryName);
    button.dataset.category = category.name;

    const label = document.createElement("span");
    label.textContent = category.name;

    const count = document.createElement("span");
    count.className = "count-pill";
    count.textContent = formatNumber(category.item_count);

    button.append(label, count);
    button.addEventListener("click", () => {
      if (state.categoryName === category.name) {
        return;
      }
      state.categoryName = category.name;
      state.page = 1;
      render();
    });
    elements.categoryList.append(button);
  }
}

function setReferenceVisual(reference) {
  const hasImage = Boolean(reference?.image_url);
  elements.referenceVisual.classList.toggle("is-empty", !hasImage);
  elements.referenceImage.classList.toggle("hidden", !hasImage);
  elements.referencePlaceholder.classList.toggle("hidden", hasImage);

  if (!hasImage) {
    elements.referenceImage.removeAttribute("src");
    elements.referenceImage.alt = "";
    return;
  }

  elements.referenceImage.src = reference.image_url;
  elements.referenceImage.alt = `${reference.name} ${state.mode} reference`;
}

function renderReferencePanel(itemCount) {
  const config = getModeConfig();
  const reference = getReferenceByName(state.categoryName);

  if (!reference) {
    elements.referenceTitle.textContent = "Unknown category";
    elements.referenceDescription.textContent = "This category is not present in the current manifest.";
    elements.referenceMode.textContent = capitalize(state.mode);
    elements.referenceItemCount.textContent = "0";
    elements.referenceStatus.textContent = "Unavailable";
    elements.referenceLink.href = "#";
    elements.referenceLink.setAttribute("aria-disabled", "true");
    setReferenceVisual(null);
    return;
  }

  elements.referenceTitle.textContent = reference.name;
  elements.referenceDescription.textContent = config.description;
  elements.referenceMode.textContent = capitalize(state.mode);
  elements.referenceItemCount.textContent = formatNumber(itemCount);
  elements.referenceStatus.textContent = reference.image_url ? "Available" : "Unavailable";

  if (reference.image_url) {
    elements.referenceLink.href = reference.image_url;
    elements.referenceLink.removeAttribute("aria-disabled");
  } else {
    elements.referenceLink.href = "#";
    elements.referenceLink.setAttribute("aria-disabled", "true");
  }

  setReferenceVisual(reference);
}

function getSecondaryMeta(item) {
  if (state.mode === "style") {
    return `Shape: ${item.shape_class}`;
  }
  if (state.mode === "font") {
    return `Shape: ${item.shape_class}`;
  }
  if (item.style_class) {
    return `Style: ${item.style_class}`;
  }
  if (item.font_class) {
    return `Font: ${item.font_class}`;
  }
  return "Unlabeled";
}

function buildTags(item) {
  const tags = [];
  tags.push({ label: "Text", value: item.text });
  tags.push({ label: "Shape", value: item.shape_class });
  if (item.style_class) {
    tags.push({ label: "Style", value: item.style_class });
  }
  if (item.font_class) {
    tags.push({ label: "Font", value: item.font_class });
  }
  return tags;
}

function renderGallery() {
  const { groups } = getCollections();
  const items = groups.get(state.categoryName) || [];
  const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  if (state.page > totalPages) {
    state.page = totalPages;
  }

  const start = (state.page - 1) * ITEMS_PER_PAGE;
  const visibleItems = items.slice(start, start + ITEMS_PER_PAGE);

  renderReferencePanel(items.length);
  elements.galleryTitle.textContent = `${capitalize(state.mode)}: ${state.categoryName || "None"}`;
  elements.gallerySubtitle.textContent = `${formatNumber(items.length)} generated images in this category`;
  elements.pageInfo.textContent = `Page ${state.page} / ${totalPages}`;
  elements.prevPage.disabled = state.page <= 1;
  elements.nextPage.disabled = state.page >= totalPages;

  elements.galleryGrid.replaceChildren();
  elements.emptyState.classList.toggle("hidden", visibleItems.length > 0);

  for (const item of visibleItems) {
    const fragment = elements.imageCardTemplate.content.cloneNode(true);
    const link = fragment.querySelector(".image-link");
    const image = fragment.querySelector(".gallery-image");
    const title = fragment.querySelector(".image-title");
    const meta = fragment.querySelector(".image-meta");
    const tagRow = fragment.querySelector(".tag-row");

    link.href = item.image_url;
    link.classList.add("alpha-variant");
    image.src = item.image_url;
    image.alt = `${item.text} generated result`;
    title.textContent = item.text;
    meta.textContent = getSecondaryMeta(item);

    for (const tag of buildTags(item)) {
      const pill = document.createElement("span");
      pill.className = "tag-pill";
      pill.textContent = `${tag.label}: ${tag.value}`;
      tagRow.append(pill);
    }

    elements.galleryGrid.append(fragment);
  }
}

function render() {
  if (!state.manifest) {
    return;
  }

  const { categories } = getCollections();
  if (!categories.some((item) => item.name === state.categoryName)) {
    state.categoryName = categories[0]?.name || null;
    state.page = 1;
  }

  renderModeButtons();
  renderCategoryList();
  renderGallery();
  syncUrl();
}

async function loadManifest() {
  const response = await fetch(MANIFEST_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch manifest: ${response.status}`);
  }
  return response.json();
}

function attachEvents() {
  for (const button of elements.modeButtons) {
    button.addEventListener("click", () => {
      const nextMode = button.dataset.mode;
      if (nextMode === state.mode) {
        return;
      }
      state.mode = nextMode;
      state.page = 1;
      const { categories } = getCollections();
      state.categoryName = categories[0]?.name || null;
      render();
    });
  }

  elements.prevPage.addEventListener("click", () => {
    if (state.page <= 1) {
      return;
    }
    state.page -= 1;
    render();
  });

  elements.nextPage.addEventListener("click", () => {
    state.page += 1;
    render();
  });
}

function renderError(message) {
  elements.referenceTitle.textContent = "Manifest Error";
  elements.referenceDescription.textContent = message;
  elements.galleryTitle.textContent = "Unable to load gallery";
  elements.gallerySubtitle.textContent = message;
  elements.emptyState.classList.remove("hidden");
  elements.emptyState.textContent = message;
}

async function init() {
  attachEvents();

  try {
    state.manifest = await loadManifest();
    loadInitialState();
    renderStats();
    render();
  } catch (error) {
    console.error(error);
    renderError("The test gallery manifest could not be loaded. Generate data/test-manifest.json and try again.");
  }
}

init();
