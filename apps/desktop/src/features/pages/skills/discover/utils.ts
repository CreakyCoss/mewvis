export const formatStars = (stars: number) => {
  if (stars >= 1000) {
    return `${(stars / 1000).toFixed(1)}k`;
  }
  return String(stars);
};

export const formatMarketplaceUpdatedAt = (value?: string | null) => {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  const numericValue = Number(normalized);
  const date = Number.isFinite(numericValue)
    ? new Date(numericValue > 1_000_000_000_000 ? numericValue : numericValue * 1000)
    : new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
