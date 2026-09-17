export type QualitySelection = {
  packageId?: string;
  batchId?: string;
};

const PACKAGE_PARAM = "package_id";
const BATCH_PARAM = "batch_id";

function selectionSearch(selection: QualitySelection): string {
  const params = new URLSearchParams();
  if (selection.packageId) params.set(PACKAGE_PARAM, selection.packageId);
  if (selection.batchId) params.set(BATCH_PARAM, selection.batchId);
  return params.toString();
}

export function qualityPagePath(selection: QualitySelection): string {
  const search = selectionSearch(selection);
  return search ? `/quality?${search}` : "/quality";
}

export function qualityWorkbenchPath(itemId: string, selection: QualitySelection): string {
  const search = selectionSearch(selection);
  return search ? `/work/${itemId}?${search}` : `/work/${itemId}`;
}

export function qualitySelectionFromSearch(search: URLSearchParams): QualitySelection {
  return {
    packageId: search.get(PACKAGE_PARAM) || undefined,
    batchId: search.get(BATCH_PARAM) || undefined,
  };
}
