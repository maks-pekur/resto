import { toast } from 'sonner';

const DEFAULT_ERROR = 'Something went wrong. Please try again.';

export interface ToastOptions {
  readonly id?: string;
  readonly duration?: number;
}

export interface ActionResultLike {
  readonly ok?: boolean;
  readonly success?: boolean | { readonly id: string } | null;
  readonly error?: string | null;
}

const toToastOptions = (opts?: ToastOptions): { id?: string; duration?: number } | undefined => {
  if (!opts) return undefined;
  const out: { id?: string; duration?: number } = {};
  if (opts.id !== undefined) out.id = opts.id;
  if (opts.duration !== undefined) out.duration = opts.duration;
  return Object.keys(out).length > 0 ? out : undefined;
};

export const showError = (
  message: string | null | undefined,
  fallback: string = DEFAULT_ERROR,
  opts?: ToastOptions,
): void => {
  const toastOpts = toToastOptions(opts);
  const text = message ?? fallback;
  if (toastOpts) {
    toast.error(text, toastOpts);
  } else {
    toast.error(text);
  }
};

export const showSuccess = (message: string, opts?: ToastOptions): void => {
  const toastOpts = toToastOptions(opts);
  if (toastOpts) {
    toast.success(message, toastOpts);
  } else {
    toast.success(message);
  }
};

const isOk = (result: ActionResultLike): boolean => {
  if (result.ok === true) return true;
  if (result.ok === false) return false;
  if (result.success === true) return true;
  if (result.success !== null && typeof result.success === 'object') return true;
  return result.error == null && result.success !== false;
};

export const toastFromResult = (
  result: ActionResultLike,
  opts: {
    readonly successMessage?: string;
    readonly errorFallback?: string;
  } & ToastOptions = {},
): boolean => {
  if (isOk(result)) {
    if (opts.successMessage) {
      const { successMessage: _, errorFallback: __, ...toastOpts } = opts;
      showSuccess(opts.successMessage, toastOpts);
    }
    return true;
  }
  const { successMessage: _, errorFallback: __, ...toastOpts } = opts;
  showError(result.error, opts.errorFallback, toastOpts);
  return false;
};
