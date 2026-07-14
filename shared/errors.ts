export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors: Record<string, string[] | string> = {},
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const notFound = (message = 'Kayit bulunamadi.') => new AppError(404, 'NOT_FOUND', message)
export const forbidden = (message = 'Bu islem icin yetkiniz yok.') => new AppError(403, 'FORBIDDEN', message)
export const conflict = (code: string, message: string) => new AppError(409, code, message)

