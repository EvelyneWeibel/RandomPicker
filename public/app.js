const state = {
  activeListId: null,
  lists: [],
  pickedItem: null,
  saveTimer: null,
  session: null
};

const SUPABASE_CONFIG = window.RANDOM_PICKER_SUPABASE || {};
let supabaseClient = null;

const starterData = {
  activeListId: "default",
  lists: [
    {
      id: "default",
      name: "My first list",
      hideTitles: false,
      items: []
    }
  ]
};

const elements = {
  authPanel: document.querySelector("#authPanel"),
  authForm: document.querySelector("#authForm"),
  authEmailInput: document.querySelector("#authEmailInput"),
  authMessage: document.querySelector("#authMessage"),
  appShell: document.querySelector("#appShell"),
  listSelect: document.querySelector("#listSelect"),
  newListButton: document.querySelector("#newListButton"),
  workspaceButton: document.querySelector("#workspaceButton"),
  refreshButton: document.querySelector("#refreshButton"),
  pickButton: document.querySelector("#pickButton"),
  deletePickedButton: document.querySelector("#deletePickedButton"),
  pickedItem: document.querySelector("#pickedItem"),
  spinner: document.querySelector("#spinner"),
  stage: document.querySelector(".result-stage"),
  editorTitle: document.querySelector("#editorTitle"),
  deleteListButton: document.querySelector("#deleteListButton"),
  listNameInput: document.querySelector("#listNameInput"),
  hideTitlesInput: document.querySelector("#hideTitlesInput"),
  addItemForm: document.querySelector("#addItemForm"),
  newItemNumberInput: document.querySelector("#newItemNumberInput"),
  newItemTitleInput: document.querySelector("#newItemTitleInput"),
  scanButton: document.querySelector("#scanButton"),
  scanImageInput: document.querySelector("#scanImageInput"),
  scanStatus: document.querySelector("#scanStatus"),
  scanConfirmForm: document.querySelector("#scanConfirmForm"),
  scanNumberInput: document.querySelector("#scanNumberInput"),
  scanTitleInput: document.querySelector("#scanTitleInput"),
  scanCancelButton: document.querySelector("#scanCancelButton"),
  bookSearchForm: document.querySelector("#bookSearchForm"),
  bookSearchInput: document.querySelector("#bookSearchInput"),
  bookMatches: document.querySelector("#bookMatches"),
  fileInput: document.querySelector("#fileInput"),
  exportButton: document.querySelector("#exportButton"),
  deleteAllButton: document.querySelector("#deleteAllButton"),
  itemsList: document.querySelector("#itemsList"),
  itemTemplate: document.querySelector("#itemTemplate")
};

function activeList() {
  return state.lists.find((list) => list.id === state.activeListId) || state.lists[0];
}

