export const queryKeys = {
  me: ["me"] as const,
  projects: ["projects"] as const,
  users: ["users"] as const,
  datasets: (projectId?: string) => ["datasets", projectId] as const,
  packages: (projectId?: string) => ["packages", projectId] as const,
  packageItems: (packageId: string) => ["package-items", packageId] as const,
  myTasks: (review: boolean) => ["my-tasks", review] as const,
  stats: (projectId: string) => ["stats", projectId] as const,
  qualityItems: (packageId: string) => ["quality-items", packageId] as const,
  workContext: (itemId: string) => ["work-context", itemId] as const,
};
