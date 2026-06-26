const state = {
  data: null,
  selectedMode: "Background",
  selectedTable: null,
  tableFilter: {
    query: "",
    category: "all",
    optionalOnly: false,
    withOutput: false,
  },
  outputFilter: {
    query: "",
    type: "all",
  },
  currentPlan: null,
  apiOnline: false,
  theme: "dark",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const formatNumber = (value) => new Intl.NumberFormat("en-US").format(value);
const getPlanSourceCount = (plan) => plan?.sourceCount ?? 0;

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function toDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setDefaultDates() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const form = $("#runForm");
  form.elements.startDate.value = toDateInput(start);
  form.elements.endDate.value = toDateInput(end);
}

async function loadData() {
  initTheme();
  state.data = await fetchJsonWithFallback("/audit-api/metadata", "data/audit-program.json");
  state.selectedTable = state.data.sources[0];
  buildUi();
  checkApiStatus();
}

async function fetchJsonWithFallback(primaryUrl, fallbackUrl, options) {
  try {
    const primaryResponse = await fetch(primaryUrl, { cache: "no-store", ...options });
    if (primaryResponse.ok) return primaryResponse.json();
  } catch (_error) {
    // Local static runs do not have the BTP API adapter. Fall through to the static file.
  }

  const fallbackResponse = await fetch(fallbackUrl, { cache: "no-store" });
  if (!fallbackResponse.ok) {
    throw new Error(`Metadata load failed: ${fallbackResponse.status}`);
  }
  return fallbackResponse.json();
}

function buildUi() {
  setDefaultDates();
  renderThemeButton();
  renderSourceMeta();
  renderMetrics();
  renderRunSummary();
  renderTimeline(false);
  renderDomains();
  renderCategoryFilter();
  renderTableCatalogue();
  renderOutputTypeFilter();
  renderOutputs();
  renderArchitecture();
  renderSourceMap();
  attachEvents();
}

function initTheme() {
  const requestedTheme = new URLSearchParams(window.location.search).get("theme");
  const savedTheme = localStorage.getItem("audit-cockpit-theme");
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  state.theme = ["dark", "light"].includes(requestedTheme)
    ? requestedTheme
    : savedTheme || (prefersDark ? "dark" : "light");
  document.documentElement.dataset.theme = state.theme;
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = state.theme;
  localStorage.setItem("audit-cockpit-theme", state.theme);
  renderThemeButton();
}

function renderThemeButton() {
  const label = $("#themeLabel");
  if (!label) return;
  label.textContent = state.theme === "dark" ? "Light" : "Dark";
}

async function checkApiStatus() {
  try {
    const response = await fetch("/audit-api/health", { cache: "no-store" });
    state.apiOnline = response.ok;
  } catch (_error) {
    state.apiOnline = false;
  }

  const apiStatus = $("#apiStatus");
  const readiness = $("#integrationReadiness");
  if (state.apiOnline) {
    apiStatus.textContent = "API online";
    apiStatus.className = "status-pill status-ready";
    readiness.textContent = "Destination reachable";
  } else {
    apiStatus.textContent = "Local preview";
    apiStatus.className = "status-pill status-warn";
    readiness.textContent = "Static fallback active";
  }
}

function renderSourceMeta() {
  const { program } = state.data;
  $("#sourceMeta").innerHTML = [
    `${escapeHtml(program.scriptVersion)} release`,
    `${formatNumber(program.lines)} lines`,
    `${escapeHtml(program.delimiter)} delimiter`,
  ]
    .map((item) => `<span class="status-pill status-neutral">${item}</span>`)
    .join("");
}

function renderMetrics() {
  const { program, sources, outputFiles, groups } = state.data;
  const optionalCount = sources.filter((source) => source.optional).length;
  const metrics = [
    {
      label: "Extracts",
      value: sources.length,
      note: `${optionalCount} optional checks`,
      icon: "T",
    },
    {
      label: "ACTT Files",
      value: outputFiles.length,
      note: `${program.outputExtension} exports`,
      icon: "F",
    },
    {
      label: "Domains",
      value: groups.length,
      note: "audit scoped groups",
      icon: "D",
    },
    {
      label: "Source",
      value: Math.round(program.byteSize / 1024),
      note: "KB converted UTF-8",
      icon: "S",
    },
  ];

  $("#metrics").innerHTML = metrics
    .map(
      (metric) => `
        <article class="metric">
          <div class="metric-header">
            <span>${escapeHtml(metric.label)}</span>
            <span class="metric-icon" aria-hidden="true">${escapeHtml(metric.icon)}</span>
          </div>
          <strong>${formatNumber(metric.value)}</strong>
          <span>${escapeHtml(metric.note)}</span>
        </article>
      `,
    )
    .join("");
}

