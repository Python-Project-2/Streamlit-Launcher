# Implementation Plan: Fix Decision Tree C4.5 Display & PDF Export

## Bug 1: Decision Tree C4.5 section not showing in UI

### Issue
The `analyzeSheet()` function in `src/analysis.ts` computes `decisionTreeAnalysis` and includes it in the returned `SheetResult`. The extension.ts sends this data via `postMessage()`, but `media/main.js` has no rendering code for the decision tree. The data is present in `sheet.decisionTreeAnalysis` but no UI section displays it.

### Root Cause
- No `decisionTreeSection(sheet)` function exists in main.js
- No nav entry for decision tree in the nav array (line ~225)
- No call to render the decision tree in the render() function

---

## Bug 2: PDF not saving to disk

### Issue
When exporting to PDF, the file dialog may open but the PDF is not written to disk after the user selects a save location.

### Root Cause
In `src/pdfGenerator.ts` (line ~823), the code does:
```typescript
const pdfBuf = Buffer.concat(chunks);
await vscode.workspace.fs.writeFile(saveUri, pdfBuf);
```

The `vscode.workspace.fs.writeFile()` API requires a `Uint8Array`, not a Node.js `Buffer`. While `Buffer` extends `Uint8Array` in theory, the VS Code extension host context may not handle the implicit conversion properly. Additionally, the suggested filename may not be passed correctly from main.js.

### Root Cause Details
- `pdfBuf` is a Node.js `Buffer` but should be explicitly converted to `Uint8Array`
- Missing explicit type coercion causes write failure in some extension host environments

---

# Implementation Steps

- [ ] 1. Add `decisionTreeSection(sheet)` function to media/main.js.
      Renders: accuracy/performance KPIs (accuracy, precision, recall, f1-score), feature importance bar chart, decision rules table, confusion matrix heatmap, split metrics table.
      Files: media/main.js
      Verify: npm run compile, then open a CSV file in VS Code and confirm the 🌳 Decision Tree C4.5 section appears between CSV Health and Notes sections.

- [ ] 2. Add decision tree nav entry to the nav array in media/main.js (around line 225).
      Add `['decisionTree', '🌳 Decision Tree C4.5']` after the `['csvhealth', ...]` entry and before `['notes', ...]`.
      Files: media/main.js
      Verify: npm run compile, reload the webview, and confirm the nav entry is clickable and scrolls to the decision tree section.

- [ ] 3. Add call to `decisionTreeSection(sheet)` in the render() function in media/main.js.
      Insert after `csvHealthSection(sheet)` (line ~279) so it appears between CSV Health analysis and Notes.
      Files: media/main.js
      Verify: npm run compile, reload webview, and confirm the decision tree section renders with all cards visible.

- [ ] 4. Fix PDF file write in src/pdfGenerator.ts.
      Wrap the `pdfBuf` (line ~1157) with explicit `Uint8Array()` constructor: change `await vscode.workspace.fs.writeFile(saveUri, pdfBuf)` to `await vscode.workspace.fs.writeFile(saveUri, new Uint8Array(pdfBuf))`.
      Files: src/pdfGenerator.ts
      Verify: npm run compile, open a CSV with a decision tree, click Export PDF, select a save location, and confirm the PDF file is created on disk and is not corrupted.

- [ ] 5. Verify decision tree data is being passed to PDF correctly.
      Confirm that in main.js exportToPdf() (line ~103-109), the `decisionTree: sheet.decisionTreeAnalysis` is included in the postMessage payload to extension.ts. Also verify pdfGenerator.ts includes decision tree rendering in the PDF around section 5.
      Files: media/main.js, src/pdfGenerator.ts
      Verify: npm run compile, export a CSV with decision tree to PDF, open the PDF, and confirm section 5 "ANALISIS MACHINE LEARNING: DECISION TREE C4.5" is present with performance metrics, confusion matrix, feature importance, and detailed calculations.

- [ ] 6. Compile and end-to-end test.
      Run npm run compile to build the extension. Open VS Code, load a CSV file with a suitable target attribute (categorical, 2-10 classes) using Date Skunder. Verify: (a) 🌳 Decision Tree C4.5 section appears in the UI with all visualizations; (b) nav entry is clickable; (c) Export to PDF works and saves the file with decision tree section fully rendered.
      Files: (all modified files)
      Verify: npm run compile produces no errors. VSCode extension loads. Data displays correctly. PDF export creates valid file with all sections.
