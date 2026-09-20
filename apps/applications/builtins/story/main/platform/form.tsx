import type { ComponentPropsWithoutRef, SyntheticEvent } from "react";

/** Keep native validation and Enter semantics without invoking the iframe's blocked form navigation. */
export function ApplicationForm({
  onSubmit,
  onClickCapture,
  onKeyDown,
  ...props
}: ComponentPropsWithoutRef<"form">) {
  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (event.currentTarget.reportValidity()) onSubmit?.(event);
  };
  return (
    <form
      {...props}
      onSubmit={onSubmit}
      onClickCapture={(event) => {
        onClickCapture?.(event);
        if (event.defaultPrevented) return;
        const button =
          event.target instanceof Element
            ? event.target.closest("button")
            : null;
        if (
          button instanceof HTMLButtonElement &&
          button.form === event.currentTarget &&
          button.type === "submit" &&
          !button.disabled
        )
          submit(event);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (
          event.defaultPrevented ||
          event.nativeEvent.isComposing ||
          event.key !== "Enter" ||
          !(event.target instanceof HTMLInputElement)
        )
          return;
        const button = event.currentTarget.querySelector<HTMLButtonElement>(
          'button[type="submit"]',
        );
        if (button && !button.disabled) submit(event);
      }}
    />
  );
}
