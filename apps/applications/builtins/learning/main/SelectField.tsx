import type { ComponentPropsWithoutRef } from "react";

/** Keep native selection and keyboard behavior with one application appearance. */
export function SelectField(props: ComponentPropsWithoutRef<"select">) {
  return (
    <span className="learn-select-wrap">
      <select {...props} />
    </span>
  );
}