function renderRunSummary() {
  const form = $("#runForm");
  const plan = state.currentPlan;
  const values = [
    {
      label: "Client",
      value: form?.elements.client.value || "100",
    },
    {
      label: "Scope",
      value: plan ? `${formatNumber(getPlanSourceCount(plan))} extracts` : "Full extractor",
    },
    {
      label: "Output",
      value: plan ? `${formatNumber(plan.outputCount)} files` : state.data.program.outputExtension,
    },
  ];

  $("#runSummary").innerHTML = values
    .map(
      (item) => `
        <div class="summary-item">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
        </div>
      `,
    )
    .join("");
}

function renderTimeline(generated) {
  const steps = generated
    ? [
        ["Inputs validated", "Client, date range, output path, and partition size are ready."],
        ["Extraction scope resolved", `${getPlanSourceCount(state.currentPlan)} sources mapped to ACTT output files.`],
        ["BTP route prepared", "HTML5 app, approuter, XSUAA, and destination descriptors are in place."],
        ["Source artifact retained", "ABAP extractor remains read-only and traceable to Drive source."],
      ]
    : [
        ["Source parsed", "ABAP report, fields, source definitions, and output files are indexed."],
        ["Controls mapped", "Default passwords, role changes, change logs, and configuration baseline are separated."],
        ["Run setup pending", "Plan generation will bind the selected inputs to the extracted catalogue."],
      ];

  $("#timeline").innerHTML = steps
    .map(
      ([title, text]) => `
        <div class="timeline-item">
          <span class="timeline-dot" aria-hidden="true"></span>
          <div>
            <strong>${escapeHtml(title)}</strong>
            <span>${escapeHtml(text)}</span>
          </div>
        </div>
      `,
    )
    .join("");
}

function renderDomains() {
  $("#domainCount").textContent = `${state.data.groups.length} domains`;
  $("#domainGrid").innerHTML = state.data.groups
    .map(
      (group) => `
        <article class="domain-card">
          <h4>${escapeHtml(group.title)}</h4>
          <p class="table-desc">${escapeHtml(group.risk)}</p>
          <div class="domain-stats">
            <span class="mini-chip">${formatNumber(group.sourceCount)} extracts</span>
            <span class="mini-chip">${formatNumber(group.fieldCount)} fields</span>
            <span class="mini-chip">${formatNumber(group.optionalCount)} optional</span>
          </div>
          <div class="domain-examples">
            ${group.examples.map((item) => `<span class="mini-chip">${escapeHtml(item)}</span>`).join("")}
          </div>
        </article>
      `,
    )
    .join("");
}

function renderCategoryFilter() {
  const options = [
    `<option value="all">All domains</option>`,
    ...state.data.groups.map((group) => `<option value="${escapeHtml(group.id)}">${escapeHtml(group.title)}</option>`),
  ];
  $("#categoryFilter").innerHTML = options.join("");
}

function getFilteredSources() {
  const query = state.tableFilter.query.trim().toLowerCase();
  return state.data.sources.filter((table) => {
    const matchesQuery =
      !query ||
      table.name.toLowerCase().includes(query) ||
      table.categoryTitle.toLowerCase().includes(query) ||
      table.description.toLowerCase().includes(query) ||
      table.fields.some((field) => field.name.toLowerCase().includes(query));

    const matchesCategory = state.tableFilter.category === "all" || table.category === state.tableFilter.category;
    const matchesOptional = !state.tableFilter.optionalOnly || table.optional;
    const matchesOutput = !state.tableFilter.withOutput || table.hasOutput;
    return matchesQuery && matchesCategory && matchesOptional && matchesOutput;
  });
}

function renderTableCatalogue() {
  const sources = getFilteredSources();
  $("#catalogueCount").textContent = `${formatNumber(sources.length)} shown`;

  if (!sources.includes(state.selectedTable)) {
    state.selectedTable = sources[0] || state.data.sources[0];
  }

  $("#tableRows").innerHTML = sources
    .map(
      (table) => `
        <tr data-table="${escapeHtml(table.name)}" class="${state.selectedTable?.name === table.name ? "is-selected" : ""}">
          <td>
            <span class="table-name">${escapeHtml(table.name)}</span>
            <span class="table-desc">${escapeHtml(table.description)}</span>
          </td>
          <td>${escapeHtml(table.categoryTitle)}</td>
          <td>${formatNumber(table.fieldCount)}</td>
          <td>${table.hasOutput ? escapeHtml(table.outputFile) : "Mapped"}</td>
          <td>${table.optional ? '<span class="status-pill status-warn">Optional</span>' : '<span class="status-pill status-ready">Core</span>'}</td>
        </tr>
      `,
    )
    .join("");

  renderTableDetail();
}

