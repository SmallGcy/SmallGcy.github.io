const MANIFEST_URL = "./data/complex-style-manifest.json?v=20260423-complex-style-123k-refresh";
const ITEMS_PER_PAGE = 4;

const ALPHA_BACKDROP_PRESETS = {
  checker: {
    label: "Checker",
    mode: "checker",
    chipClass: "is-checker",
  },
  white: {
    label: "White",
    mode: "solid",
    color: "#ffffff",
  },
  graphite: {
    label: "Graphite",
    mode: "solid",
    color: "#17181d",
  },
  slate: {
    label: "Slate",
    mode: "solid",
    color: "#2a3142",
  },
  warm: {
    label: "Warm",
    mode: "solid",
    color: "#efe3d1",
  },
  mint: {
    label: "Mint",
    mode: "solid",
    color: "#d7efe5",
  },
  custom: {
    label: "Custom",
    mode: "custom",
    color: "#ffffff",
  },
};

const state = {
  manifest: null,
  categoryName: null,
  page: 1,
  alphaBackdrop: "checker",
  alphaCustomColor: "#ffffff",
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
  alphaBackdropBlock: document.querySelector("#complexAlphaBackdropBlock"),
  alphaBackdropHint: document.querySelector("#complexAlphaBackdropHint"),
  alphaBackdropButtons: Array.from(document.querySelectorAll("#complexAlphaBackdropPalette .alpha-bg-button")),
  alphaCustomColor: document.querySelector("#complexAlphaCustomColor"),
  imageCardTemplate: document.querySelector("#complexImageCardTemplate"),
};

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function hasAlphaImages() {
  return Boolean(state.manifest?.counts?.alpha_items);
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
    .slice()
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
  if (item.alpha_image_url) {
    return {
      url: item.alpha_image_url,
      label: "Transparent PNG",
      isAlpha: true,
    };
  }

  return {
    url: "",
    label: "Unavailable",
    isAlpha: false,
  };
}

function syncUrl() {
  const params = new URLSearchParams(window.location.search);
  params.set("alphaBg", state.alphaBackdrop);
  if (state.alphaBackdrop === "custom") {
    params.set("alphaColor", state.alphaCustomColor);
  } else {
    params.delete("alphaColor");
  }
  if (state.categoryName) {
    params.set("class", state.categoryName);
  }
  params.set("page", String(state.page));
  const nextUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, "", nextUrl);
}

function loadInitialState() {
  const params = new URLSearchParams(window.location.search);

  const alphaBackdrop = params.get("alphaBg");
  if (alphaBackdrop && alphaBackdrop in ALPHA_BACKDROP_PRESETS) {
    state.alphaBackdrop = alphaBackdrop;
  }

  const customColor = params.get("alphaColor");
  if (customColor && /^#[0-9a-fA-F]{6}$/.test(customColor)) {
    state.alphaCustomColor = customColor;
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
  const shapes = new Set(items.map((item) => item.shape_class).filter(Boolean));
  elements.statItems.textContent = formatNumber(items.length);
  elements.statStyles.textContent = formatNumber(getFilteredStyles().length);
  elements.statShapes.textContent = formatNumber(shapes.size);
}

function renderAlphaBackdropControls() {
  const shouldShow = hasAlphaImages();
  elements.alphaBackdropBlock.classList.toggle("hidden", !shouldShow);
  if (!shouldShow) {
    elements.variantHint.textContent =
      "No RGBA preview images are available in the current manifest.";
    return;
  }

  elements.variantHint.textContent =
    "This page shows only RGBA outputs. Use the palette below to switch between the checkerboard matte and a solid-color background.";

  for (const button of elements.alphaBackdropButtons) {
    const key = button.dataset.backdrop;
    button.classList.toggle("active", key === state.alphaBackdrop);
  }

  elements.alphaCustomColor.value = state.alphaCustomColor;
  elements.alphaCustomColor.disabled = state.alphaBackdrop !== "custom";

  if (state.alphaBackdrop === "checker") {
    elements.alphaBackdropHint.textContent =
      "Transparent PNG preview uses the default checkerboard matte.";
  } else if (state.alphaBackdrop === "custom") {
    elements.alphaBackdropHint.textContent =
      `Transparent PNG preview uses your custom color ${state.alphaCustomColor}.`;
  } else {
    const preset = ALPHA_BACKDROP_PRESETS[state.alphaBackdrop];
    elements.alphaBackdropHint.textContent =
      `Transparent PNG preview uses the ${preset.label.toLowerCase()} matte.`;
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

function getAlphaBackdropDescription() {
  if (state.alphaBackdrop === "checker") {
    return "Checker preview";
  }
  if (state.alphaBackdrop === "custom") {
    return `Custom matte ${state.alphaCustomColor}`;
  }
  return `${ALPHA_BACKDROP_PRESETS[state.alphaBackdrop].label} matte`;
}

function applyAlphaBackdrop(link, display) {
  link.classList.remove("alpha-variant", "alpha-checker", "alpha-solid");
  link.style.removeProperty("--alpha-preview-bg");
  if (!display.isAlpha) {
    return;
  }

  link.classList.add("alpha-variant");
  if (state.alphaBackdrop === "checker") {
    link.classList.add("alpha-checker");
    return;
  }

  link.classList.add("alpha-solid");
  if (state.alphaBackdrop === "custom") {
    link.style.setProperty("--alpha-preview-bg", state.alphaCustomColor);
    return;
  }

  link.style.setProperty("--alpha-preview-bg", ALPHA_BACKDROP_PRESETS[state.alphaBackdrop].color);
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

  renderReferencePanel(items.length);
  elements.galleryTitle.textContent = `Style: ${state.categoryName}`;
  elements.gallerySubtitle.textContent =
    `${formatNumber(items.length)} generated images in this category · Transparent PNG · ${getAlphaBackdropDescription()}`;
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

    link.href = display.url || "#";
    if (!display.url) {
      link.setAttribute("aria-disabled", "true");
      image.removeAttribute("src");
    } else {
      link.removeAttribute("aria-disabled");
      image.src = display.url;
    }
    applyAlphaBackdrop(link, display);

    image.alt = `${item.text} rendered in ${item.style_class} with ${item.shape_class}`;
    title.textContent = item.text;
    meta.textContent =
      `Shape: ${item.shape_class} · ${display.label}` +
      (display.isAlpha ? ` · ${getAlphaBackdropDescription()}` : "");

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

  renderAlphaBackdropControls();
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
  for (const button of elements.alphaBackdropButtons) {
    button.addEventListener("click", () => {
      const nextBackdrop = button.dataset.backdrop;
      if (nextBackdrop === state.alphaBackdrop) {
        return;
      }
      state.alphaBackdrop = nextBackdrop;
      render();
    });
  }

  elements.alphaCustomColor.addEventListener("input", (event) => {
    state.alphaCustomColor = event.target.value;
    if (state.alphaBackdrop !== "custom") {
      state.alphaBackdrop = "custom";
    }
    render();
  });

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
