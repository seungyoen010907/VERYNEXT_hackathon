/** API가 그대로 사용자에게 보여줄 수 있는 오류 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError(404, "NOT_FOUND", `${what}을(를) 찾을 수 없습니다.`);
export const forbidden = (message = "이 작업을 할 권한이 없습니다.") => new AppError(403, "FORBIDDEN", message);
export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, "BAD_REQUEST", message, details);
