# Open Source Projects

Demonstration data for exploring the task views. Tasks, statuses, priorities and dates are illustrative; they describe no actual commitments or repository findings.

- ⏳H8 Container Foundations - Review Shared Runtime and Build Images #foundations ^
  - ⏳H4 scratch - Maintain the Minimal Runtime Image #foundations-0
    - ⏳H1 20271215 Runtime User - Verify Runtime User Behavior #foundations-0-0 ^
    - 📄M2 Certificate Bundle - Verify Certificate Bundle Behavior #foundations-0-1
    - ⬜L3 Architecture Manifest - Verify Architecture Manifest Behavior #foundations-0-2
  - 📄M5 very-base - Maintain the Common Build Environment #foundations-1
    - 📄H2 Package Cache - Verify Package Cache Behavior #foundations-1-0
    - ⬜M3 Build User - Verify Build User Behavior #foundations-1-1
    - ✅L4 Compiler Updates - Verify Compiler Updates Behavior #foundations-1-2
  - ⬜L6 ubuntu-scratch - Maintain the Ubuntu Runtime Image #foundations-2
    - ⬜H3 Shared Libraries - Verify Shared Libraries Behavior #foundations-2-0 ^
    - ✅M4 Locale Support - Verify Locale Support Behavior #foundations-2-1
    - 🔀L5 Runtime Footprint - Verify Runtime Footprint Behavior #foundations-2-2
  - ✅H7 ubuntu-very-base - Maintain the Ubuntu Build Environment #foundations-3
    - ✅H4 Build Dependencies - Verify Build Dependencies Behavior #foundations-3-0
    - 🔀M5 Cache Ownership - Verify Cache Ownership Behavior #foundations-3-1
    - ⏸L1 Release Notes - Verify Release Notes Behavior #foundations-3-2
- 📄H7 Web Services - Coordinate Web Servers and Application Runtimes #web ^
  - 📄H4 nginx - Maintain the Headless Web Server #web-0
    - 📄H1 TLS Configuration - Verify TLS Configuration Behavior #web-0-0 ^
    - ⬜M2 Static Content - Verify Static Content Behavior #web-0-1
    - ✅L3 Header Tests - Verify Header Tests Behavior #web-0-2
  - ⬜M5 php-fpm - Maintain PHP Application Runtimes #web-1
    - ⬜H2 Extension Matrix - Verify Extension Matrix Behavior #web-1-0
    - ✅M3 Worker Limits - Verify Worker Limits Behavior #web-1-1
    - 🔀L4 Socket Permissions - Verify Socket Permissions Behavior #web-1-2
  - ✅L6 reverse-proxy - Route Services Through One Entry Point #web-2
    - ✅H3 Service Discovery - Verify Service Discovery Behavior #web-2-0 ^
    - 🔀M4 Certificate Renewal - Verify Certificate Renewal Behavior #web-2-1
    - ⏸L5 Access Logs - Verify Access Logs Behavior #web-2-2
  - 🔀H7 wordpress - Maintain the Publishing Application #web-3
    - 🔀H4 Plugin Updates - Verify Plugin Updates Behavior #web-3-0
    - ⏸M5 Upload Persistence - Verify Upload Persistence Behavior #web-3-1
    - ⬜L1 Login Journey - Verify Login Journey Behavior #web-3-2
- 🔀M6 Data Services - Coordinate Directory and Cache Services #data
  - ⬜H4 redis - Maintain the Cache Service #data-0
    - ⬜H1 Persistence - Verify Persistence Behavior #data-0-0 ^
    - ✅M2 Authentication - Verify Authentication Behavior #data-0-1
    - 🔀L3 Memory Limits - Verify Memory Limits Behavior #data-0-2
  - ✅M5 openldap - Maintain the Directory Service #data-1
    - ✅H2 Schema Changes - Verify Schema Changes Behavior #data-1-0
    - 🔀M3 TLS Connections - Verify TLS Connections Behavior #data-1-1
    - ⏸L4 Backup Restore - Verify Backup Restore Behavior #data-1-2
  - 🔀L6 bind - Maintain the DNS Service #data-2
    - 🔀H3 Zone Reload - Verify Zone Reload Behavior #data-2-0 ^
    - ⏸M4 Recursion Rules - Verify Recursion Rules Behavior #data-2-1
    - ⬜L5 Transfer Permissions - Verify Transfer Permissions Behavior #data-2-2