function renderTableDetail() {
  const table = state.selectedTable;
  if (!table) {
    $("#tableDetail").innerHTML = "<p>No extract selected.</p>";
    return;
  }

  const fields = table.fields.slice(0, 80);
  $("#tableDetail").innerHTML = `
    <h3>${escapeHtml(table.name)}</h3>
    <span class="status-pill status-info">${escapeHtml(table.categoryTitle)}</span>
    <p>${escapeHtml(table.risk)}</p>
    <div class="domain-stats">
      <span class="mini-chip">${formatNumber(table.fieldCount)} fields</span>
      <span class="mini-chip">${escapeHtml(table.outputFile)}</span>
      <span class="mini-chip">${table.optional ? "Optional" : "Core"}</span>
    </div>
    <div class="field-list">
      ${fields
        .map(
          (field) => `
            <div class="field-row">
              <strong>${escapeHtml(field.name)}</strong>
              <span>${escapeHtml(field.length ? `${field.abapType} (${field.length})` : field.abapType)}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderOutputTypeFilter() {
  const types = [...new Set(state.data.outputFiles.map((file) => file.type))].sort();
  $("#outputTypeFilter").innerHTML = [
    `<option value="all">All types</option>`,
    ...types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`),
  ].join("");
}

function getFilteredOutputs() {
  const query = state.outputFilter.query.trim().toLowerCase();
  return state.data.outputFiles.filter((file) => {
    const matchesQuery =
      !query ||
      file.name.toLowerCase().includes(query) ||
      file.type.toLowerCase().includes(query) ||
      file.categoryTitle.toLowerCase().includes(query) ||
      (file.sourceName || "").toLowerCase().includes(query);
    const matchesType = state.outputFilter.type === "all" || file.type === state.outputFilter.type;
    return matchesQuery && matchesType;
  });
}

function renderOutputs() {
  const outputs = getFilteredOutputs();
  $("#outputCount").textContent = `${formatNumber(outputs.length)} shown`;
  $("#outputRows").innerHTML = outputs
    .map(
      (file) => `
        <tr>
          <td>
            <span class="table-name">${escapeHtml(file.displayName || file.name)}</span>
            <span class="table-desc">${escapeHtml(file.description)}</span>
          </td>
          <td>${escapeHtml(file.type)}</td>
          <td>${escapeHtml(file.categoryTitle)}</td>
          <td>${escapeHtml(file.sourceName || "-")}</td>
          <td><code>${escapeHtml(file.delimiter)}</code></td>
        </tr>
      `,
    )
    .join("");
}

function renderArchitecture() {
  const nodes = [
    ["HTML5 App", "Audit cockpit, static metadata, source catalogue"],
    ["Approuter", "XSUAA route protection and destination routing"],
    ["S/4HANA Destination", "Backend integration point for ABAP or OData"],
    ["CAP Extension", "Run history and artifact inventory when needed"],
  ];
  $("#architectureMap").innerHTML = nodes
    .map(
      ([title, text]) => `
        <div class="architecture-node">
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(text)}</span>
        </div>
      `,
    )
    .join("");

  $("#architectureList").innerHTML = state.data.btpArchitecture
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
}

function renderSourceMap() {
  $("#inputList").innerHTML = state.data.inputs
    .map(
      (input) => `
        <div class="input-item">
          <strong>${escapeHtml(input.label)}</strong>
          <span>${escapeHtml(input.id)} · ${escapeHtml(input.type)} · line ${escapeHtml(input.sourceLine)}</span>
        </div>
      `,
    )
    .join("");

  $("#controlList").innerHTML = state.data.controls
    .map(
      (control) => `
        <div class="control-item">
          <strong>${escapeHtml(control.title)}</strong>
          <span>${escapeHtml(control.severity)} · ${escapeHtml(control.source)}</span>
          <span>${escapeHtml(control.basis)}</span>
        </div>
      `,
    )
    .join("");
}

function validateInputs() {
  const form = $("#runForm");
  const client = form.elements.client.value.trim();
  const startDate = form.elements.startDate.value;
  const endDate = form.elements.endDate.value;
  const outputPath = form.elements.outputPath.value.trim();
  const partition = Number(form.elements.partition.value);
  const issues = [];

  if (!/^\d{3}$/.test(client)) issues.push("Client must be three digits.");
  if (!startDate || !endDate || new Date(startDate) > new Date(endDate)) issues.push("Date range is invalid.");
  if (!outputPath.includes("/") && !outputPath.includes("\\")) issues.push("Output path must include a path separator.");
  if (!Number.isFinite(partition) || partition < 1) issues.push("Partition records must be a positive number.");

  const status = $("#runStatus");
  if (issues.length) {
    status.textContent = `${issues.length} issue${issues.length > 1 ? "s" : ""}`;
    status.className = "status-pill status-warn";
    return { valid: false, issues };
  }

  status.textContent = "Validated";
  status.className = "status-pill status-ready";
  return { valid: true, issues: [] };
}

async function generatePlan() {
  const validation = validateInputs();
  if (!validation.valid) return;

  const form = $("#runForm");
  const expertMode = form.elements.expertMode.checked;
  const requested = form.elements.tableList.value
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

  const selectedTables =
    expertMode && requested.length
      ? state.data.sources.filter((table) => requested.includes(table.name))
      : state.data.sources;

  const selectedNames = new Set(selectedTables.map((table) => table.name));
  const selectedOutputs = state.data.outputFiles.filter((file) => !file.sourceName || selectedNames.has(file.sourceName));

  const localPlan = {
    generatedAt: new Date().toISOString(),
    mode: state.selectedMode,
    client: form.elements.client.value.trim(),
    startDate: form.elements.startDate.value,
    endDate: form.elements.endDate.value,
    outputPath: form.elements.outputPath.value.trim(),
    partitionRecords: Number(form.elements.partition.value),
    expertMode,
    sourceCount: selectedTables.length,
    outputCount: selectedOutputs.length,
    sources: selectedTables.map((table) => table.name),
    outputFiles: selectedOutputs.map((file) => file.displayName || file.name),
  };

  state.currentPlan = await requestServerPlan(localPlan);

  $("#planScope").textContent = expertMode && requested.length ? "Expert scope" : "Full scope";
  $("#preparationValue").textContent = "100%";
  $("#preparationBar").style.width = "100%";
  renderRunSummary();
  renderTimeline(true);
}

async function requestServerPlan(localPlan) {
  try {
    const response = await fetch("/audit-api/extractions/plan", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        client: localPlan.client,
        startDate: localPlan.startDate,
        endDate: localPlan.endDate,
        mode: localPlan.mode,
        partitionRecords: localPlan.partitionRecords,
        sources: localPlan.sources,
      }),
    });

    if (response.ok) {
      return response.json();
    }
  } catch (_error) {
    // The static local server has no API adapter. Use the browser-built plan.
  }

  return localPlan;
}

async function downloadRunPlan() {
  if (!state.currentPlan) await generatePlan();
  if (!state.currentPlan) return;

  const blob = new Blob([`${JSON.stringify(state.currentPlan, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "audit-run-plan.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function setView(viewName) {
  $$(".nav-item").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === viewName);
  });
  $$(".view").forEach((view) => {
    view.classList.toggle("is-active", view.id === viewName);
  });
}