function createId() {
  return `list-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isSupabaseConfigured() {
  return Boolean(SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey);
}

function configureSupabase() {
  if (!isSupabaseConfigured()) return;
  if (!window.supabase?.createClient) {
    throw new Error("Supabase client did not load.");
  }
  supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
}

async function refreshSession() {
  if (!supabaseClient) return null;
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;
  state.session = data.session;
  renderAuthState();
  return data.session;
}

function renderAuthState() {
  if (!isSupabaseConfigured()) {
    elements.authPanel.hidden = true;
    elements.appShell.hidden = false;
    elements.workspaceButton.textContent = "Local";
    return;
  }

  const isSignedIn = Boolean(state.session?.user);
  elements.authPanel.hidden = isSignedIn;
  elements.appShell.hidden = !isSignedIn;
  elements.workspaceButton.textContent = isSignedIn
    ? state.session.user.email || "Account"
    : "Sign in";
}

async function loadData() {
  if (isSupabaseConfigured()) {
    const session = state.session || await refreshSession();
    if (!session) {
      throw new Error("Sign in to load your picker.");
    }
    const { data, error } = await supabaseClient.rpc("random_picker_load");
    if (error) throw error;
    return data;
  }

  elements.workspaceButton.textContent = "Local";
  const response = await fetch("/api/lists");
  if (!response.ok) throw new Error("Could not load local lists. Add Supabase details in config.js for GitHub Pages.");
  return response.json();
}

async function saveData(data) {
  if (isSupabaseConfigured()) {
    const session = state.session || await refreshSession();
    if (!session) throw new Error("Sign in to save your picker.");
    const result = await supabaseClient.rpc("random_picker_save", { p_data: data });
    if (result.error) throw result.error;
    return result.data;
  }

  const response = await fetch("/api/lists", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error("Could not save local lists.");
  return response.json();
}

function normalizeList(list) {
  const usedNumbers = new Set();
  return {
    id: String(list?.id || createId()),
    name: String(list?.name || "Untitled list"),
    hideTitles: Boolean(list?.hideTitles),
    items: Array.isArray(list?.items)
      ? list.items
          .map((item, index) => normalizeItem(item, index, usedNumbers))
          .filter((item) => item.title)
      : []
  };
}

function normalizeItem(item, index, usedNumbers) {
  if (typeof item === "string") {
    return {
      number: nextAvailableNumber(String(index + 1), usedNumbers),
      title: item.trim()
    };
  }

  return {
    number: nextAvailableNumber(String(item?.number || index + 1).trim(), usedNumbers),
    title: String(item?.title || "").trim()
  };
}

function nextAvailableNumber(requestedNumber, usedNumbers) {
  let number = requestedNumber || "1";
  if (!usedNumbers.has(number)) {
    usedNumbers.add(number);
    return number;
  }

  let candidate = 1;
  while (usedNumbers.has(String(candidate))) {
    candidate += 1;
  }
  usedNumbers.add(String(candidate));
  return String(candidate);
}

function nextNumber(list) {
  const used = new Set(list.items.map((item) => item.number));
  let number = 1;
  while (used.has(String(number))) {
    number += 1;
  }
  return String(number);
}

function cleanScannedTitle(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function scannedTitleCandidates(text) {
  const seen = new Set();
  return text
    .split(/\r?\n/)
    .map((line) => cleanScannedTitle(line))
    .filter((line) => line.length >= 3)
    .filter((line) => /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(line))
    .filter((line) => {
      const normalized = line.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .sort((a, b) => scoreScannedLine(b) - scoreScannedLine(a))
    .slice(0, 8);
}

function scoreScannedLine(line) {
  const letterCount = (line.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) || []).length;
  const digitCount = (line.match(/\d/g) || []).length;
  const symbolCount = (line.match(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9 '\-:,&.]/g) || []).length;
  const lengthPenalty = Math.max(0, line.length - 80) * 0.8;
  const shortPenalty = line.length < 8 ? 8 : 0;
  return letterCount * 2 - digitCount - symbolCount * 4 - lengthPenalty - shortPenalty;
}

function extractIsbns(text) {
  const candidates = text.match(/(?:97[89][-\s]?)?(?:\d[-\s]?){9,12}[\dXx]/g) || [];
  const seen = new Set();
  return candidates
    .map((candidate) => candidate.replace(/[^0-9Xx]/g, "").toUpperCase())
    .filter((isbn) => isbn.length === 10 || isbn.length === 13)
    .filter((isbn) => {
      if (seen.has(isbn)) return false;
      seen.add(isbn);
      return true;
    });
}

function formatBookTitle(book) {
  return book.author ? `${book.title} - ${book.author}` : book.title;
}

function uniqueBooks(books) {
  const seen = new Set();
  return books.filter((book) => {
    const key = formatBookTitle(book).toLowerCase();
    if (!book.title || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

async function findBookMatches(isbns, candidates) {
  const lookups = [];

  isbns.slice(0, 3).forEach((isbn) => {
    lookups.push(searchGoogleBooks(`isbn:${isbn}`));
    lookups.push(searchOpenLibraryByIsbn(isbn));
  });

  candidates.slice(0, 4).forEach((candidate) => {
    lookups.push(searchGoogleBooks(`intitle:${candidate}`));
    lookups.push(searchOpenLibraryByTitle(candidate));
  });

  const results = await Promise.allSettled(lookups);
  const books = results
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value);

  return uniqueBooks(books).slice(0, 8);
}

function withTimeout(promise, milliseconds, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), milliseconds);
    })
  ]);
}

async function searchGoogleBooks(query) {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5`;
  const data = await fetchJson(url);
  return (data.items || []).map((item) => ({
    title: item.volumeInfo?.title || "",
    author: (item.volumeInfo?.authors || []).slice(0, 2).join(", ")
  }));
}

