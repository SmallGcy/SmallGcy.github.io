const MANIFEST_URL = "./data/style_font_lora_manifest.json?v=20260410-style-font-lora";
const ITEMS_PER_PAGE = 4;

const state = {
  manifest: null,
  categoryName: null,
  page: 1,
  imageVariant: "background",
};

const elements = {
  statItems: document.querySelector("#styleFontLoraStatItems"),
  statCategories: document.querySelector("#styleFontLoraStatCategories"),
  statAlpha: document.querySelector("#styleFontLoraStatAlpha"),
  variantHint: document.querySelector("#styleFontLoraVariantHint"),
  categoryCount: document.querySelector("#styleFontLoraCategoryCount"),
  categoryList: document.querySelector("#styleFontLoraCategoryList"),
  referenceVisual: document.querySelector("#styleFontLoraReferenceVisual"),
  referenceImage: document.querySelector("#styleFontLoraReferenceImage"),
  referencePlaceholder: document.querySelector("#styleFontLoraReferencePlaceholder"),
  referenceTitle: document.querySelector("#styleFontLoraReferenceTitle"),
  referenceCategory: document.querySelector("#styleFontLoraReferenceCategory"),
  referenceItemCount: document.querySelector("#styleFontLoraReferenceItemCount"),
  referenceStatus: document.querySelector("#styleFontLoraReferenceStatus"),
  referenceLink: document.querySelector("#styleFontLoraReferenceLink"),
  galleryTitle: document.querySelector("#styleFontLoraGalleryTitle"),
  gallerySubtitle: document.querySelector("#styleFontLoraGallerySubtitle"),
  galleryGrid: document.querySelector("#styleFontLoraGalleryGrid"),
  emptyState: document.querySelector("#styleFontLoraEmptyState"),
  pageInfo: document.querySelector("#styleFontLoraPageInfo"),
  prevPage: document.querySelector("#styleFontLoraPrevPage"),
  nextPage: document.querySelector("#styleFontLoraNextPage"),
  variantButtons: Array.from(
    document.querySelectorAll("#styleFontLoraVariantToggle .variant-button")
  ),
  imageCardTemplate: document.querySelector("#styleFontLoraImageCardTemplate"),
};

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function getCategories() {
  if (!state.manifest) {
    return [];
  }
  return (state.manifest.categories || []).filter((item) => item.item_count > 0);
}

function getGroups() {
  const groups = new Map();
  if (!state.manifest) {
    return groups;
  }

  for (const item of state.manifest.items) {
    if (!groups.has(item.category)) {
      groups.set(item.category, []);
    }
    groups.get(item.category).push(item);
  }

  for (const items of groups.values()) {
    items.sort((left, right) => left.numeric_id - right.numeric_id);
  }

  return groups;
}

function getReferenceByName(name) {
  return getCategories().find((item) => item.name === name) || null;
}

function getDisplayImage(item) {
  if (state.imageVariant === "alpha" && item.alpha_image_url) {
    return {
      url: item.alpha_image_url,
      label: "RGBA cutout",
      isAlpha: true,
    };
  }

  return {
    url: item.image_url,
    label: "RGB render",
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
  const categories = getCategories();
  const names = new Set(categories.map((item) => item.name));
  if (requestedCategory && names.has(requestedCategory)) {
    state.categoryName = requestedCategory;
  } else {
    state.categoryName = categories[0]?.name || null;
  }
}

function renderStats() {
  elements.statItems.textContent = formatNumber(state.manifest.counts.items);
  elements.statCategories.textContent = formatNumber(state.manifest.counts.categories);
  elements.statAlpha.textContent = formatNumber(state.manifest.counts.alpha_items);
}

function renderVariantButtons() {
  const hasAlphaImages = Boolean(state.manifest?.counts?.alpha_items);
  for (const button of elements.variantButtons) {
    button.classList.toggle("active", button.dataset.variant === state.imageVariant);
    button.disabled = button.dataset.variant === "alpha" && !hasAlphaImages;
  }
  elements.variantHint.textContent = hasAlphaImages
    ? "Switch between the original RGB render and the RGBA cutout from the pred subfolder."
    : "RGBA files are not available in the current manifest.";
}

function renderCategoryList() {
  const categories = getCategories();
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
  elements.referenceImage.alt = `${reference.name} example image`;
}

function renderReferencePanel(itemCount) {
  const reference = getReferenceByName(state.categoryName);

  if (!reference) {
    elements.referenceTitle.textContent = "Unknown category";
    elements.referenceCategory.textContent = "--";
    elements.referenceItemCount.textContent = "0";
    elements.referenceStatus.textContent = "Unavailable";
    elements.referenceLink.href = "#";
    elements.referenceLink.setAttribute("aria-disabled", "true");
    setReferenceVisual(null);
    return;
  }

  elements.referenceTitle.textContent = reference.name;
  elements.referenceCategory.textContent = reference.name;
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

function buildTags(item) {
  return [
    { label: "ID", value: item.id },
    { label: "Text", value: item.text },
    { label: "Folder", value: item.category },
  ];
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
  elements.galleryTitle.textContent = `Category: ${state.categoryName || "None"}`;
  elements.gallerySubtitle.textContent = `${formatNumber(items.length)} generated images in this folder`;
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
    const display = getDisplayImage(item);

    link.href = display.url;
    link.classList.toggle("alpha-variant", display.isAlpha);
    image.src = display.url;
    image.alt = `${item.text} generated in ${item.category}`;
    title.textContent = item.text;
    meta.textContent = `${display.label} · ${item.id}`;

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

  const categories = getCategories();
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
  elements.referenceCategory.textContent = "--";
  elements.referenceItemCount.textContent = "--";
  elements.referenceStatus.textContent = "Unavailable";
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
    renderError(
      "The style_font_lora manifest could not be loaded. Generate data/style_font_lora_manifest.json and try again."
    );
  }
}

init();
