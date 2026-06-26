const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "..");
const sourcePath = process.env.AUDIT_METADATA_INPUT_PATH || process.env.AUDIT_SOURCE_PATH || path.join(root, "source", "Audit_Programi.txt");
const outputPath = path.join(__dirname, "..", "app", "audit-cockpit", "data", "audit-program.json");

if (!fs.existsSync(sourcePath)) {
  console.error(`Metadata input file not found: ${sourcePath}`);
  console.error("Set AUDIT_METADATA_INPUT_PATH before rebuilding metadata.");
  process.exit(1);
}

const source = fs.readFileSync(sourcePath, "utf8");
const lines = source.split(/\r?\n/);

const fixedDescriptions = {
  AGR_1016: "Generated authorization profiles assigned to roles.",
  AGR_1251: "Authorization object values maintained in PFCG roles.",
  AGR_1252: "Organizational-level values maintained for roles.",
  AGR_AGRS: "Composite-role to single-role relationships.",
  AGR_USERS: "User to role assignments, including validity dates.",
  BCC_GCC_Default_SAPR3_Password: "Default account password status for SAP*, DDIC, SAPCPIC, EARLYWATCH, and TMSADM.",
  CDHDR: "Role change document headers for PFCG objects.",
  CDPOS: "Role change document item details for AGR_DEFINE, CD1251, and AGR_USERS.",
  DEVACCESS: "Developer access keys.",
  PAHI: "System profile parameter history.",
  PRGN_CUST: "PFCG customizing settings.",
  RSUSR100N: "User change log extracted from standard report RSUSR100N.",
  SE06: "System change option and installation log details.",
  T000: "Client configuration.",
  T001: "Company code configuration.",
  T001B: "Posting period opening and closing configuration.",
  TADIR: "Repository object directory.",
  TRDIR: "ABAP program directory.",
  TSTC: "Transaction code definitions.",
  TSTCA: "Transaction authorization checks.",
  UST12: "Authorization field values inside generated profiles.",
  USR02: "User logon and password-control data.",
  USR21: "User master to address/person assignment.",
  USOBHASH: "S/4HANA authorization proposal hash data.",
};

const categoryRules = [
  {
    id: "security",
    title: "Security & Access",
    match: /^(AGR_|USR|UST|USOB|USORG|ADRP|SEC_POLICY|PRGN_|RSUSR|BCC_GCC)/i,
    risk: "Access governance, privileged users, role design, and user master controls.",
  },
  {
    id: "change",
    title: "Change Evidence",
    match: /^(CDHDR|CDPOS|USH|SE06|.*_LOGS|TPALOG|TBTCO|PAT03|DDPRS|DBTABLOG)/i,
    risk: "Change completeness, unauthorized changes, transport evidence, and period-bound audit logs.",
  },
  {
    id: "basis",
    title: "Basis & Custom Code",
    match: /^(TADIR|TRDIR|TRDIRT|TST|DD0|TDDAT|TVDIR|OBJH|CVERS|PRDVERS|SAPWL|SSM_|RSAU|CWBNT|T100|TCDOB|TSL1)/i,
    risk: "Custom code inventory, transaction catalog, technical object catalog, system version, and technical configuration.",
  },
  {
    id: "finance",
    title: "Finance & Controls",
    match: /^(T001|T003|T004|T009|T030|SKA|SKB|C00|MARV|NRIV|T055|T077|TKA|TCUR|TBSL|TBAER)/i,
    risk: "Financial configuration baseline, posting control, account determination, and organizational setup.",
  },
  {
    id: "assets",
    title: "Asset Accounting",
    match: /^(ANL|ANK|T082|T090|T091|T093|T095|T096)/i,
    risk: "Fixed asset master/configuration controls, depreciation areas, and valuation settings.",
  },
  {
    id: "procurement",
    title: "Procurement & MM",
    match: /^(T156|T159|T160|T161|T162|T163|T169|T16F|T683|T685|T687|T691|LFA|LFB|TVIMF)/i,
    risk: "Procure-to-pay configuration, vendor master baseline, tolerance, release strategy, and condition technique.",
  },
  {
    id: "sales",
    title: "Sales & Billing",
    match: /^(TVA|TVC|TVF|TVL|TVK)/i,
    risk: "Order-to-cash document control, billing configuration, copy control, and sales organization settings.",
  },
];

