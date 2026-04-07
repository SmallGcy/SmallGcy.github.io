const MANIFEST_URL = "./data/manifest.json";
const ITEMS_PER_PAGE = 4;

const state = {
  manifest: null,
  mode: "style",
  categoryName: null,
  page: 1,
  imageVariant: "background",
};

const elements = {
  statItems: document.querySelector("#statItems"),
  statStyles: document.querySelector("#statStyles"),
  statShapes: document.querySelector("#statShapes"),
  modeHint: document.querySelector("#modeHint"),
  variantHint: document.querySelector("#variantHint"),
  categoryLabel: document.querySelector("#categoryLabel"),
  categoryCount: document.querySelector("#categoryCount"),
  categoryList: document.querySelector("#categoryList"),
  referenceTitle: document.querySelector("#referenceTitle"),
  referenceImage: document.querySelector("#referenceImage"),
  referenceMode: document.querySelector("#referenceMode"),
  referenceItemCount: document.querySelector("#referenceItemCount"),
  referenceLink: document.querySelector("#referenceLink"),
  galleryTitle: document.querySelector("#galleryTitle"),
  gallerySubtitle: document.querySelector("#gallerySubtitle"),
  galleryGrid: document.querySelector("#galleryGrid"),
  emptyState: document.querySelector("#emptyState"),
  pageInfo: document.querySelector("#pageInfo"),
  prevPage: document.querySelector("#prevPage"),
  nextPage: document.querySelector("#nextPage"),
  modeButtons: Array.from(document.querySelectorAll(".mode-button")),
  variantButtons: Array.from(document.querySelectorAll(".variant-button")),
  imageCardTemplate: document.querySelector("#imageCardTemplate"),
};

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getCollections() {
  if (!state.manifest) {
    return { categories: [], groups: new Map() };
  }

  const isStyle = state.mode === "style";
  const categories = isStyle ? state.manifest.styles : state.manifest.shapes;
  const key = isStyle ? "style_class" : "shape_class";
  const groups = new Map();

  for (const item of state.manifest.items) {
    const categoryName = item[key];
    if (!groups.has(categoryName)) {
      groups.set(categoryName, []);
    }
    groups.get(categoryName).push(item);
  }

  const activeCategories = categories.filter((item) => item.item_count > 0);
  return { categories: activeCategories, groups };
}

function getReferenceByName(name) {
  const collection = state.mode === "style" ? state.manifest.styles : state.manifest.shapes;
  return collection.find((item) => item.name === name) || null;
}

function getDisplayImage(item) {
  if (state.imageVariant === "alpha" && item.alpha_image_url) {
    return {
      url: item.alpha_image_url,
      label: "Transparent PNG",
      isAlpha: true,
    };
  }

  return {
    url: item.image_url,
    label: "Background render",
    isAlpha: false,
  };
}

function syncUrl() {
  const params = new URLSearchParams(window.location.search);
  params.set("mode", state.mode);
  params.set("variant", state.imageVariant);
  if (state.categoryName) {
    params.set("class", state.categoryName);
  }
  params.set("page", String(state.page));
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, "", newUrl);
}

function loadInitialState() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  if (mode === "style" || mode === "shape") {
    state.mode = mode;
  }

  const variant = params.get("variant");
  if (variant === "background" || variant === "alpha") {
    state.imageVariant = variant;
  }

  const requestedCategory = params.get("class");
  const page = Number.parseInt(params.get("page") || "1", 10);
  state.page = Number.isFinite(page) && page > 0 ? page : 1;

  const { categories } = getCollections();
  const availableNames = new Set(categories.map((item) => item.name));
  if (requestedCategory && availableNames.has(requestedCategory)) {
    state.categoryName = requestedCategory;
  } else if (categories.length > 0) {
    state.categoryName = categories[0].name;
  }
}

function renderStats() {
  elements.statItems.textContent = formatNumber(state.manifest.counts.items);
  elements.statStyles.textContent = formatNumber(
    state.manifest.styles.filter((item) => item.item_count > 0).length
  );
  elements.statShapes.textContent = formatNumber(
    state.manifest.shapes.filter((item) => item.item_count > 0).length
  );
}

function renderModeButtons() {
  for (const button of elements.modeButtons) {
    button.classList.toggle("active", button.dataset.mode === state.mode);
  }
  elements.modeHint.textContent =
    state.mode === "style"
      ? "Select a style class to view its style reference image and matching generated targets."
      : "Select a shape class to view its shape reference image and matching generated targets.";
}

function renderVariantButtons() {
  const hasAlphaImages = Boolean(state.manifest?.counts?.alpha_items);
  for (const button of elements.variantButtons) {
    button.classList.toggle("active", button.dataset.variant === state.imageVariant);
    button.disabled = button.dataset.variant === "alpha" && !hasAlphaImages;
  }
  elements.variantHint.textContent = hasAlphaImages
    ? "Switch between the original background render and the transparent PNG version."
    : "Transparent PNG files are not available in the current manifest.";
}

function renderCategoryList() {
  const { categories } = getCollections();
  elements.categoryLabel.textContent = state.mode === "style" ? "Style Classes" : "Shape Classes";
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
    button.append(label);

    const count = document.createElement("span");
    count.className = "count-pill";
    count.textContent = formatNumber(category.item_count);
    button.append(count);

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

function renderReferencePanel(itemCount) {
  const reference = getReferenceByName(state.categoryName);
  if (!reference) {
    elements.referenceTitle.textContent = "Unknown category";
    elements.referenceImage.removeAttribute("src");
    elements.referenceImage.alt = "";
    elements.referenceMode.textContent = capitalize(state.mode);
    elements.referenceItemCount.textContent = "0";
    elements.referenceLink.href = "#";
    return;
  }

  elements.referenceTitle.textContent = reference.name;
  elements.referenceImage.src = reference.image_url;
  elements.referenceImage.alt = `${reference.name} ${state.mode} reference`;
  elements.referenceMode.textContent = capitalize(state.mode);
  elements.referenceItemCount.textContent = formatNumber(itemCount);
  elements.referenceLink.href = reference.image_url;
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
  const variantLabel = state.imageVariant === "alpha" ? "Transparent PNG" : "Background render";

  renderReferencePanel(items.length);
  elements.galleryTitle.textContent = `${capitalize(state.mode)}: ${state.categoryName}`;
  elements.gallerySubtitle.textContent = `${formatNumber(items.length)} generated images in this category · ${variantLabel}`;
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
    const display = getDisplayImage(item);

    link.href = display.url;
    link.classList.toggle("alpha-variant", display.isAlpha);
    image.src = display.url;
    image.alt = `${item.text} rendered in ${item.style_class} with ${item.shape_class}`;
    title.textContent = item.text;
    meta.textContent =
      state.mode === "style"
        ? `Shape: ${item.shape_class} · ${display.label}`
        : `Style: ${item.style_class} · ${display.label}`;

    elements.galleryGrid.append(fragment);
  }
}

function render() {
  if (!state.manifest) {
    return;
  }
  renderModeButtons();
  renderVariantButtons();
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
      const { categories } = getCollections();
      state.categoryName = categories[0]?.name || null;
      state.page = 1;
      render();
    });
  }

  for (const button of elements.variantButtons) {
    button.addEventListener("click", () => {
      const nextVariant = button.dataset.variant;
      if (nextVariant === state.imageVariant) {
        return;
      }
      state.imageVariant = nextVariant;
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
    renderError("The gallery manifest could not be loaded. Check data/manifest.json and try again.");
  }
}

init();
