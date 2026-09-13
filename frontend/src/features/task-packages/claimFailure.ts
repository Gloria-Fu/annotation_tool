export function claimFailureTitle(review: boolean): string {
  return `领取${review ? "审核" : "标注"}失败`;
}

export function claimFailureMessage(error: Error): string {
  return error.message || "请求未完成，请检查网络连接后重试。";
}