function categorize(name) {
  const rule = categoryRules.find((item) => item.match.test(name));
  return rule || {
    id: "other",
    title: "Other Extracts",
    risk: "Supporting configuration and audit context.",
  };
}

function cleanName(name) {
  return name.replace(/^ts_/i, "").replace(/_/g, "_").toUpperCase();
}

function parseField(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("*") || /^end of /i.test(trimmed)) return null;
  if (/^(data|types|select|if|else|endif|where|from|into|append|clear|describe)\b/i.test(trimmed)) return null;

  const match = trimmed.match(/^([a-z0-9_]+)(?:\((\d+)\))?\s+type\s+([^,.]+)[,.]?/i);
  if (!match) return null;

  return {
    name: match[1].toUpperCase(),
    length: match[2] ? Number(match[2]) : null,
    abapType: match[3].trim().replace(/\s+/g, " "),
  };
}

function parseTableDefinitions() {
  const definitions = [];
  for (let i = 0; i < lines.length; i += 1) {
    const start = lines[i].match(/^\s*types:\s*begin of\s+(ts_[a-z0-9_]+)/i);
    if (!start) continue;

    const typeName = start[1];
    const tableName = cleanName(typeName);
    const fields = [];
    let j = i + 1;

    for (; j < lines.length; j += 1) {
      if (new RegExp(`end of\\s+${typeName}`, "i").test(lines[j])) break;
      const field = parseField(lines[j]);
      if (field) fields.push(field);
    }

    const category = categorize(tableName);
    definitions.push({
      name: tableName,
      typeName,
      category: category.id,
      categoryTitle: category.title,
      fieldCount: fields.length,
      fields,
      outputFile: `${tableName}.ACTT`,
      optional: new RegExp(`istable_${tableName.toLowerCase()}\\s*=\\s*'Yes'`, "i").test(source),
      risk: category.risk,
      description: fixedDescriptions[tableName] || `${category.title} extract sourced from SAP object ${tableName}.`,
    });
    i = j;
  }

  const seen = new Set();
  return definitions.filter((item) => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
}

function parseOutputFiles(tables) {
  const names = new Set();
  const regexes = [
    /lv_file\s*=\s*'([^']+\.ACTT)'/gi,
    /perform\s+check_file\s+using\s+'([^']+\.ACTT)'/gi,
    /p_1906\s+.*?'([^']+\.ACTT)'/gi,
  ];

  for (const regex of regexes) {
    let match;
    while ((match = regex.exec(source))) {
      names.add(match[1]);
    }
  }

  names.add("ACTT_config_settings.ACTT");
  names.add("ACTT_config_recordcount.ACTT");
  names.add("ACTT_config_userinput.ACTT");

  const normalizedNames = new Set(
    [...names].map((name) =>
      name === "ACTT_config_tablerecordcount.ACTT" ? "ACTT_config_recordcount.ACTT" : name,
    ),
  );

  const sourceByFile = new Map(tables.map((table) => [`${table.name}.ACTT`, table]));
  return [...normalizedNames].sort((a, b) => a.localeCompare(b)).map((name) => {
    const baseName = name.replace(/\.ACTT$/i, "");
    const sourceObject = sourceByFile.get(name);
    const category = sourceObject ? categorize(sourceObject.name) : categorize(baseName);
    const type = name.includes("config")
      ? "Configuration"
      : name.includes("_LOGS") || ["RSUSR100N.ACTT", "SE06.ACTT"].includes(name)
        ? "Audit log"
        : "Data extract";
    const displayName = name;

    return {
      name,
      displayName,
      baseName,
      type,
      category: category.id,
      categoryTitle: category.title,
      sourceName: sourceObject ? sourceObject.name : null,
      delimiter: "|^|",
      description: fixedDescriptions[baseName] || (sourceObject ? sourceObject.description : `${type} generated by the ABAP extractor.`),
    };
  });
}

