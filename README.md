# SAP Audit Extraction Cockpit

SAP BTP cockpit for planning audit extractions, reviewing extraction scope, visualizing ACTT outputs, and routing S/4HANA access through an API adapter.

![SAP Audit Extraction Cockpit dark mode preview](audit-cockpit-dark.png)

Suggested GitHub repository description:

```text
SAP BTP HTML5 cockpit for planning audit extractions, visualizing ACTT outputs, and routing S/4HANA access through an API adapter.
```

## What This App Does

This repository contains a SAP BTP application for audit extraction planning and S/4HANA integration.

The app currently provides:

- Guided extraction run setup for client, date range, output path, processing mode, and expert scope.
- Audit domain coverage.
- SAP source object and field catalogue.
- `.ACTT` output inventory.
- Dark/light HTML5 cockpit UI.
- Approuter route design with XSUAA protection.
- Node.js API adapter exposed under `/audit-api`.
- BTP deployment structure with MTA, destination, HTML5 app, and service modules.

The repository includes demo metadata for local preview:

```text
app/audit-cockpit/data/audit-program.json
```

## Current Status

This is a BTP-ready MVP. The UI, metadata parsing, local preview, MTA structure, approuter routing, XSUAA descriptor, and API adapter are implemented.

To make it production-ready, connect the app to a real S/4HANA destination, expose or bind the backend read endpoint, and add persistence for run history and evidence retention.

## Project Structure

```text
btp-audit-cockpit/
  app/
    audit-cockpit/       HTML5 cockpit UI
    router/              SAP approuter config
  srv/                   Node.js API adapter
  tools/                 metadata extraction script
  mta.yaml               BTP deployment descriptor
  xs-security.json       XSUAA role/scope descriptor
```

## Prerequisites

For local development:

- Node.js 20 or newer
- npm

For SAP BTP deployment:

- Cloud Foundry CLI
- MultiApps plugin
- MBT build tool
- SAP BTP subaccount with HTML5 Application Repository, Destination, Connectivity, and XSUAA services
- S/4HANA system reachable through Cloud Connector or an internet-facing destination

## Local Run

From this directory:

```sh
npm run start
```

Open:

```text
http://127.0.0.1:8080
```

Dark mode preview:

```text
http://127.0.0.1:8080/?theme=dark
```

Local mode uses the generated static metadata file. If `/audit-api` is unavailable, the UI falls back to:

```text
app/audit-cockpit/data/audit-program.json
```

## API Adapter

The approuter forwards `/audit-api/*` to the Node.js service in `srv/`.

Available endpoints:

- `GET /audit-api/health` checks the API adapter and configured destination name.
- `GET /audit-api/metadata` returns the parsed extractor catalogue.
- `POST /audit-api/extractions/plan` creates a server-side run plan from client/date/scope inputs.
- `POST /audit-api/s4/odata` proxies an allowed S/4HANA OData, RAP, or custom HTTP path through the BTP Destination service.
- `POST /audit-api/s4/read-source` calls a custom backend source-read endpoint.

Example run-plan request:

```json
{
  "client": "100",
  "startDate": "2026-01-01",
  "endDate": "2026-06-26",
  "mode": "Background",
  "partitionRecords": 100000,
  "sources": ["AGR_USERS", "USR02", "CDHDR"]
}
```

Example source-read request:

```json
{
  "source": "AGR_USERS",
  "fields": ["AGR_NAME", "UNAME", "FROM_DAT", "TO_DAT"],
  "filters": [
    {
      "field": "MANDT",
      "operator": "EQ",
      "value": "100"
    }
  ],
  "top": 1000,
  "skip": 0
}
```

The adapter forwards this request to:

```text
/sap/bc/http/sap/zaudit_extraction_api/read-source
```

## BTP Deployment

Build the MTA archive:

```sh
mbt build
```

Deploy to Cloud Foundry:

```sh
cf deploy mta_archives/audit-extraction-cockpit_1.0.0.mtar
```

Before deploying to a live system, replace the placeholder destination URL in `mta.yaml`.

## Configure S/4HANA Destination

Create a BTP destination named:

```text
S4HANA_AUDIT_BACKEND
```

Recommended destination setup:

- Type: HTTP
- Proxy type: `OnPremise` when using Cloud Connector, or `Internet` for externally reachable systems
- Authentication: choose the productive pattern used by your landscape, such as BasicAuthentication, PrincipalPropagation, OAuth2SAMLBearerAssertion, or OAuth2ClientCredentials
- URL: base URL of the S/4HANA system

The API adapter uses this destination through SAP Cloud SDK.

The destination name can be overridden with:

```text
S4_DESTINATION
```

Allowed backend path prefixes can be overridden with:

```text
S4_ALLOWED_PREFIXES
```

Default allowed prefixes:

```text
/sap/opu/odata,/sap/opu/odata4,/sap/bc/http/sap
```

## Backend Endpoint Contract

Implement or expose a backend endpoint that accepts source-read requests:

```text
POST /sap/bc/http/sap/zaudit_extraction_api/read-source
```

Minimum expected behavior:

- Validate the requested SAP source object against an allowlist.
- Validate requested fields against known metadata.
- Apply client, date, and business filters server-side.
- Support pagination using `top` and `skip`.
- Return structured JSON with rows, total count when available, and extraction metadata.
- Log request metadata for audit traceability.

Suggested response shape:

```json
{
  "source": "AGR_USERS",
  "count": 1000,
  "hasMore": true,
  "rows": [
    {
      "AGR_NAME": "Z_EXAMPLE_ROLE",
      "UNAME": "EXAMPLE_USER",
      "FROM_DAT": "20260101",
      "TO_DAT": "99991231"
    }
  ]
}
```

## Security Setup

The app includes `xs-security.json` for XSUAA integration.

Production setup should include:

- Create role collections in the SAP BTP cockpit.
- Assign real users or groups to the role collections.
- Keep destination credentials out of the repository.
- Route all backend access through approuter and XSUAA.
- Avoid committing customer names, system URLs, credentials, or extracted business data.

## Production Checklist

Use this list before calling the app complete:

- Real S/4HANA destination is created and reachable.
- Backend source-read endpoint is implemented and protected.
- `/audit-api/health` returns a successful response in BTP.
- `/audit-api/metadata` returns parsed metadata from the deployed service.
- `/audit-api/extractions/plan` returns a server-side plan.
- `/audit-api/s4/read-source` returns sample data from the target system.
- XSUAA role collections are mapped to real users or groups.
- Run history and evidence retention persistence are added if required.
- Transport and deployment pipeline checks are in place.
- No sensitive customer, system, credential, or extracted business data is committed.

## Useful Commands

Run local preview:

```sh
npm run start
```

Check JavaScript syntax:

```sh
node --check app/audit-cockpit/app.js
node --check tools/extract-audit-metadata.js
node --check srv/server.js
```

Build for BTP:

```sh
mbt build
```
