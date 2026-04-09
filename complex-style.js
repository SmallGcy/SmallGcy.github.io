const MANIFEST_URL = "./data/complex-style-manifest.json?v=20260409-complex-style-smoke-refresh";
const ITEMS_PER_PAGE = 4;

const state = {
  manifest: null,
  categoryName: null,
  page: 1,
  imageVariant: "background",
};

const elements = {
  statItems: document.querySelector("#complexStatItems"),
  statStyles: document.querySelector("#complexStatStyles"),
  statShapes: document.querySelector("#complexStatShapes"),
  variantHint: document.querySelector("#complexVariantHint"),
  categoryCount: document.querySelector("#complexCategoryCount"),
  categoryList: document.querySelector("#complexCategoryList"),
  referenceVisual: document.querySelector("#complexReferenceVisual"),
  referenceTitle: document.querySelector("#complexReferenceTitle"),
  referenceImage: document.querySelector("#complexReferenceImage"),
  referencePlaceholder: document.querySelector("#complexReferencePlaceholder"),
  referenceItemCount: document.querySelector("#complexReferenceItemCount"),
  referenceLink: document.querySelector("#complexReferenceLink"),
  galleryTitle: document.querySelector("#complexGalleryTitle"),
  gallerySubtitle: document.querySelector("#complexGallerySubtitle"),
  galleryGrid: document.querySelector("#complexGalleryGrid"),
  emptyState: document.querySelector("#complexEmptyState"),
  pageInfo: document.querySelector("#complexPageInfo"),
  prevPage: document.querySelector("#complexPrevPage"),
  nextPage: document.querySelector("#complexNextPage"),
  variantButtons: Array.from(document.querySelectorAll("#complexVariantToggle .variant-button")),
  imageCardTemplate: document.querySelector("#complexImageCardTemplate"),
};

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function getFilteredStyles() {
  if (!state.manifest) {
    return [];
  }
  return state.manifest.styles.filter((item) => item.item_count > 0);
}

function getFilteredItems() {
  if (!state.manifest) {
    return [];
  }

  return state.manifest.items
    .sort((left, right) => Number.parseInt(left.id, 10) - Number.parseInt(right.id, 10));
}

function getGroups() {
  const groups = new Map();
  for (const item of getFilteredItems()) {
    if (!groups.has(item.style_class)) {
      groups.set(item.style_class, []);
    }
    groups.get(item.style_class).push(item);
  }
  return groups;
}

function getReferenceByName(name) {
  return getFilteredStyles().find((item) => item.name === name) || null;
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
  params.set("variant", state.imageVariant);
  if (state.categoryName) {
    params.set("class", state.categoryName);
  }
  params.set("page", String(state.page));
  const nextUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, "", nextUrl);
}

function loadInitialState() {
  const params = new URLSearchParams(window.location.search);
  const variant = params.get("variant");
  if (variant === "background" || variant === "alpha") {
    state.imageVariant = variant;
  }

  const page = Number.parseInt(params.get("page") || "1", 10);
  state.page = Number.isFinite(page) && page > 0 ? page : 1;

  const requestedCategory = params.get("class");
  const categories = getFilteredStyles();
  const availableNames = new Set(categories.map((item) => item.name));
  if (requestedCategory && availableNames.has(requestedCategory)) {
    state.categoryName = requestedCategory;
  } else {
    state.categoryName = categories[0]?.name || null;
  }
}

function renderStats() {
  const items = getFilteredItems();
  const shapes = new Set(items.map((item) => item.shape_class));
  elements.statItems.textContent = formatNumber(items.length);
  elements.statStyles.textContent = formatNumber(getFilteredStyles().length);
  elements.statShapes.textContent = formatNumber(shapes.size);
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
  elements.referenceImage.alt = `${reference.name} style reference`;
}

function renderCategoryList() {
  const categories = getFilteredStyles();
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

function renderReferencePanel(itemCount) {
  const reference = getReferenceByName(state.categoryName);
  if (!reference) {
    elements.referenceTitle.textContent = "Unknown style";
    elements.referenceItemCount.textContent = "0";
    elements.referenceLink.href = "#";
    elements.referenceLink.setAttribute("aria-disabled", "true");
    setReferenceVisual(null);
    return;
  }

  elements.referenceTitle.textContent = reference.name;
  elements.referenceItemCount.textContent = formatNumber(itemCount);
  if (reference.image_url) {
    elements.referenceLink.href = reference.image_url;
    elements.referenceLink.removeAttribute("aria-disabled");
  } else {
    elements.referenceLink.href = "#";
    elements.referenceLink.setAttribute("aria-disabled", "true");
  }
  setReferenceVisual(reference);
}

function renderGallery() {
  const groups = getGroups();
  const items = groups.get(state.categoryName) || [];
  const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  if (state.page > totalPages) {
    state.page = totalPages;
  }

  const start = (state.page - 1) * ITEMS_PER_PAGE;
  const visibleItems = items.slice(start, start + ITEMS_PER_PAGE);
  const variantLabel = state.imageVariant === "alpha" ? "Transparent PNG" : "Background render";

  renderReferencePanel(items.length);
  elements.galleryTitle.textContent = `Style: ${state.categoryName}`;
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
    meta.textContent = `Shape: ${item.shape_class} · ${display.label}`;

    elements.galleryGrid.append(fragment);
  }
}

function render() {
  if (!state.manifest) {
    return;
  }

  const categories = getFilteredStyles();
  if (!categories.some((item) => item.name === state.categoryName)) {
    state.categoryName = categories[0]?.name || null;
    state.page = 1;
  }

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
    renderError("The gallery manifest could not be loaded. Check data/complex-style-manifest.json and try again.");
  }
}

init();