function parseInputs() {
  return [
    {
      id: "rb_back",
      label: "Background Processing",
      type: "radio",
      defaultValue: "X",
      sourceLine: 4523,
    },
    {
      id: "rb_fore",
      label: "Foreground Processing",
      type: "radio",
      sourceLine: 4524,
    },
    {
      id: "s_pclien",
      label: "Client",
      type: "client",
      required: true,
      sourceLine: 4525,
    },
    {
      id: "s_start",
      label: "Change Log Start Date",
      type: "date",
      required: true,
      sourceLine: 4526,
    },
    {
      id: "s_end",
      label: "Change Log End Date",
      type: "date",
      required: true,
      sourceLine: 4527,
    },
    {
      id: "p_file",
      label: "Output Path",
      type: "path",
      required: true,
      sourceLine: 4528,
    },
    {
      id: "ck_pop",
      label: "Expert Mode",
      type: "checkbox",
      defaultValue: "",
      sourceLine: 4543,
    },
    {
      id: "p_extracts",
      label: "Expert Extract Scope",
      type: "select-options",
      sourceLine: 4544,
    },
    {
      id: "p_msize",
      label: "Partition Record Count",
      type: "number",
      defaultValue: "100000",
      sourceLine: 4545,
    },
  ];
}

function groupSummary(tables) {
  const groups = new Map();
  for (const table of tables) {
    if (!groups.has(table.category)) {
      groups.set(table.category, {
        id: table.category,
        title: table.categoryTitle,
        sourceCount: 0,
        fieldCount: 0,
        optionalCount: 0,
        risk: table.risk,
        examples: [],
      });
    }
    const group = groups.get(table.category);
    group.sourceCount += 1;
    group.fieldCount += table.fieldCount;
    if (table.optional) group.optionalCount += 1;
    if (group.examples.length < 8) group.examples.push(table.name);
  }
  return [...groups.values()].sort((a, b) => b.sourceCount - a.sourceCount);
}

const tables = parseTableDefinitions();
const outputFiles = parseOutputFiles(tables);
const outputTableNames = new Set(outputFiles.map((item) => item.baseName.toUpperCase()));

for (const table of tables) {
  table.hasOutput = outputTableNames.has(table.name);
}

const metadata = {
  program: {
    report: "ZAUDIT_EXTRACTOR",
    sourceTitle: "Audit extraction metadata",
    sourcePath: "metadata/input",
    driveFolder: "SAP BTP Audit Extraction Cockpit",
    scriptVersion: "16.0",
    originalEncoding: "ISO-8859",
    convertedEncoding: "UTF-8",
    delimiter: "|^|",
    outputExtension: ".ACTT",
    lines: lines.length,
    byteSize: Buffer.byteLength(source, "utf8"),
    generatedAt: new Date().toISOString(),
  },
  inputs: parseInputs(),
  groups: groupSummary(tables),
  sources: tables,
  outputFiles,
  controls: [
    {
      id: "default-passwords",
      title: "Default Password Review",
      source: "BCC_GCC_Default_SAPR3_Password.ACTT",
      severity: "High",
      basis: "Checks SAP*, DDIC, SAPCPIC, EARLYWATCH, and TMSADM against known hashes.",
    },
    {
      id: "role-change-log",
      title: "PFCG Role Change Evidence",
      source: "CDHDR.ACTT / CDPOS.ACTT / RSUSR100N.ACTT",
      severity: "High",
      basis: "Filters role-related change documents and user change logs by audit start/end date.",
    },
    {
      id: "source-logging",
      title: "Critical Source Logging",
      source: "T000_LOGS.ACTT / PAHI_LOGS.ACTT / DEVACCESS_LOGS.ACTT / T001B_LOGS.ACTT",
      severity: "Medium",
      basis: "Runs RSVTPROT for enabled logging objects with DD09L-PROTOKOLL active.",
    },
    {
      id: "configuration-baseline",
      title: "Configuration Baseline",
      source: "Finance, MM, SD, Basis ACTT extracts",
      severity: "Medium",
      basis: "Creates a source-by-source baseline for customizing and master-data relevant settings.",
    },
  ],
  btpArchitecture: [
    "HTML5 audit cockpit served from SAP BTP HTML5 Application Repository",
    "Approuter with XSUAA-protected routes",
    "Node.js API adapter exposed under /audit-api",
    "Destination service entry for S/4HANA OData, RAP, or custom HTTP integration",
    "Optional CAP service for run scheduling, extractor metadata, and file inventory persistence",
    "Extraction metadata maintained as the operational planning baseline",
  ],
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(metadata, null, 2)}\n`);

console.log(`Wrote ${outputPath}`);
console.log(`${tables.length} source definitions, ${outputFiles.length} output files`);