- ⏸M5 File Services - Coordinate File Transfer and Shared Storage #files
  - ✅H4 rsync - Maintain Reproducible File Transfers #files-0
    - ✅H1 Transfer Filters - Verify Transfer Filters Behavior #files-0-0 ^
    - 🔀M2 Interrupted Transfers - Verify Interrupted Transfers Behavior #files-0-1
    - ⏸L3 Destination Ownership - Verify Destination Ownership Behavior #files-0-2
  - 🔀M5 ssh-jump - Maintain the SSH Entry Point #files-1
    - 🔀H2 Host Keys - Verify Host Keys Behavior #files-1-0
    - ⏸M3 Forwarding Rules - Verify Forwarding Rules Behavior #files-1-1
    - ⬜L4 User Isolation - Verify User Isolation Behavior #files-1-2
  - ⏸L6 lizardfs-client - Maintain Access to Shared Storage #files-2
    - ⏸H3 Mount Recovery - Verify Mount Recovery Behavior #files-2-0 ^
    - ⬜M4 Client Compatibility - Verify Client Compatibility Behavior #files-2-1
    - ⏳L5 File Permissions - Verify File Permissions Behavior #files-2-2
- ⬜M6 Developer Tools - Coordinate Language Images and Development Tools #tools
  - 🔀H4 nodejs - Maintain the JavaScript Runtime #tools-0
    - 🔀H1 Runtime Updates - Verify Runtime Updates Behavior #tools-0-0 ^
    - ⏸M2 Signal Handling - Verify Signal Handling Behavior #tools-0-1
    - ⬜L3 Dependency Audit - Verify Dependency Audit Behavior #tools-0-2
  - ⏸M5 python - Maintain the Python Runtime #tools-1
    - ⏸H2 Package Installation - Verify Package Installation Behavior #tools-1-0
    - ⬜M3 Encoding - Verify Encoding Behavior #tools-1-1
    - ⏳L4 Dependency Audit - Verify Dependency Audit Behavior #tools-1-2
  - ⬜L6 vscode - Maintain the Development Environment #tools-2
    - ⬜H3 Extensions - Verify Extensions Behavior #tools-2-0 ^
    - ⏳M4 Workspace Settings - Verify Workspace Settings Behavior #tools-2-1
    - 📄L5 Terminal Access - Verify Terminal Access Behavior #tools-2-2
  - ⏳H7 webdesign-scanner - Capture Responsive Browser Views #tools-3
    - ⏳H4 Viewport Catalogue - Verify Viewport Catalogue Behavior #tools-3-0
    - 📄M5 Print Formats - Verify Print Formats Behavior #tools-3-1
    - ⬜L1 20271215 Authenticated Workflows - Verify Authenticated Workflows Behavior #tools-3-2
- ✅L3 Release Automation - Document Shared Build and Publication Checks #release
  - ⏸H4 GitHub Actions - Review the Reusable Docker Workflow #release-0
    - ⏸H1 Native Builds - Verify Native Builds Behavior #release-0-0 ^
    - ⬜M2 Test Gate - Verify Test Gate Behavior #release-0-1
    - ⏳L3 Source Labels - Verify Source Labels Behavior #release-0-2
  - ⬜M5 Docker Hub - Review Multi-Architecture Publication #release-1
    - ⬜H2 Access Token - Verify Access Token Behavior #release-1-0
    - ⏳M3 Version Tags - Verify Version Tags Behavior #release-1-1
    - 📄L4 Manifest Verification - Verify Manifest Verification Behavior #release-1-2
- ❌L1 Retired Experiment - Retain the Record of a Dropped Approach #retired
  - ⬜H4 Duplicated Pipelines - Replace Copies With the Shared Workflow #retired-0
    - ⬜H1 Workflow Copies - Verify Workflow Copies Behavior #retired-0-0 ^
    - ⏳M2 Manual Tag Lists - Verify Manual Tag Lists Behavior #retired-0-1

# foundations Container Foundations

## Scope

Keep runtime images small and build environments reproducible. Each component retains its own tasks and completion state.

## Acceptance

- Build on native amd64 and arm64 runners.
- Verify the unprivileged runtime user.
- Publish only after the complete regression passes.

# web Web Services

## Browser Verification

| Service | Verification |
| --- | --- |
| nginx | Static content and security headers |
| php-fpm | Application requests and worker configuration |
| reverse-proxy | Routing and certificate handling |

## Example Command

```bash
npm test
```

# tools Developer Tools

## Task Navigation

Switch between **Bubbles**, **Board** and **List** to inspect the same hierarchy. Open a parent to inspect its children. Export Markdown to keep the tree portable; export JSON to retain sprints, dependencies and history.