async function searchOpenLibraryByIsbn(isbn) {
  const url = `https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`;
  const data = await fetchJson(url);
  const author = Array.isArray(data.authors) && data.authors.length ? "Open Library" : "";
  return [{ title: data.title || "", author }];
}

async function searchOpenLibraryByTitle(title) {
  const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=5&fields=title,author_name`;
  const data = await fetchJson(url);
  return (data.docs || []).map((doc) => ({
    title: doc.title || "",
    author: (doc.author_name || []).slice(0, 2).join(", ")
  }));
}

async function detectBarcodeIsbns(file) {
  if (!("BarcodeDetector" in window)) return [];
  try {
    const detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
    const bitmap = await createImageBitmap(file);
    const barcodes = await detector.detect(bitmap);
    bitmap.close?.();
    return barcodes
      .map((barcode) => String(barcode.rawValue || "").replace(/\D/g, ""))
      .filter((value) => value.length === 10 || value.length === 13);
  } catch {
    return [];
  }
}

function updateManualNumberPlaceholder(force = false) {
  const list = activeList();
  if (!list) return;
  if (force || !elements.newItemNumberInput.value.trim()) {
    elements.newItemNumberInput.value = nextNumber(list);
  }
}

function isNumberUnique(list, number, currentIndex = -1) {
  return !list.items.some((item, index) => index !== currentIndex && item.number === number);
}

function displayItem(item, list = activeList()) {
  if (!item) return "";
  return list?.hideTitles ? item.number : item.title;
}

function pickedItemStillExists(list) {
  return state.pickedItem && list.items.some((item) => item.number === state.pickedItem.number);
}

async function loadLists() {
  const data = await loadData();
  const sourceData = data?.lists?.length ? data : starterData;
  state.lists = (sourceData.lists || []).map(normalizeList);
  state.activeListId = sourceData.activeListId || state.lists[0]?.id;
  state.pickedItem = null;
  render();
}

async function saveNow() {
  await saveData({
    activeListId: state.activeListId,
    lists: state.lists
  });
}

function queueSave() {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    saveNow().catch((error) => showMessage(error.message));
  }, 180);
}

function showMessage(message) {
  elements.pickedItem.textContent = message;
  elements.deletePickedButton.disabled = true;
}

function render() {
  const list = activeList();
  if (!list) return;

  if (!pickedItemStillExists(list)) {
    state.pickedItem = null;
  }

  elements.listSelect.innerHTML = "";
  state.lists.forEach((currentList) => {
    const option = document.createElement("option");
    option.value = currentList.id;
    option.textContent = `${currentList.name} (${currentList.items.length})`;
    option.selected = currentList.id === list.id;
    elements.listSelect.append(option);
  });

  elements.editorTitle.textContent = list.name;
  elements.listNameInput.value = list.name;
  elements.hideTitlesInput.checked = list.hideTitles;
  updateManualNumberPlaceholder();
  elements.deleteListButton.disabled = state.lists.length < 2;
  elements.deleteAllButton.disabled = list.items.length === 0;
  elements.pickButton.disabled = list.items.length === 0;
  elements.deletePickedButton.disabled = !state.pickedItem;
  renderItems(list);

  if (state.pickedItem) {
    elements.pickedItem.textContent = displayItem(state.pickedItem, list);
  } else {
    elements.pickedItem.textContent = list.items.length ? "Pick something" : "Add items first";
  }
}

function renderItems(list) {
  elements.itemsList.innerHTML = "";
  list.items.forEach((item, index) => {
    const row = elements.itemTemplate.content.firstElementChild.cloneNode(true);
    const inputs = row.querySelectorAll("input");
    const numberInput = inputs[0];
    const titleInput = inputs[1];
    const button = row.querySelector("button");

    numberInput.value = item.number;
    titleInput.value = item.title;

    numberInput.addEventListener("change", () => {
      const nextValue = numberInput.value.trim();
      if (!nextValue || !isNumberUnique(list, nextValue, index)) {
        numberInput.value = item.number;
        showMessage("Item numbers must be unique");
        return;
      }

      item.number = nextValue;
      if (state.pickedItem?.number === item.number) {
        state.pickedItem = item;
      }
      queueSave();
      render();
    });

    titleInput.addEventListener("input", () => {
      item.title = titleInput.value;
      if (state.pickedItem?.number === item.number) {
        state.pickedItem = item;
        elements.pickedItem.textContent = displayItem(item, list);
      }
      queueSave();
      renderPickerButtons();
    });

    titleInput.addEventListener("blur", () => {
      item.title = item.title.trim();
      list.items = list.items.filter((currentItem) => currentItem.title);
      queueSave();
      render();
    });

    button.addEventListener("click", () => {
      list.items.splice(index, 1);
      if (state.pickedItem?.number === item.number) state.pickedItem = null;
      queueSave();
      render();
    });

    elements.itemsList.append(row);
  });
}

function renderPickerButtons() {
  const list = activeList();
  elements.pickButton.disabled = !list || list.items.length === 0;
  elements.deletePickedButton.disabled = !state.pickedItem;
}

function pickRandomItem() {
  const list = activeList();
  if (!list?.items.length) {
    showMessage("Add items first");
    return;
  }

  elements.stage.classList.add("is-spinning");
  elements.pickedItem.classList.remove("pop");
  elements.deletePickedButton.disabled = true;

  let ticks = 0;
  const maxTicks = 18;
  const ticker = setInterval(() => {
    const preview = list.items[Math.floor(Math.random() * list.items.length)];
    elements.pickedItem.textContent = displayItem(preview, list);
    ticks += 1;
    if (ticks >= maxTicks) {
      clearInterval(ticker);
      state.pickedItem = list.items[Math.floor(Math.random() * list.items.length)];
      elements.pickedItem.textContent = displayItem(state.pickedItem, list);
      elements.stage.classList.remove("is-spinning");
      elements.pickedItem.classList.add("pop");
      elements.deletePickedButton.disabled = false;
    }
  }, 70);
}

function deletePickedItem() {
  const list = activeList();
  if (!state.pickedItem || !list) return;
  const index = list.items.findIndex((item) => item.number === state.pickedItem.number);
  if (index >= 0) {
    list.items.splice(index, 1);
    state.pickedItem = null;
    queueSave();
    render();
  }
}

function deleteAllItems() {
  const list = activeList();
  if (!list?.items.length) return;
  if (!confirm(`Delete all ${list.items.length} items from "${list.name}"?`)) return;
  list.items = [];
  state.pickedItem = null;
  queueSave();
  render();
}

function addItem(number, title) {
  const list = activeList();
  const cleanTitle = title.trim();
  const cleanNumber = (number.trim() || nextNumber(list));
  if (!cleanTitle || !list) return;
  if (!isNumberUnique(list, cleanNumber)) {
    showMessage("Item numbers must be unique");
    return;
  }

  list.items.push({ number: cleanNumber, title: cleanTitle });
  state.pickedItem = null;
  queueSave();
  render();
}

function showScanConfirmation(title) {
  const list = activeList();
  if (!list) return;

  elements.scanNumberInput.value = nextNumber(list);
  elements.scanTitleInput.value = title;
  elements.scanConfirmForm.hidden = false;
  elements.scanStatus.textContent = "Edit before confirming.";
  elements.scanTitleInput.focus();
}

function renderBookMatches(books) {
  elements.bookMatches.innerHTML = "";
  elements.bookMatches.hidden = books.length === 0;

  books.forEach((book) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = formatBookTitle(book);
    button.addEventListener("click", () => {
      elements.scanTitleInput.value = formatBookTitle(book);
      elements.scanNumberInput.value = elements.scanNumberInput.value.trim() || nextNumber(activeList());
      elements.scanConfirmForm.hidden = false;
      elements.scanTitleInput.focus();
    });
    elements.bookMatches.append(button);
  });
}

async function scanImage(file) {
  if (!file) return;
  if (!window.Tesseract?.recognize) {
    showMessage("OCR could not load. Check your connection and try again.");
    return;
  }

  const list = activeList();
  if (!list) return;

  elements.scanStatus.textContent = "Looking for ISBN/barcode...";
  elements.scanButton.disabled = true;
  elements.scanConfirmForm.hidden = true;
  elements.bookMatches.hidden = true;

  try {
    const barcodeIsbns = await detectBarcodeIsbns(file);
    if (barcodeIsbns.length) {
      elements.scanStatus.textContent = "ISBN found. Searching books...";
      const books = await findBookMatches(barcodeIsbns, []);
      renderBookMatches(books);
      if (books.length) {
        showScanConfirmation(formatBookTitle(books[0]));
        elements.scanStatus.textContent = "Choose a book match or edit before confirming.";
        return;
      }
    }

    elements.scanStatus.textContent = "No barcode found. Reading visible text...";
    const result = await withTimeout(window.Tesseract.recognize(file, "eng", {
      logger: (message) => {
        if (message.status === "recognizing text") {
          const percent = Math.round((message.progress || 0) * 100);
          elements.scanStatus.textContent = `Reading text... ${percent}%`;
        }
      }
    }), 25000, "Text scan took too long. Try typing the ISBN or title below.");

    const scannedText = result.data?.text || "";
    const candidates = scannedTitleCandidates(scannedText);
    const isbns = uniqueValues([...barcodeIsbns, ...extractIsbns(scannedText)]);
    const books = await findBookMatches(isbns, candidates);
    renderBookMatches(books);
    if (books.length) {
      showScanConfirmation(formatBookTitle(books[0]));
      elements.scanStatus.textContent = "Choose a book match or edit before confirming.";
    } else {
      elements.scanStatus.textContent = "No reliable book match found. Search ISBN or title below.";
    }
  } catch (error) {
    elements.scanStatus.textContent = error.message || "Scan failed.";
  } finally {
    elements.scanButton.disabled = false;
    elements.scanImageInput.value = "";
  }
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function parseUploadedList(fileName, text) {
  if (fileName.toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(text);
    const sourceItems = Array.isArray(parsed) ? parsed : parsed.items;
    if (Array.isArray(sourceItems)) {
      const usedNumbers = new Set();
      return sourceItems
        .map((item, index) => normalizeItem(item, index, usedNumbers))
        .filter((item) => item.title);
    }
    throw new Error("JSON files should be an array or an object with an items array.");
  }

  if (fileName.toLowerCase().endsWith(".csv")) {
    return parseCsvItems(text);
  }

  return text
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((title, index) => ({ number: String(index + 1), title }));
}

function parseCsvItems(text) {
  const rows = parseCsvRows(text).filter((row) => row.some((cell) => cell.trim()));
  if (!rows.length) return [];

  const firstRow = rows[0].map((cell) => cell.trim().toLowerCase());
  const hasHeader = firstRow[0] === "number" && firstRow[1] === "title";
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const usedNumbers = new Set();

  return dataRows.map((row, index) => {
    if (row.length !== 2) {
      throw new Error(`CSV row ${index + (hasHeader ? 2 : 1)} must have exactly two columns: number,title.`);
    }

    const number = row[0].trim();
    const title = row[1].trim();
    if (!number || !title) {
      throw new Error(`CSV row ${index + (hasHeader ? 2 : 1)} needs both a number and a title.`);
    }

    if (usedNumbers.has(number)) {
      throw new Error(`CSV number "${number}" is duplicated.`);
    }

    usedNumbers.add(number);
    return { number, title };
  });
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  if (inQuotes) {
    throw new Error("CSV has an unclosed quoted value.");
  }

  return rows;
}

function downloadActiveList() {
  const list = activeList();
  const blob = new Blob([JSON.stringify(list, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${list.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "list"}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

elements.listSelect.addEventListener("change", () => {
  state.activeListId = elements.listSelect.value;
  state.pickedItem = null;
  queueSave();
  render();
});

elements.newListButton.addEventListener("click", () => {
  const name = prompt("List name", "New list");
  if (!name) return;
  const list = { id: createId(), name: name.trim() || "New list", hideTitles: false, items: [] };
  state.lists.push(list);
  state.activeListId = list.id;
  state.pickedItem = null;
  queueSave();
  render();
});

elements.refreshButton.addEventListener("click", () => {
  loadLists().catch((error) => showMessage(error.message));
});

elements.workspaceButton.addEventListener("click", () => {
  if (!isSupabaseConfigured()) return;
  if (!state.session) {
    renderAuthState();
    return;
  }
  if (!confirm(`Sign out ${state.session.user.email}?`)) return;
  supabaseClient.auth.signOut().catch((error) => showMessage(error.message));
});

elements.pickButton.addEventListener("click", pickRandomItem);
elements.deletePickedButton.addEventListener("click", deletePickedItem);
elements.deleteAllButton.addEventListener("click", deleteAllItems);

elements.deleteListButton.addEventListener("click", () => {
  const list = activeList();
  if (state.lists.length < 2 || !list) return;
  if (!confirm(`Delete "${list.name}"?`)) return;
  state.lists = state.lists.filter((currentList) => currentList.id !== list.id);
  state.activeListId = state.lists[0].id;
  state.pickedItem = null;
  queueSave();
  render();
});

elements.listNameInput.addEventListener("input", () => {
  const list = activeList();
  if (!list) return;
  list.name = elements.listNameInput.value.trim() || "Untitled list";
  elements.editorTitle.textContent = list.name;
  const selectedOption = elements.listSelect.querySelector(`option[value="${CSS.escape(list.id)}"]`);
  if (selectedOption) selectedOption.textContent = `${list.name} (${list.items.length})`;
  queueSave();
});

elements.hideTitlesInput.addEventListener("change", () => {
  const list = activeList();
  if (!list) return;
  list.hideTitles = elements.hideTitlesInput.checked;
  if (state.pickedItem) {
    elements.pickedItem.textContent = displayItem(state.pickedItem, list);
  }
  queueSave();
});

elements.addItemForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addItem(elements.newItemNumberInput.value, elements.newItemTitleInput.value);
  updateManualNumberPlaceholder(true);
  elements.newItemTitleInput.value = "";
  elements.newItemTitleInput.focus();
});

elements.scanButton.addEventListener("click", () => {
  elements.scanImageInput.click();
});

elements.scanImageInput.addEventListener("change", () => {
  scanImage(elements.scanImageInput.files[0]);
});

elements.scanConfirmForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addItem(elements.scanNumberInput.value, elements.scanTitleInput.value);
  elements.scanConfirmForm.hidden = true;
  elements.bookMatches.hidden = true;
  elements.scanStatus.textContent = "";
  updateManualNumberPlaceholder(true);
});

elements.scanCancelButton.addEventListener("click", () => {
  elements.scanConfirmForm.hidden = true;
  elements.bookMatches.hidden = true;
  elements.scanStatus.textContent = "";
  elements.scanNumberInput.value = "";
  elements.scanTitleInput.value = "";
});

elements.bookSearchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = elements.bookSearchInput.value.trim();
  if (!query) return;

  try {
    elements.scanStatus.textContent = "Searching books...";
    elements.bookMatches.hidden = true;
    elements.scanConfirmForm.hidden = true;

    const isbns = extractIsbns(query);
    const books = await withTimeout(
      findBookMatches(isbns, isbns.length ? [] : [query]),
      12000,
      "Book search took too long. Try a more exact title or ISBN."
    );
    renderBookMatches(books);

    if (books.length) {
      showScanConfirmation(formatBookTitle(books[0]));
      elements.scanStatus.textContent = "Choose a book match or edit before confirming.";
    } else {
      elements.scanStatus.textContent = "No book match found. Try ISBN or a more exact title.";
    }
  } catch (error) {
    elements.scanStatus.textContent = error.message || "Book search failed.";
  }
});

elements.fileInput.addEventListener("change", async () => {
  const file = elements.fileInput.files[0];
  if (!file) return;
  try {
    const items = parseUploadedList(file.name, await file.text());
    const list = {
      id: createId(),
      name: file.name.replace(/\.[^.]+$/, "") || "Uploaded list",
      hideTitles: false,
      items
    };
    state.lists.push(list);
    state.activeListId = list.id;
    state.pickedItem = null;
    queueSave();
    render();
  } catch (error) {
    showMessage(error.message);
  } finally {
    elements.fileInput.value = "";
  }
});

elements.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = elements.authEmailInput.value.trim();
  if (!email) return;

  elements.authMessage.textContent = "Sending sign-in link...";
  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}${window.location.pathname}`
    }
  });

  elements.authMessage.textContent = error
    ? error.message
    : "Check your email for the sign-in link.";
});

elements.exportButton.addEventListener("click", downloadActiveList);

async function initializeApp() {
  configureSupabase();

  if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange((_event, session) => {
      state.session = session;
      renderAuthState();
      if (session) {
        loadLists().catch((error) => showMessage(error.message));
      }
    });
  }

  await refreshSession();
  if (!isSupabaseConfigured() || state.session) {
    await loadLists();
  }
}

initializeApp().catch((error) => {
  elements.authMessage.textContent = error.message;
  showMessage(error.message);
  renderAuthState();
});
