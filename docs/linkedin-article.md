# SAP Audit Extraction Cockpit on SAP BTP

Audit extraction workflows need more than a technical run screen.

They need a clear scope, traceable outputs, secure backend access, and a user experience that makes the process easier to operate.

That is the idea behind this SAP Audit Extraction Cockpit: a SAP BTP-ready HTML5 application for planning audit extractions, reviewing extraction scope, visualizing ACTT outputs, and routing S/4HANA access through a controlled API layer.

## What the Cockpit Provides

The cockpit brings the key parts of an audit extraction workflow into one interface:

- extraction run setup
- client and date range selection
- processing mode selection
- expert scope selection
- audit domain overview
- SAP source object and field catalogue
- `.ACTT` output inventory
- S/4HANA API routing design
- BTP deployment structure

The goal is to make audit extraction planning easier to understand, easier to govern, and easier to connect to a cloud-native SAP landscape.

## SAP BTP Architecture

The application is structured around standard SAP BTP building blocks:

- HTML5 application for the cockpit UI
- Approuter for secured routing
- XSUAA for authentication and authorization
- Destination service for S/4HANA connectivity
- Node.js API adapter under `/audit-api`
- MTA deployment descriptor for Cloud Foundry deployment

This keeps the UI, security, routing, and backend access clearly separated.

## API Adapter

The Node.js adapter exposes endpoints for:

- health checks
- metadata retrieval
- extraction plan generation
- controlled S/4HANA OData/RAP/custom HTTP proxying
- source-read requests through a backend integration endpoint

The productive system can implement the backend integration through the pattern that best fits the SAP landscape: RAP, OData, or a custom HTTP endpoint.

## Why This Matters

Audit extraction is not only about pulling data.

It is also about control:

- what is in scope
- who can trigger or view extraction planning
- which backend paths are allowed
- how outputs are inventoried
- how the process can be deployed and governed on SAP BTP

A cockpit approach makes those concerns visible instead of burying them in technical execution details.

## Current State

The repository includes a BTP-ready MVP with:

- cockpit UI
- dark/light mode
- extraction metadata catalogue
- ACTT output inventory
- run-plan generator
- Node.js API adapter
- approuter configuration
- XSUAA descriptor
- MTA deployment setup
- production-readiness checklist

Production rollout still requires:

- real S/4HANA destination
- protected backend source-read endpoint
- role collection mapping
- run history persistence
- evidence retention model
- end-to-end extraction validation on a target system

## Repository

GitHub:

```text
https://github.com/sarper1998/sap-audit-extraction-cockpit
```

## Closing Thought

SAP audit tooling becomes more useful when it is visible, secure, and operationally clear.

This cockpit is a step toward that model: a BTP-ready interface for planning audit extractions, organizing outputs, and connecting securely to S/4HANA.
