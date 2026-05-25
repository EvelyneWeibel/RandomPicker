const state = {
  activeListId: null,
  lists: [],
  pickedItem: null,
  saveTimer: null,
  session: null,
  listSearchQuery: "",
  globalSearchQuery: ""
};

const SUPABASE_CONFIG = window.RANDOM_PICKER_SUPABASE || {};
let supabaseClient = null;
let zxingLoadPromise = null;

const LIST_ICONS = ["📋", "📚", "🎬", "🎲", "🍽️", "🛒", "🎁", "⭐", "💡", "🏠", "✈️", "🎮", "🎵", "🧩"];
const DEFAULT_LIST_ICON = LIST_ICONS[0];

const starterData = {
  activeListId: "default",
  lists: [
    {
      id: "default",
      name: "My first list",
      icon: DEFAULT_LIST_ICON,
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
  globalSearchInput: document.querySelector("#globalSearchInput"),
  globalSearchResults: document.querySelector("#globalSearchResults"),
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
  listIconInput: document.querySelector("#listIconInput"),
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
  listSearchInput: document.querySelector("#listSearchInput"),
  listSearchStatus: document.querySelector("#listSearchStatus"),
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
    icon: normalizeListIcon(list?.icon),
    hideTitles: Boolean(list?.hideTitles),
    items: Array.isArray(list?.items)
      ? list.items
          .map((item, index) => normalizeItem(item, index, usedNumbers))
          .filter((item) => item.title)
      : []
  };
}

function normalizeListIcon(icon) {
  return LIST_ICONS.includes(icon) ? icon : DEFAULT_LIST_ICON;
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
  const used = new Set(list.items.flatMap((item) => numberKeys(item.number)));
  let number = 1;
  while (used.has(String(number))) {
    number += 1;
  }
  return String(number);
}

function numberKeys(number) {
  const value = String(number || "").trim();
  if (!value) return [];
  const base = value.split(/[.-]/)[0];
  return base && base !== value ? [value, base] : [value];
}

function numberBase(number) {
  return String(number || "").trim().split(/[.-]/)[0];
}

function isSubNumber(number) {
  const value = String(number || "").trim();
  return Boolean(value && numberBase(value) !== value);
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
    .filter(isValidIsbn)
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
  const bestByBook = new Map();
  books.forEach((book) => {
    const key = formatBookTitle(book).toLowerCase();
    if (!book.title) return;
    const existing = bestByBook.get(key);
    const existingScore = existing?.sourceScore || 0;
    const bookScoreValue = book.sourceScore || 0;
    if (!existing || bookScoreValue > existingScore || (!existing.author && book.author)) {
      bestByBook.set(key, book);
    }
  });
  return [...bestByBook.values()];
}

async function fetchJson(url) {
  return fetchWithTimeout(url).then((response) => response.json());
}

async function fetchText(url) {
  return fetchWithTimeout(url).then((response) => response.text());
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function findBookMatches(isbns, candidates) {
  const lookups = [];

  isbnVariants(isbns).slice(0, 6).forEach((isbn) => {
    lookups.push(() => searchBnfByIsbn(isbn, 170));
    lookups.push(() => searchOpenLibraryByIsbnSearch(isbn, 150));
    lookups.push(() => searchOpenLibraryByIsbn(isbn, 145));
    lookups.push(() => searchOpenLibraryIsbnJson(isbn, 140));
    lookups.push(() => searchGoogleBooks(`isbn:${isbn}`, { language: "fr", country: "FR", sourceScore: 136 }));
    lookups.push(() => searchGoogleBooks(`isbn:${isbn}`, { sourceScore: 132 }));
  });

  candidates.slice(0, 4).forEach((candidate) => {
    lookups.push(() => searchGoogleBooks(`intitle:${candidate}`, { language: "fr", country: "FR", sourceScore: 116 }));
    lookups.push(() => searchGoogleBooks(candidate, { language: "fr", country: "FR", sourceScore: 112 }));
    lookups.push(() => searchOpenLibraryByTitle(candidate, "", 108));
    lookups.push(() => searchOpenLibraryByTitle(candidate, "fr", 104));
    lookups.push(() => searchOpenLibraryByQuery(candidate, 96));
    lookups.push(() => searchGoogleBooks(`intitle:${candidate}`, { sourceScore: 78 }));
    lookups.push(() => searchGoogleBooks(candidate, { sourceScore: 72 }));
  });

  const books = await collectBookLookups(lookups);
  return sortBooksByQuery(uniqueBooks(books), candidates, isbns).slice(0, 8);
}

async function collectBookLookups(lookups) {
  const results = await Promise.allSettled(lookups.map((lookup) => lookup()));
  return results
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value);
}

function isbnVariants(isbns) {
  const variants = [];
  isbns.forEach((isbn) => {
    variants.push(isbn);
    const isbn10 = isbn13To10(isbn);
    if (isbn10) variants.push(isbn10);
    const isbn13 = isbn10To13(isbn);
    if (isbn13) variants.push(isbn13);
  });
  return uniqueValues(variants);
}

function isValidIsbn(isbn) {
  const value = String(isbn || "").replace(/[^0-9Xx]/g, "").toUpperCase();
  if (value.length === 13) return isValidIsbn13(value);
  if (value.length === 10) return isValidIsbn10(value);
  return false;
}

function isValidIsbn13(isbn) {
  if (!/97[89]\d{10}/.test(isbn)) return false;
  let sum = 0;
  for (let index = 0; index < 12; index += 1) {
    sum += Number(isbn[index]) * (index % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10 === Number(isbn[12]);
}

function isValidIsbn10(isbn) {
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;
  let sum = 0;
  for (let index = 0; index < 10; index += 1) {
    const value = isbn[index] === "X" ? 10 : Number(isbn[index]);
    sum += value * (10 - index);
  }
  return sum % 11 === 0;
}

function isbn13To10(isbn) {
  const digits = String(isbn || "").replace(/\D/g, "");
  if (digits.length !== 13 || !digits.startsWith("978")) return "";
  const core = digits.slice(3, 12);
  let sum = 0;
  for (let index = 0; index < core.length; index += 1) {
    sum += Number(core[index]) * (10 - index);
  }
  const check = (11 - (sum % 11)) % 11;
  return `${core}${check === 10 ? "X" : check}`;
}

function isbn10To13(isbn) {
  const value = String(isbn || "").replace(/[^0-9Xx]/g, "").toUpperCase();
  if (value.length !== 10) return "";
  const core = `978${value.slice(0, 9)}`;
  let sum = 0;
  for (let index = 0; index < core.length; index += 1) {
    sum += Number(core[index]) * (index % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return `${core}${check}`;
}

function sortBooksByQuery(books, candidates, isbns) {
  const normalizedCandidates = candidates.map(normalizeSearchText);
  const hasIsbn = isbns.length > 0;
  return books.sort((a, b) => {
    return bookScore(b, normalizedCandidates, hasIsbn) - bookScore(a, normalizedCandidates, hasIsbn);
  });
}

function bookScore(book, normalizedCandidates, hasIsbn) {
  const title = normalizeSearchText(book.title);
  const titleVariants = searchTextVariants(title);
  const candidateVariants = normalizedCandidates.flatMap(searchTextVariants);
  const sourceBonus = book.sourceScore || 0;
  const authorBonus = book.author ? 8 : 0;
  const popularityBonus = Math.min(book.editionCount || 0, 80) * 0.8;
  const exactBonus = candidateVariants.some((candidate) => candidate && titleVariants.includes(candidate)) ? 180 : 0;
  const startsBonus = candidateVariants.some((candidate) => candidate && titleVariants.some((variant) => variant.startsWith(candidate))) ? 42 : 0;
  const includesBonus = candidateVariants.some((candidate) => candidate && titleVariants.some((variant) => variant.includes(candidate))) ? 32 : 0;
  const candidateIncludesBonus = candidateVariants.some((candidate) => candidate && titleVariants.some((variant) => candidate.includes(variant))) ? 16 : 0;
  const overlapBonus = Math.max(0, ...normalizedCandidates.map((candidate) => tokenOverlapScore(title, candidate)));
  const lengthPenalty = Math.max(0, ...normalizedCandidates.map((candidate) => titleLengthPenalty(title, candidate)));
  const isbnBonus = hasIsbn ? 20 : 0;
  return sourceBonus + authorBonus + popularityBonus + exactBonus + startsBonus + includesBonus + candidateIncludesBonus + overlapBonus + isbnBonus - lengthPenalty;
}

function searchTextVariants(text) {
  const normalized = normalizeSearchText(text);
  const compact = normalized.replace(/\s+/g, "");
  const variants = [normalized, compact];
  if (compact.startsWith("le")) variants.push(`l${compact.slice(2)}`);
  return uniqueValues(variants);
}

function tokenOverlapScore(title, candidate) {
  if (!title || !candidate) return 0;
  const titleWords = new Set(title.split(" ").filter((word) => word.length > 2));
  const candidateWords = candidate.split(" ").filter((word) => word.length > 2);
  if (!titleWords.size || !candidateWords.length) return 0;
  const matches = candidateWords.filter((word) => titleWords.has(word)).length;
  return (matches / candidateWords.length) * 28;
}

function titleLengthPenalty(title, candidate) {
  if (!title || !candidate || title === candidate || !title.includes(candidate)) return 0;
  const extraWords = title.split(" ").length - candidate.split(" ").length;
  return Math.max(0, extraWords) * 22;
}

function normalizeSearchText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`´]\s*/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function withTimeout(promise, milliseconds, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), milliseconds);
    })
  ]);
}

async function searchGoogleBooks(query, options = {}) {
  const params = new URLSearchParams({
    q: query,
    maxResults: "5",
    printType: "books"
  });
  if (options.language) params.set("langRestrict", options.language);
  if (options.country) params.set("country", options.country);
  const url = `https://www.googleapis.com/books/v1/volumes?${params.toString()}`;
  const data = await fetchJson(url);
  return (data.items || []).map((item) => ({
    title: item.volumeInfo?.title || "",
    author: (item.volumeInfo?.authors || []).slice(0, 2).join(", "),
    editionCount: 0,
    sourceScore: options.sourceScore || 0
  }));
}

async function searchBnfByIsbn(isbn, sourceScore = 0) {
  const params = new URLSearchParams({
    version: "1.2",
    operation: "searchRetrieve",
    query: `bib.isbn all "${isbn}"`,
    recordSchema: "dublincore",
    maximumRecords: "5"
  });
  const xmlText = await fetchText(`https://catalogue.bnf.fr/api/SRU?${params.toString()}`);
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  if (xml.querySelector("parsererror")) return [];

  return xmlElements(xml, "recordData")
    .map((record) => {
      const rawTitle = xmlTextContent(record, "title");
      const creator = xmlTextContent(record, "creator");
      const title = cleanBnfTitle(rawTitle);
      const author = cleanBnfAuthor(creator);
      return {
        title,
        author,
        editionCount: 0,
        sourceScore
      };
    })
    .filter((book) => book.title);
}

function xmlElements(root, localName) {
  return [...root.getElementsByTagNameNS("*", localName)];
}

function xmlTextContent(root, localName) {
  return xmlElements(root, localName)[0]?.textContent?.trim() || "";
}

function cleanBnfTitle(title) {
  return String(title || "")
    .replace(/\s*\/\s*.+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanBnfAuthor(author) {
  const cleaned = String(author || "")
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s*\.\s*Auteur.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const parts = cleaned.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length >= 2 ? `${parts.slice(1).join(" ")} ${parts[0]}` : cleaned;
}

async function searchOpenLibraryByIsbn(isbn, sourceScore = 0) {
  const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=data`;
  const data = await fetchJson(url);
  const book = data[`ISBN:${isbn}`];
  if (!book) return [];
  return [{
    title: book.title || "",
    author: (book.authors || []).map((author) => author.name).filter(Boolean).slice(0, 2).join(", "),
    editionCount: 0,
    sourceScore
  }];
}

async function searchOpenLibraryByIsbnSearch(isbn, sourceScore = 0) {
  const url = `https://openlibrary.org/search.json?isbn=${encodeURIComponent(isbn)}&limit=5&fields=title,author_name,edition_count`;
  const data = await fetchJson(url);
  return (data.docs || []).map((doc) => ({
    title: doc.title || "",
    author: (doc.author_name || []).slice(0, 2).join(", "),
    editionCount: doc.edition_count || 0,
    sourceScore
  }));
}

async function searchOpenLibraryIsbnJson(isbn, sourceScore = 0) {
  const book = await fetchJson(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`);
  const authorKeys = (book.authors || []).map((author) => author.key).filter(Boolean).slice(0, 2);
  const authorResults = await Promise.allSettled(authorKeys.map((key) => fetchJson(`https://openlibrary.org${key}.json`)));
  const author = authorResults
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value?.name)
    .filter(Boolean)
    .join(", ");

  return [{
    title: book.title || "",
    author,
    editionCount: 0,
    sourceScore
  }];
}

async function searchOpenLibraryByTitle(title, language = "", sourceScore = 0) {
  const params = new URLSearchParams({
    title,
    limit: "5",
    fields: "title,author_name,edition_count"
  });
  if (language === "fr") {
    params.set("lang", "fr");
    params.set("q", `${title} language:fre`);
    params.delete("title");
  }
  const url = `https://openlibrary.org/search.json?${params.toString()}`;
  const data = await fetchJson(url);
  return (data.docs || []).map((doc) => ({
    title: doc.title || "",
    author: (doc.author_name || []).slice(0, 2).join(", "),
    editionCount: doc.edition_count || 0,
    sourceScore
  }));
}

async function searchOpenLibraryByQuery(query, sourceScore = 0) {
  const params = new URLSearchParams({
    q: query,
    limit: "5",
    fields: "title,author_name,edition_count"
  });
  const url = `https://openlibrary.org/search.json?${params.toString()}`;
  const data = await fetchJson(url);
  return (data.docs || []).map((doc) => ({
    title: doc.title || "",
    author: (doc.author_name || []).slice(0, 2).join(", "),
    editionCount: doc.edition_count || 0,
    sourceScore
  }));
}

async function detectBarcodeIsbns(file) {
  const nativeIsbns = await detectNativeBarcodeIsbns(file);
  if (nativeIsbns.length) return nativeIsbns;
  try {
    return await detectZxingBarcodeIsbns(file);
  } catch {
    return [];
  }
}

async function detectNativeBarcodeIsbns(file) {
  if (!("BarcodeDetector" in window)) return [];
  try {
    const detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
    const bitmap = await createImageBitmap(file);
    const barcodes = await detector.detect(bitmap);
    bitmap.close?.();
    return barcodes
      .map((barcode) => String(barcode.rawValue || "").replace(/\D/g, ""))
      .filter(isValidIsbn);
  } catch {
    return [];
  }
}

async function detectZxingBarcodeIsbns(file) {
  const zxing = await loadZxing();
  const Reader = zxing.BrowserMultiFormatReader || zxing.BrowserMultiFormatOneDReader;
  if (!Reader) return [];

  const reader = new Reader();
  const url = URL.createObjectURL(file);
  try {
    const result = await withTimeout(
      reader.decodeFromImageUrl(url),
      7000,
      "Barcode scan took too long."
    );
    const text = String(result?.getText?.() || result?.text || "");
    return extractIsbns(text);
  } catch {
    return [];
  } finally {
    URL.revokeObjectURL(url);
    reader.reset?.();
  }
}

async function loadZxing() {
  if (window.ZXingBrowser) return window.ZXingBrowser;
  zxingLoadPromise ||= loadExternalScript("https://unpkg.com/@zxing/browser@0.2.0")
    .then(() => window.ZXingBrowser);
  const zxing = await zxingLoadPromise;
  if (!zxing) throw new Error("Barcode scanner could not load.");
  return zxing;
}

function loadExternalScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.append(script);
  });
}

async function recognizeBookText(file, logger) {
  try {
    return await window.Tesseract.recognize(file, "eng+fra", { logger });
  } catch {
    return window.Tesseract.recognize(file, "eng", { logger });
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
  const value = String(number || "").trim();
  const base = numberBase(value);
  const subNumber = isSubNumber(value);

  return !list.items.some((item, index) => {
    if (index === currentIndex) return false;
    const existing = String(item.number || "").trim();
    const existingBase = numberBase(existing);
    const existingSubNumber = isSubNumber(existing);

    if (existing === value) return true;
    if (!subNumber && existingSubNumber && existingBase === value) return true;
    if (subNumber && existing === base) return true;
    return false;
  });
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
    option.textContent = `${currentList.icon} ${currentList.name} (${currentList.items.length})`;
    option.selected = currentList.id === list.id;
    elements.listSelect.append(option);
  });

  elements.editorTitle.textContent = `${list.icon} ${list.name}`;
  elements.listNameInput.value = list.name;
  elements.listIconInput.value = list.icon;
  elements.listSearchInput.value = state.listSearchQuery;
  elements.globalSearchInput.value = state.globalSearchQuery;
  elements.hideTitlesInput.checked = list.hideTitles;
  updateManualNumberPlaceholder();
  elements.deleteListButton.disabled = state.lists.length < 2;
  elements.deleteAllButton.disabled = list.items.length === 0;
  elements.pickButton.disabled = list.items.length === 0;
  elements.deletePickedButton.disabled = !state.pickedItem;
  renderItems(list);
  renderGlobalSearchResults();

  if (state.pickedItem) {
    elements.pickedItem.textContent = displayItem(state.pickedItem, list);
  } else {
    elements.pickedItem.textContent = list.items.length ? "Pick something" : "Add items first";
  }
}

function renderListIconOptions() {
  elements.listIconInput.innerHTML = "";
  LIST_ICONS.forEach((icon) => {
    const option = document.createElement("option");
    option.value = icon;
    option.textContent = icon;
    elements.listIconInput.append(option);
  });
}

function renderItems(list) {
  elements.itemsList.innerHTML = "";
  const query = normalizeSearchText(state.listSearchQuery);
  const visibleItems = query
    ? list.items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => itemMatchesQuery(item, query))
    : list.items.map((item, index) => ({ item, index }));

  elements.listSearchStatus.textContent = query
    ? `${visibleItems.length} of ${list.items.length} items`
    : "";

  visibleItems.forEach(({ item, index }) => {
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

function itemMatchesQuery(item, normalizedQuery) {
  return normalizeSearchText(`${item.number} ${item.title}`).includes(normalizedQuery);
}

function renderGlobalSearchResults() {
  const query = normalizeSearchText(state.globalSearchQuery);
  elements.globalSearchResults.innerHTML = "";

  if (!query) {
    elements.globalSearchResults.hidden = true;
    return;
  }

  const matches = [];
  state.lists.forEach((list) => {
    list.items.forEach((item) => {
      if (itemMatchesQuery(item, query)) {
        matches.push({ list, item });
      }
    });
  });

  elements.globalSearchResults.hidden = false;
  if (!matches.length) {
    const empty = document.createElement("p");
    empty.className = "search-empty";
    empty.textContent = "No items found";
    elements.globalSearchResults.append(empty);
    return;
  }

  matches.slice(0, 12).forEach(({ list, item }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = `
      <span class="global-result-list"></span>
      <span class="global-result-item"></span>
    `;
    button.querySelector(".global-result-list").textContent = `${list.icon} ${list.name}`;
    button.querySelector(".global-result-item").textContent = `${item.number} · ${item.title}`;
    button.addEventListener("click", () => {
      state.activeListId = list.id;
      state.listSearchQuery = item.title;
      elements.listSearchInput.value = state.listSearchQuery;
      state.pickedItem = null;
      queueSave();
      render();
      elements.listSearchInput.focus();
    });
    elements.globalSearchResults.append(button);
  });

  if (matches.length > 12) {
    const more = document.createElement("p");
    more.className = "search-empty";
    more.textContent = `${matches.length - 12} more matches`;
    elements.globalSearchResults.append(more);
  }
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

    if (!window.Tesseract?.recognize) {
      elements.scanStatus.textContent = "No barcode found. Text scan could not load. Try Search ISBN or title below.";
      return;
    }

    elements.scanStatus.textContent = "No barcode found. Reading visible text...";
    const result = await withTimeout(recognizeBookText(file, (message) => {
      if (message.status === "recognizing text") {
        const percent = Math.round((message.progress || 0) * 100);
        elements.scanStatus.textContent = `Reading text... ${percent}%`;
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
  const rows = [["number", "title"], ...list.items.map((item) => [item.number, item.title])];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${list.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "list"}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

elements.listSelect.addEventListener("change", () => {
  state.activeListId = elements.listSelect.value;
  state.listSearchQuery = "";
  state.pickedItem = null;
  queueSave();
  render();
});

elements.listSearchInput.addEventListener("input", () => {
  state.listSearchQuery = elements.listSearchInput.value;
  renderItems(activeList());
});

elements.globalSearchInput.addEventListener("input", () => {
  state.globalSearchQuery = elements.globalSearchInput.value;
  renderGlobalSearchResults();
});

elements.newListButton.addEventListener("click", () => {
  const name = prompt("List name", "New list");
  if (!name) return;
  const list = { id: createId(), name: name.trim() || "New list", icon: DEFAULT_LIST_ICON, hideTitles: false, items: [] };
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
  elements.editorTitle.textContent = `${list.icon} ${list.name}`;
  const selectedOption = elements.listSelect.querySelector(`option[value="${CSS.escape(list.id)}"]`);
  if (selectedOption) selectedOption.textContent = `${list.icon} ${list.name} (${list.items.length})`;
  queueSave();
});

elements.listIconInput.addEventListener("change", () => {
  const list = activeList();
  if (!list) return;
  list.icon = normalizeListIcon(elements.listIconInput.value);
  elements.editorTitle.textContent = `${list.icon} ${list.name}`;
  const selectedOption = elements.listSelect.querySelector(`option[value="${CSS.escape(list.id)}"]`);
  if (selectedOption) selectedOption.textContent = `${list.icon} ${list.name} (${list.items.length})`;
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
      icon: DEFAULT_LIST_ICON,
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
  renderListIconOptions();

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
