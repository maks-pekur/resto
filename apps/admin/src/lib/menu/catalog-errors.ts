export interface ProblemDetails {
  readonly type?: string;
  readonly title?: string;
  readonly status?: number;
  readonly detail?: string;
  readonly message?: string;
  readonly code?: string;
}

export const friendlyCatalogError = (status: number, body: ProblemDetails | null): string => {
  if (status === 0) return 'Server error. Please try again.';
  if (body?.code === 'catalog.menu_category_not_found') return 'Category not found.';
  if (body?.code === 'catalog.menu_item_not_found') return 'Item not found.';
  if (body?.code === 'catalog.stop_list_item_not_found') return 'Item is not on the stop list.';
  if (status === 409 && body?.code === 'catalog.menu_category_slug_taken') {
    return 'A category with this name already exists.';
  }
  if (status === 404) return 'Not found.';
  if (status === 400) {
    return body?.message ?? body?.detail ?? 'Please check the form fields.';
  }
  if (status >= 500) return 'Server error. Please try again.';
  return body?.detail ?? `Request failed (${status.toString()}).`;
};
