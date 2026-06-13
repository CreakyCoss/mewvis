type StatusBannerProps = {
  message: string;
};

export const StatusBanner = ({ message }: StatusBannerProps) => {
  if (!message) {
    return null;
  }

  return (
    <div className="mx-auto mb-3 max-w-5xl rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </div>
  );
};