function copyDeployCommand() {
  const command = "mbt build && cf deploy mta_archives/audit-extraction-cockpit_1.0.0.mtar";
  navigator.clipboard?.writeText(command);
}

function attachEvents() {
  $$(".nav-item").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  $$(".segment").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedMode = button.dataset.mode;
      $$(".segment").forEach((segment) => segment.classList.toggle("is-selected", segment === button));
      renderRunSummary();
    });
  });

  $("#validateButton").addEventListener("click", validateInputs);
  $("#planButton").addEventListener("click", () => generatePlan());
  $("#downloadPlanButton").addEventListener("click", () => downloadRunPlan());
  $("#copyDeployButton").addEventListener("click", copyDeployCommand);
  $("#themeButton").addEventListener("click", toggleTheme);

  $("#runForm").addEventListener("input", () => {
    $("#runStatus").textContent = "Draft";
    $("#runStatus").className = "status-pill";
    renderRunSummary();
  });

  $("#tableSearch").addEventListener("input", (event) => {
    state.tableFilter.query = event.target.value;
    renderTableCatalogue();
  });

  $("#categoryFilter").addEventListener("change", (event) => {
    state.tableFilter.category = event.target.value;
    renderTableCatalogue();
  });

  $("#optionalFilter").addEventListener("change", (event) => {
    state.tableFilter.optionalOnly = event.target.checked;
    renderTableCatalogue();
  });

  $("#outputFilter").addEventListener("change", (event) => {
    state.tableFilter.withOutput = event.target.checked;
    renderTableCatalogue();
  });

  $("#tableRows").addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-table]");
    if (!row) return;
    state.selectedTable = state.data.sources.find((table) => table.name === row.dataset.table);
    renderTableCatalogue();
  });

  $("#outputSearch").addEventListener("input", (event) => {
    state.outputFilter.query = event.target.value;
    renderOutputs();
  });

  $("#outputTypeFilter").addEventListener("change", (event) => {
    state.outputFilter.type = event.target.value;
    renderOutputs();
  });
}

loadData().catch((error) => {
  document.body.innerHTML = `
    <main class="content">
      <section class="panel">
        <h1>SAP Audit Extraction Cockpit</h1>
        <p>${escapeHtml(error.message)}</p>
      </section>
    </main>
  `;
});
