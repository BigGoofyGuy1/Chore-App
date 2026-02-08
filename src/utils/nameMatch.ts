export const normalizeName = (value?: string | null) =>
  (value ?? "").trim().toLowerCase();

export const namesMatch = (a?: string | null, b?: string | null) => {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  return Boolean(na) && na === nb;
};
