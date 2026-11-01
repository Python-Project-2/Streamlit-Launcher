import * as vscode from 'vscode';
import type { DecisionTreeOptions } from './decisionTree';
export function treeOptionsFromSettings(): DecisionTreeOptions {
    const cfg = vscode.workspace.getConfiguration('dateSkunder');
    const num = (key: string, fallback: number) => {
        const raw = cfg.get<number>(key);
        return Number.isFinite(raw) ? (raw as number) : fallback;
    };
    return {
        maxDepth: num('tree.maxDepth', 6),
        testSplit: num('tree.testSplit', 0.25),
        seed: num('tree.seed', 42),
        minSamplesLeaf: num('tree.minSamplesLeaf', 2),
        minGainRatio: num('tree.minGainRatio', 0),
        maxBranches: num('tree.maxBranches', 20),
        mergeRare: cfg.get<boolean>('tree.mergeRare') ?? true,
        pruning: cfg.get<boolean>('tree.pruning') ?? true,
        validationSplit: num('tree.validationSplit', 0.2),
        cvFolds: num('tree.cvFolds', 5),
        cvMaxRows: num('tree.cvMaxRows', 2000),
    };
}
export function treeSettingsSummary(): string {
    const o = treeOptionsFromSettings();
    return `kedalaman maks ${o.maxDepth}, uji ${((o.testSplit ?? 0) * 100).toFixed(0)}%, seed ${o.seed}, minimal sampel daun ${o.minSamplesLeaf}, pemangkasan ${o.pruning ? 'aktif' : 'nonaktif'}, validasi silang ${o.cvFolds} lipatan`;
}
